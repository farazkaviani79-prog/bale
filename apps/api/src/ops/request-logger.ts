import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export const metrics = { requests: 0, errors5xx: 0, errors4xx: 0, startedAt: Date.now() };
const log = new Logger('HTTP');
/** لاگ JSON تک‌خطی با شناسهٔ درخواست. عمداً فقط مسیر (بدون Query/Header/Body) ثبت می‌شود تا توکن یا اطلاعات شخصی نشت نکند. */
export function requestLogger() {
  return (req: any, res: any, next: () => void) => {
    const id = (typeof req.headers['x-request-id'] === 'string' && /^[\w-]{8,64}$/.test(req.headers['x-request-id'])) ? req.headers['x-request-id'] : randomUUID();
    res.setHeader('x-request-id', id);
    const t0 = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number((process.hrtime.bigint() - t0) / 1_000_000n);
      metrics.requests++; if (res.statusCode >= 500) metrics.errors5xx++; else if (res.statusCode >= 400) metrics.errors4xx++;
      if (req.path !== '/health') log.log(JSON.stringify({ id, m: req.method, p: String(req.path).replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id').slice(0, 120), s: res.statusCode, ms }));
    });
    next();
  };
}
