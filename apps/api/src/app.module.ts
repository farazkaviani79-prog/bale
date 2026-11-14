import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { loadEnv } from './config/env';
import { SecretBox } from './common/crypto';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/auth.guard';
import { LimitsService } from './subscriptions/limits.service';
import { SubscriptionsController } from './subscriptions/subscriptions.controller';
import { CatalogController } from './catalog/catalog.controller';
import { CatalogService } from './catalog/catalog.service';
import { InventoryController } from './inventory/inventory.controller';
import { InventoryService } from './inventory/inventory.service';
import { OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
import { PaymentsController } from './payments/payments.controller';
import { PaymentsService } from './payments/payments.service';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';
import { AdminController } from './admin/admin.controller';
import { HealthController } from './health.controller';
import { APP_ENV, ChannelService, SECRET_BOX } from './modules/bale/channel.service';
import { ChannelController } from './modules/bale/channel.controller';
import { INBOUND_QUEUE, WebhookController } from './modules/bale/webhook.controller';
import { OUTBOUND_QUEUE, OutboundService } from './modules/bale/outbound.service';
import { BotFlowService } from './modules/bale/bot-flow.service';
import { MiniAppController } from './modules/bale/miniapp.controller';
import { MAINT_QUEUE, WorkersService } from './queue/workers.service';
import { BillingService } from './subscriptions/billing.service';
import { CouponsController } from './coupons/coupons.controller';
import { TeamController } from './team/team.controller';
import { MediaController } from './media/media.controller';
import { OpsController } from './ops/ops.controller';
import { Q_INBOUND, Q_MAINT, Q_OUTBOUND } from './queue/queue.constants';

const env = loadEnv();
const redis = () => new IORedis(env.redisUrl, { maxRetriesPerRequest: null });

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 * Math.max(1, Number(process.env.THROTTLE_MULTIPLIER ?? 1)) }]), PrismaModule, AuditModule, AuthModule],
  controllers: [HealthController, SubscriptionsController, CatalogController, InventoryController, OrdersController, PaymentsController, ReportsController, AdminController, ChannelController, WebhookController, MiniAppController, CouponsController, TeamController, MediaController, OpsController],
  providers: [
    { provide: APP_ENV, useValue: env }, { provide: SECRET_BOX, useValue: new SecretBox(env.encryptionKey) },
    { provide: APP_GUARD, useClass: ThrottlerGuard }, { provide: APP_GUARD, useClass: AuthGuard },
    { provide: INBOUND_QUEUE, useFactory: () => new Queue(Q_INBOUND, { connection: redis() }) },
    { provide: OUTBOUND_QUEUE, useFactory: () => new Queue(Q_OUTBOUND, { connection: redis() }) },
    { provide: MAINT_QUEUE, useFactory: () => new Queue(Q_MAINT, { connection: redis() }) },
    LimitsService, BillingService, CatalogService, InventoryService, OrdersService, PaymentsService, ReportsService, ChannelService, OutboundService, BotFlowService, WorkersService,
  ],
})
export class AppModule {}
