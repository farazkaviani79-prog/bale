import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { MAINT_QUEUE } from './queue/workers.service';
import { Public } from './auth/auth.guard';
import { PrismaService } from './prisma/prisma.service';
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService, @Inject(MAINT_QUEUE) private readonly maint: Queue) {}
  @Public() @Get('health') async health() {
    try { await this.prisma.system.$queryRaw`SELECT 1`; } catch { throw new ServiceUnavailableException({ status: 'db_down' }); }
    try { await ((await this.maint.client) as unknown as { ping(): Promise<string> }).ping(); } catch { throw new ServiceUnavailableException({ status: 'redis_down' }); }
    return { service: 'botshop-api', status: 'ok', timestamp: new Date().toISOString() };
  }
}
