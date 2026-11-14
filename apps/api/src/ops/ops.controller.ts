import { Controller, Get, Inject } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PlatformAdminOnly } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { INBOUND_QUEUE } from '../modules/bale/webhook.controller';
import { OUTBOUND_QUEUE } from '../modules/bale/outbound.service';
import { MAINT_QUEUE } from '../queue/workers.service';
import { metrics } from './request-logger';

/** وضعیت عملیاتی برای مدیر کل (و مانیتورینگ): صف‌ها، شکست‌ها، رزروهای منقضی‌نشده، شمارنده‌های درخواست. فقط خواندنی. */
@PlatformAdminOnly()
@Controller('admin/ops')
export class OpsController {
  constructor(private readonly prisma: PrismaService, @Inject(INBOUND_QUEUE) private readonly inQ: Queue, @Inject(OUTBOUND_QUEUE) private readonly outQ: Queue, @Inject(MAINT_QUEUE) private readonly maintQ: Queue) {}
  @Get() async ops() {
    const s = this.prisma.system; const now = new Date();
    const [inbound, outbound, maint, failedWebhooks, failedOutbound, staleReservations, openInvoices] = await Promise.all([
      this.inQ.getJobCounts('waiting', 'active', 'failed', 'delayed'), this.outQ.getJobCounts('waiting', 'active', 'failed', 'delayed'), this.maintQ.getJobCounts('waiting', 'active', 'failed', 'delayed'),
      s.webhookEvent.count({ where: { status: 'FAILED' } }), s.outboundMessage.count({ where: { status: 'FAILED' } }),
      s.stockReservation.count({ where: { status: 'ACTIVE', expiresAt: { lt: new Date(now.getTime() - 10 * 60_000) } } }), // اگر >۰ باشد کار انقضا کار نمی‌کند
      s.subscriptionInvoice.count({ where: { status: 'OPEN' } }),
    ]);
    return { uptimeSeconds: Math.round((Date.now() - metrics.startedAt) / 1000), http: { requests: metrics.requests, errors4xx: metrics.errors4xx, errors5xx: metrics.errors5xx }, queues: { inbound, outbound, maint }, failedWebhooks, failedOutbound, staleReservations, openInvoices, healthy: staleReservations === 0 && failedWebhooks < 20 };
  }
}
