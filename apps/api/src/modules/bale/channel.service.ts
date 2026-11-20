import { BadRequestException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { randomToken, SecretBox } from '../../common/crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { BaleHttpAdapter } from './bale-http.adapter';
import { MockBaleAdapter } from './mock-bale.adapter';
import { MessengerAdapter } from './messenger.types';

export const SECRET_BOX = 'SECRET_BOX'; export const APP_ENV = 'APP_ENV';
import type { Env } from '../../config/env';

/**
 * مدیریت اتصال ربات هر فروشگاه + ساخت Adapter.
 *
 * ⚠️ تصمیم «ربات مرکزی یا اختصاصی» و «مالکیت کیف پول/مقصد وجوه» هنوز با بله روشن نشده است
 * (docs/decisions/0001-bale-payments.md). تا آن زمان فقط حالت DEDICATED (ربات اختصاصی هر فروشگاه) ساخته می‌شود
 * و هیچ وجهی در حساب پلتفرم جمع نمی‌شود.
 */
@Injectable()
export class ChannelService implements OnApplicationBootstrap {
  private readonly log = new Logger('ChannelService');
  private readonly mocks = new Map<string, MockBaleAdapter>();
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, @Inject(SECRET_BOX) private readonly box: SecretBox, @Inject(APP_ENV) private readonly env: Env) {}

  /**
   * فقط برای اجرای روی لپ‌تاپ با تونل موقت (آدرس عمومی هر بار عوض می‌شود): با REWIRE_WEBHOOKS_ON_BOOT=true
   * وب‌هوک همهٔ رباتِ فعال در هر بار بالا آمدن روی PUBLIC_API_URL فعلی دوباره ثبت می‌شود. در حالت عادی غیرفعال است.
   */
  async onApplicationBootstrap() {
    if (process.env.REWIRE_WEBHOOKS_ON_BOOT !== 'true' || this.env.baleMode !== 'http') return;
    const conns = await this.prisma.system.channelConnection.findMany({ where: { channel: 'BALE', status: 'ACTIVE' } });
    for (const c of conns) {
      try { await this.forConnection(c).setWebhook(`${this.env.publicApiUrl}/webhooks/bale/${c.webhookKey}`); this.log.log(`webhook re-registered for ${c.id}`); }
      catch (e) { this.log.error(`webhook re-register failed for ${c.id}: ${(e as Error).message}`); }
    }
  }

  async connectBale(tenantId: string, userId: string, storeId: string, botToken: string) {
    const webhookKey = randomToken(24);
    const adapter = this.build(botToken, `tmp-${webhookKey}`);
    const me = await adapter.getMe().catch(() => { throw new BadRequestException('توکن ربات نامعتبر است یا بله در دسترس نیست'); });
    const conn = await this.prisma.withTenant(tenantId, async (tx) => {
      const store = await tx.store.findFirst({ where: { id: storeId, tenantId } }); if (!store) throw new NotFoundException('فروشگاه یافت نشد');
      const data = { botUsername: me.username, botTokenEnc: this.box.encrypt(botToken), webhookKey, status: 'PENDING' as const, mode: 'DEDICATED' as const, lastError: null };
      const c = await tx.channelConnection.upsert({ where: { tenantId_storeId_channel: { tenantId, storeId, channel: 'BALE' } }, create: { tenantId, storeId, channel: 'BALE', ...data }, update: data });
      await this.audit.logTx(tx, { tenantId, actorUserId: userId, action: 'channel.connect', entityType: 'channel_connection', entityId: c.id, metadata: { channel: 'BALE', botUsername: me.username } });
      return c;
    });
    await adapter.setWebhook(`${this.env.publicApiUrl}/webhooks/bale/${webhookKey}`);
    await this.prisma.withTenant(tenantId, (tx) => tx.channelConnection.update({ where: { id: conn.id }, data: { status: 'ACTIVE' } }));
    return { id: conn.id, botUsername: me.username, status: 'ACTIVE' };
  }
  async list(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) => tx.channelConnection.findMany({ where: { tenantId }, select: { id: true, storeId: true, channel: true, mode: true, botUsername: true, status: true, lastError: true, createdAt: true, providerTokenEnc: true } }))
      .then((rows) => rows.map(({ providerTokenEnc, ...r }) => ({ ...r, paymentsConfigured: !!providerTokenEnc }))); // توکن‌ها هرگز بازگردانده نمی‌شوند
  }
  /** Adapter یک اتصال را می‌سازد؛ توکن فقط در حافظه سرور رمزگشایی می‌شود. */
  forConnection(conn: { id: string; botTokenEnc: string | null; providerTokenEnc?: string | null }): MessengerAdapter {
    if (!conn.botTokenEnc) throw new Error('توکن ربات تنظیم نشده است');
    const own = conn.providerTokenEnc ? this.box.decrypt(conn.providerTokenEnc) : undefined;
    return this.build(this.box.decrypt(conn.botTokenEnc), conn.id, own);
  }
  /** ثبت/حذف توکن پرداخت خود فروشنده (مقدار خالی = حذف). توکن هرگز بازگردانده نمی‌شود. */
  async setPaymentToken(tenantId: string, userId: string, storeId: string, providerToken: string) {
    const t = providerToken.trim();
    return this.prisma.withTenant(tenantId, async (tx) => {
      const c = await tx.channelConnection.findFirst({ where: { tenantId, storeId, channel: 'BALE' } });
      if (!c) throw new NotFoundException('ابتدا ربات فروشگاه را وصل کنید');
      await tx.channelConnection.update({ where: { id: c.id }, data: { providerTokenEnc: t ? this.box.encrypt(t) : null } });
      await this.audit.logTx(tx, { tenantId, actorUserId: userId, action: t ? 'channel.payment_token.set' : 'channel.payment_token.clear', entityType: 'channel_connection', entityId: c.id, metadata: {} });
      return { paymentsConfigured: !!t };
    });
  }
  private build(token: string, key: string, sellerProviderToken?: string): MessengerAdapter {
    if (this.env.baleMode === 'mock') { let m = this.mocks.get(key); if (!m) { m = new MockBaleAdapter(); this.mocks.set(key, m); } return m; }
    if (!this.env.baleApiBaseUrl) throw new Error('BALE_API_BASE_URL باید از مستندات رسمی بله تنظیم شود');
    return new BaleHttpAdapter({ token, baseUrl: this.env.baleApiBaseUrl, providerToken: sellerProviderToken || this.env.baleProviderToken, sellerOwnedProviderToken: !!sellerProviderToken });
  }
  mockFor(connId: string) { return this.mocks.get(connId); }
}
