import { BadRequestException, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, Query, Req, Res, StreamableFile, UnprocessableEntityException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Auth, TenantId } from '../auth/auth.decorators';
import { MinRole, Public } from '../auth/auth.guard';
import { AuthContext } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

const ROOT = () => resolve(process.env.UPLOAD_DIR ?? './uploads');
const MAX_PER_PRODUCT = 8;
const TYPES: Record<string, { ext: string; mime: string; magic: (b: Buffer) => boolean }> = {
  'image/jpeg': { ext: 'jpg', mime: 'image/jpeg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', mime: 'image/png', magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { ext: 'webp', mime: 'image/webp', magic: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
};
const MIME_BY_EXT: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/**
 * آپلود تصویر کالا: بدنهٔ خام (image/jpeg|png|webp، حداکثر ۲ مگابایت). نوع فایل از «بایت‌های اول» بررسی می‌شود،
 * نه فقط از هدر؛ نام فایل کاملاً تصادفی است (نام کاربر هرگز در مسیر دیسک استفاده نمی‌شود).
 * ذخیره‌سازی: دیسک محلی (UPLOAD_DIR). برای مقیاس بالا باید با S3 سازگار جایگزین شود.
 */
@Controller()
export class MediaController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @MinRole('MANAGER') @Post('products/:id/media')
  async upload(@TenantId() t: string, @Auth() a: AuthContext, @Param('id') productId: string, @Req() req: any, @Query('alt') alt?: string) {
    const body = req.body as unknown;
    if (!Buffer.isBuffer(body) || body.length === 0) throw new BadRequestException('فایل تصویر ارسال نشد (Content-Type باید image/jpeg، image/png یا image/webp باشد)');
    const type = TYPES[String(req.headers['content-type']).split(';')[0].trim()];
    if (!type || !type.magic(body)) throw new UnprocessableEntityException('محتوای فایل با نوع تصویر مجاز مطابقت ندارد');
    const key = `${t}/${randomBytes(16).toString('hex')}.${type.ext}`;
    return this.prisma.withTenant(t, async (tx) => {
      const p = await tx.product.findFirst({ where: { id: productId, tenantId: t, deletedAt: null } });
      if (!p) throw new NotFoundException('کالا یافت نشد');
      const count = await tx.productMedia.count({ where: { tenantId: t, productId } });
      if (count >= MAX_PER_PRODUCT) throw new UnprocessableEntityException(`حداکثر ${MAX_PER_PRODUCT} تصویر برای هر کالا`);
      await mkdir(join(ROOT(), t), { recursive: true });
      await writeFile(join(ROOT(), key), body, { flag: 'wx' });
      try {
        const m = await tx.productMedia.create({ data: { tenantId: t, productId, storageKey: key, url: `${process.env.PUBLIC_API_URL ?? ''}/media/${key}`, altText: alt?.slice(0, 200), sortOrder: count } });
        await this.audit.logTx(tx, { tenantId: t, actorUserId: a.userId, action: 'media.upload', entityType: 'product', entityId: productId, metadata: { mediaId: m.id, bytes: body.length } });
        return m;
      } catch (e) { await unlink(join(ROOT(), key)).catch(() => undefined); throw e; }
    });
  }

  @MinRole('MANAGER') @HttpCode(204) @Delete('products/:id/media/:mediaId')
  async remove(@TenantId() t: string, @Auth() a: AuthContext, @Param('id') productId: string, @Param('mediaId') mediaId: string) {
    const m = await this.prisma.withTenant(t, async (tx) => {
      const row = await tx.productMedia.findFirst({ where: { id: mediaId, productId, tenantId: t } });
      if (!row) throw new NotFoundException('تصویر یافت نشد');
      await tx.productMedia.deleteMany({ where: { id: mediaId, tenantId: t } });
      await this.audit.logTx(tx, { tenantId: t, actorUserId: a.userId, action: 'media.delete', entityType: 'product', entityId: productId, metadata: { mediaId } });
      return row;
    });
    await unlink(join(ROOT(), m.storageKey)).catch(() => undefined);
  }

  /** نمایش عمومی تصویر. مسیر با الگوی سخت‌گیرانه اعتبارسنجی می‌شود (جلوگیری از Path Traversal). */
  @Public() @Get('media/:tenant/:file')
  serve(@Param('tenant') tenant: string, @Param('file') file: string, @Res({ passthrough: true }) res: any) {
    if (!/^[A-Za-z0-9-]{8,64}$/.test(tenant) || !/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(file)) throw new NotFoundException();
    const path = join(ROOT(), tenant, file);
    if (!existsSync(path)) throw new NotFoundException();
    res.set({ 'Content-Type': MIME_BY_EXT[file.split('.')[1]], 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'cross-origin' });
    return new StreamableFile(createReadStream(path));
  }
}
