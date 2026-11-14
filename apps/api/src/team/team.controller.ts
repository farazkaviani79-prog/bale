import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsEmail, IsIn, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { Auth, TenantId } from '../auth/auth.decorators';
import { MinRole } from '../auth/auth.guard';
import { AuthContext, ROLE_RANK, Role } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../common/crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LimitsService } from '../subscriptions/limits.service';

const ASSIGNABLE = ['ADMIN', 'MANAGER', 'STAFF'];
class InviteDto {
  @IsEmail({}, { message: 'ایمیل نامعتبر است' }) email!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) displayName!: string;
  @IsString() @MinLength(10, { message: 'رمز اولیه باید حداقل ۱۰ کاراکتر باشد' }) @MaxLength(128) password!: string;
  @IsIn(ASSIGNABLE) role!: 'ADMIN' | 'MANAGER' | 'STAFF';
}
class RoleDto { @IsIn(ASSIGNABLE) role!: 'ADMIN' | 'MANAGER' | 'STAFF'; }

/**
 * مدیریت تیم. قواعد:
 *  - فقط ADMIN به بالا؛ نقش OWNER قابل واگذاری/تغییر/حذف نیست.
 *  - هیچ‌کس نمی‌تواند نقشی هم‌رتبه یا بالاتر از نقش خودش بدهد (مگر OWNER که ADMIN می‌دهد).
 *  - ایمیل موجود در سامانه به‌صورت خودکار به تیم اضافه نمی‌شود (جلوگیری از افزودن حساب دیگران بدون رضایت).
 */
@Controller('team')
export class TeamController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly limits: LimitsService) {}

  @MinRole('ADMIN') @Get() list(@TenantId() t: string) {
    return this.prisma.system.membership.findMany({ where: { tenantId: t }, select: { id: true, role: true, createdAt: true, user: { select: { id: true, email: true, displayName: true, status: true } } }, orderBy: { createdAt: 'asc' } });
  }

  @MinRole('ADMIN') @Post('members') async invite(@TenantId() t: string, @Auth() a: AuthContext, @Body() d: InviteDto) {
    this.assertCanGrant(a.role!, d.role);
    const email = d.email.trim().toLowerCase();
    const passwordHash = await hashPassword(d.password);
    try {
      return await this.prisma.system.$transaction(async (tx) => {
        await this.limits.assertCanCreate(tx, t, 'maxStaff');
        const user = await tx.user.create({ data: { email, passwordHash, displayName: d.displayName } });
        const m = await tx.membership.create({ data: { tenantId: t, userId: user.id, role: d.role } });
        await this.audit.logTx(tx, { tenantId: t, actorUserId: a.userId, action: 'team.invite', entityType: 'membership', entityId: m.id, metadata: { email, role: d.role } });
        return { id: m.id, role: m.role, user: { id: user.id, email, displayName: d.displayName } };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('این ایمیل قبلاً در سامانه ثبت شده است');
      throw e;
    }
  }

  @MinRole('ADMIN') @Patch(':id') async setRole(@TenantId() t: string, @Auth() a: AuthContext, @Param('id') id: string, @Body() d: RoleDto) {
    const m = await this.target(t, id);
    if (m.role === 'OWNER') throw new ForbiddenException('نقش مالک قابل تغییر نیست');
    if (m.userId === a.userId) throw new ForbiddenException('نقش خودتان را نمی‌توانید تغییر دهید');
    this.assertCanGrant(a.role!, d.role); this.assertCanGrant(a.role!, m.role as Role);
    await this.prisma.system.membership.update({ where: { id }, data: { role: d.role } });
    await this.audit.logSystem({ tenantId: t, actorUserId: a.userId, action: 'team.role_change', entityType: 'membership', entityId: id, metadata: { from: m.role, to: d.role } });
    return { id, role: d.role };
  }

  @MinRole('ADMIN') @HttpCode(204) @Delete(':id') async remove(@TenantId() t: string, @Auth() a: AuthContext, @Param('id') id: string) {
    const m = await this.target(t, id);
    if (m.role === 'OWNER') throw new ForbiddenException('مالک قابل حذف نیست');
    if (m.userId === a.userId) throw new ForbiddenException('خودتان را نمی‌توانید حذف کنید');
    this.assertCanGrant(a.role!, m.role as Role);
    // AuthGuard نقش را هر درخواست از DB می‌خواند؛ با حذف عضویت، دسترسی فوراً قطع می‌شود.
    await this.prisma.system.membership.delete({ where: { id } });
    await this.audit.logSystem({ tenantId: t, actorUserId: a.userId, action: 'team.remove', entityType: 'membership', entityId: id, metadata: { userId: m.userId, role: m.role } });
  }

  private async target(t: string, id: string) {
    const m = await this.prisma.system.membership.findFirst({ where: { id, tenantId: t } });
    if (!m) throw new NotFoundException('عضو یافت نشد');
    return m;
  }
  private assertCanGrant(actor: Role, target: Role) {
    if (!ASSIGNABLE.includes(target) && target !== 'OWNER') throw new BadRequestException('نقش نامعتبر است');
    if (actor === 'OWNER') return;
    if (ROLE_RANK[target] >= ROLE_RANK[actor]) throw new ForbiddenException('نمی‌توانید نقشی هم‌رتبه یا بالاتر از نقش خود را مدیریت کنید');
  }
}
