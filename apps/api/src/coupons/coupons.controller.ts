import { Body, Controller, Get, NotFoundException, Param, Patch, Post, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { Auth, TenantId } from '../auth/auth.decorators';
import { MinRole } from '../auth/auth.guard';
import { AuthContext } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

const MONEY = /^\d{1,15}$/;
class CouponDto {
  @Matches(/^[A-Za-z0-9_-]{3,32}$/, { message: 'کد تخفیف ۳ تا ۳۲ حرف انگلیسی/عدد/خط تیره باشد' }) code!: string;
  @IsIn(['PERCENT', 'FIXED']) kind!: 'PERCENT' | 'FIXED';
  @Matches(MONEY, { message: 'مقدار باید عدد صحیح باشد (درصد یا ریال)' }) value!: string;
  @IsOptional() @Matches(MONEY) minOrderAmount?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000) maxUses?: number;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}
class CouponPatchDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000) maxUses?: number;
  @IsOptional() @IsDateString() expiresAt?: string;
}

@Controller('coupons')
export class CouponsController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}
  @MinRole('MANAGER') @Get() list(@TenantId() t: string) { return this.prisma.withTenant(t, (tx) => tx.coupon.findMany({ where: { tenantId: t }, orderBy: { createdAt: 'desc' }, take: 200 })); }
  @MinRole('MANAGER') @Post() create(@TenantId() t: string, @Auth() a: AuthContext, @Body() d: CouponDto) {
    const value = BigInt(d.value);
    if (d.kind === 'PERCENT' && (value < 1n || value > 100n)) throw new ConflictException('درصد تخفیف باید بین ۱ تا ۱۰۰ باشد');
    if (d.kind === 'FIXED' && value < 1n) throw new ConflictException('مبلغ تخفیف باید مثبت باشد');
    return this.prisma.withTenant(t, async (tx) => {
      try {
        const c = await tx.coupon.create({ data: { tenantId: t, code: d.code.toUpperCase(), kind: d.kind, value, minOrderAmount: BigInt(d.minOrderAmount ?? '0'), maxUses: d.maxUses, startsAt: d.startsAt ? new Date(d.startsAt) : null, expiresAt: d.expiresAt ? new Date(d.expiresAt) : null } });
        await this.audit.logTx(tx, { tenantId: t, actorUserId: a.userId, action: 'coupon.create', entityType: 'coupon', entityId: c.id, metadata: { code: c.code, kind: c.kind, value: d.value } });
        return c;
      } catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('این کد تخفیف قبلاً ثبت شده است'); throw e; }
    });
  }
  @MinRole('MANAGER') @Patch(':id') update(@TenantId() t: string, @Auth() a: AuthContext, @Param('id') id: string, @Body() d: CouponPatchDto) {
    return this.prisma.withTenant(t, async (tx) => {
      const r = await tx.coupon.updateMany({ where: { id, tenantId: t }, data: { isActive: d.isActive, maxUses: d.maxUses, expiresAt: d.expiresAt ? new Date(d.expiresAt) : undefined } });
      if (!r.count) throw new NotFoundException('کد تخفیف یافت نشد');
      await this.audit.logTx(tx, { tenantId: t, actorUserId: a.userId, action: 'coupon.update', entityType: 'coupon', entityId: id, metadata: { ...d } });
      return tx.coupon.findFirstOrThrow({ where: { id, tenantId: t } });
    });
  }
}
