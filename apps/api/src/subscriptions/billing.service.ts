import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

const PERIOD_MS = 30 * 86400_000;

/**
 * صورتحساب اشتراک پلتفرم. توجه: هنوز درگاه پرداخت پلتفرم وصل نیست؛
 * فروشنده صورتحساب «باز» می‌گیرد و پس از پرداخت (مثلاً کارت‌به‌کارت) مدیر کل آن را تأیید می‌کند.
 * این مبلغ حق‌اشتراک خود پلتفرم است، نه وجه مشتریان فروشگاه.
 */
@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async requestRenewal(tenantId: string, userId: string, planId: string) {
    const plan = await this.prisma.system.plan.findFirst({ where: { id: planId, isActive: true } });
    if (!plan) throw new NotFoundException('پلن یافت نشد');
    return this.prisma.withTenant(tenantId, async (tx) => {
      const sub = await tx.subscription.findFirst({ where: { tenantId }, orderBy: { currentPeriodEnd: 'desc' } });
      if (!sub) throw new ConflictException('اشتراکی برای این کسب‌وکار ثبت نشده است');
      const open = await tx.subscriptionInvoice.findFirst({ where: { tenantId, subscriptionId: sub.id, status: 'OPEN' } });
      if (open) throw new ConflictException('یک صورتحساب پرداخت‌نشده دارید؛ ابتدا آن را تسویه یا از مدیر لغو بخواهید');
      const start = new Date(Math.max(Date.now(), sub.currentPeriodEnd.getTime()));
      const inv = await tx.subscriptionInvoice.create({ data: { tenantId, subscriptionId: sub.id, planId: plan.id, amount: plan.priceAmount, periodStart: start, periodEnd: new Date(start.getTime() + PERIOD_MS) } });
      await this.audit.logTx(tx, { tenantId, actorUserId: userId, action: 'billing.invoice_requested', entityType: 'subscription_invoice', entityId: inv.id, metadata: { plan: plan.code, amount: plan.priceAmount.toString() } });
      return inv;
    });
  }

  /** تأیید پرداخت توسط مدیر کل؛ فقط یک بار (OPEN → PAID به‌صورت اتمیک) و اشتراک را فعال/تمدید می‌کند. */
  async markPaid(adminUserId: string, invoiceId: string, providerRef: string, ip?: string) {
    return this.prisma.system.$transaction(async (tx) => {
      const claimed = await tx.subscriptionInvoice.updateMany({ where: { id: invoiceId, status: 'OPEN' }, data: { status: 'PAID', paidAt: new Date(), providerRef } });
      if (claimed.count !== 1) throw new ConflictException('صورتحساب یافت نشد یا قبلاً تسویه/لغو شده است');
      const inv = await tx.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
      const sub = await tx.subscription.findUniqueOrThrow({ where: { id: inv.subscriptionId } });
      const start = new Date(Math.max(Date.now(), sub.currentPeriodEnd.getTime()));
      const end = new Date(start.getTime() + PERIOD_MS);
      await tx.subscription.update({ where: { id: sub.id }, data: { planId: inv.planId ?? sub.planId, status: 'ACTIVE', currentPeriodStart: start, currentPeriodEnd: end } });
      await tx.subscriptionInvoice.update({ where: { id: inv.id }, data: { periodStart: start, periodEnd: end } });
      await tx.auditLog.create({ data: { tenantId: inv.tenantId, actorUserId: adminUserId, actorType: 'PLATFORM_ADMIN', action: 'billing.invoice_paid', entityType: 'subscription_invoice', entityId: inv.id, ip, metadata: { providerRef, amount: inv.amount.toString() } } });
      return { invoiceId: inv.id, status: 'PAID', periodEnd: end };
    });
  }

  async voidInvoice(adminUserId: string, invoiceId: string, ip?: string) {
    const r = await this.prisma.system.subscriptionInvoice.updateMany({ where: { id: invoiceId, status: 'OPEN' }, data: { status: 'VOID' } });
    if (r.count !== 1) throw new ConflictException('صورتحساب باز یافت نشد');
    await this.audit.logSystem({ actorUserId: adminUserId, actorType: 'PLATFORM_ADMIN', action: 'billing.invoice_void', entityType: 'subscription_invoice', entityId: invoiceId, ip });
  }

  /** کار زمان‌بندی‌شده: اشتراک‌های سررسیدشده → EXPIRED (LimitsService هم بر اساس تاریخ دسترسی را می‌بندد). */
  async expireDue(now = new Date()) {
    const r = await this.prisma.system.subscription.updateMany({ where: { status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE'] }, currentPeriodEnd: { lt: now } }, data: { status: 'EXPIRED' } });
    return r.count;
  }
}
