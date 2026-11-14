import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsString } from 'class-validator';
import { Auth } from '../auth/auth.decorators';
import { MinRole } from '../auth/auth.guard';
import { AuthContext } from '../auth/auth.types';
import { BillingService } from './billing.service';
class RenewDto { @IsString() planId!: string; }
import { TenantId } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
@Controller()
export class SubscriptionsController {
  constructor(private readonly prisma: PrismaService, private readonly billing: BillingService) {}
  @MinRole('ADMIN') @Post('subscription/renew') renew(@TenantId() t: string, @Auth() a: AuthContext, @Body() d: RenewDto) { return this.billing.requestRenewal(t, a.userId, d.planId); }
  @Get('plans') plans() { return this.prisma.system.plan.findMany({ where: { isActive: true }, orderBy: { priceAmount: 'asc' } }); }
  @Get('subscription') current(@TenantId() t: string) {
    return this.prisma.withTenant(t, (tx) => tx.subscription.findFirst({ where: { tenantId: t }, orderBy: { currentPeriodEnd: 'desc' }, include: { plan: true, invoices: { orderBy: { createdAt: 'desc' }, take: 12 } } }));
  }
}
