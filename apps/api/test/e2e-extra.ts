/**
 * تست جریان‌های تکمیلی روی API زنده (BALE_MODE=mock): نقش‌ها/تیم، تغییر رمز، قفل حساب، کوپن و ارسال (با هم‌زمانی)،
 * آپلود تصویر، صورتحساب اشتراک، پنل عملیات.
 * اجرا: BASE=http://localhost:4000 ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx test/e2e-extra.ts
 * (برای بخش صورتحساب مدیر کل لازم است؛ بدون آن آن بخش «رد» می‌شود، نه «موفق»)
 */
import { signInitDataForTest } from '../src/modules/bale/init-data';
const BASE = process.env.BASE ?? 'http://localhost:4000';
let pass = 0, fail = 0, skipped = 0;
const ok = (c: boolean, m: string, extra?: unknown) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m, extra !== undefined ? JSON.stringify(extra) : ''); } };
async function call(method: string, path: string, body?: unknown, h: Record<string, string> = {}) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...h }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let j: any = null; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  return { s: r.status, j };
}
const auth = (t: string) => ({ authorization: `Bearer ${t}` });
const TOKEN = '123456:MOCK-BOT-TOKEN-abcdef';
const init = (uid: number) => signInitDataForTest({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: uid, username: 'x' + uid, first_name: 'مشتری' }), query_id: 'q' }, TOKEN);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const PW = 'password-12345';

(async () => {
  const rnd = Math.random().toString(36).slice(2, 8);
  const reg = async (tag: string) => { const r = await call('POST', '/auth/register', { email: `${tag}${rnd}@t.test`, password: PW, displayName: tag, businessName: 'ک-' + tag }); if (r.s !== 201) throw new Error('register failed ' + JSON.stringify(r)); return r.j.accessToken as string; };

  console.log('[0] سلامت');
  let r = await call('GET', '/health'); ok(r.s === 200 && r.j.status === 'ok', 'health شامل DB و Redis', r);

  const A = await reg('own');
  r = await call('POST', '/stores', { name: 'فروشگاه', slug: 'x-' + rnd }, auth(A)); const store = r.j;
  r = await call('POST', '/products', { storeId: store.id, name: 'کالا', status: 'ACTIVE', variants: [{ sku: 'K-' + rnd, priceAmount: '1000000', initialStock: 8 }] }, auth(A)); ok(r.s === 201, 'کالای نمونه', r);
  const productId = r.j.id; const variantId = r.j.variants[0].id;

  console.log('[1] تیم و نقش‌ها');
  r = await call('POST', '/team/members', { email: `staff${rnd}@t.test`, displayName: 'کارمند', password: PW, role: 'STAFF' }, auth(A)); ok(r.s === 201 && r.j.role === 'STAFF', 'افزودن کارمند', r); const staffMid = r.j.id;
  r = await call('POST', '/team/members', { email: `second${rnd}@t.test`, displayName: 'دوم', password: PW, role: 'STAFF' }, auth(A)); ok(r.s === 403, 'سقف پلن (۲ عضو) اعمال شد', r);
  r = await call('POST', '/auth/login', { email: `staff${rnd}@t.test`, password: PW }); ok(r.s === 200, 'ورود کارمند'); const S = r.j.accessToken as string;
  r = await call('GET', '/products', undefined, auth(S)); ok(r.s === 200, 'کارمند فهرست محصولات را می‌بیند');
  r = await call('POST', '/products', { storeId: store.id, name: 'ممنوع', variants: [{ sku: 'Z-' + rnd, priceAmount: '1' }] }, auth(S)); ok(r.s === 403, 'کارمند نمی‌تواند کالا بسازد', r);
  r = await call('GET', '/team', undefined, auth(S)); ok(r.s === 403, 'کارمند به مدیریت تیم دسترسی ندارد');
  r = await call('POST', '/coupons', { code: 'NOPE1', kind: 'PERCENT', value: '5' }, auth(S)); ok(r.s === 403, 'کارمند نمی‌تواند کوپن بسازد');
  r = await call('PATCH', `/team/${staffMid}`, { role: 'MANAGER' }, auth(A)); ok(r.s === 200, 'ارتقای کارمند به مدیر فروش توسط مالک', r);
  r = await call('POST', '/products', { storeId: store.id, name: 'مجاز', status: 'ACTIVE', variants: [{ sku: 'M-' + rnd, priceAmount: '5000' }] }, auth(S)); ok(r.s === 201, 'مدیر فروش می‌تواند کالا بسازد (نقش از DB خوانده می‌شود)', r);
  r = await call('GET', '/team', undefined, auth(S)); ok(r.s === 403, 'مدیر فروش هنوز به تیم دسترسی ندارد');
  r = await call('PATCH', `/team/${staffMid}`, { role: 'ADMIN' }, auth(S)); ok(r.s === 403, 'مدیر فروش نمی‌تواند نقش بدهد');
  const ownerMid = (await call('GET', '/team', undefined, auth(A))).j.find((m: any) => m.role === 'OWNER').id;
  r = await call('DELETE', `/team/${ownerMid}`, undefined, auth(A)); ok(r.s === 403, 'مالک قابل حذف نیست');
  r = await call('PATCH', `/team/${ownerMid}`, { role: 'STAFF' }, auth(A)); ok(r.s === 403, 'نقش مالک قابل تغییر نیست');
  r = await call('DELETE', `/team/${staffMid}`, undefined, auth(A)); ok(r.s === 204, 'حذف عضو');
  r = await call('GET', '/products', undefined, auth(S)); ok(r.s === 401 || r.s === 403, 'توکن قدیمی عضو حذف‌شده فوراً بی‌اثر است', r.s);
  r = await call('POST', '/team/members', { email: `staff${rnd}@t.test`, displayName: 'تکراری', password: PW, role: 'STAFF' }, auth(A)); ok(r.s === 409, 'ایمیل موجود خودکار اضافه نمی‌شود (۴۰۹)', r);

  console.log('[2] رمز عبور و قفل حساب');
  const B = await call('POST', '/auth/login', { email: `own${rnd}@t.test`, password: PW }); const rt = B.j.refreshToken as string;
  r = await call('POST', '/auth/change-password', { currentPassword: 'wrong-password-1', newPassword: 'new-password-123' }, auth(A)); ok(r.s === 401, 'رمز فعلی غلط رد شد');
  r = await call('POST', '/auth/change-password', { currentPassword: PW, newPassword: 'new-password-123' }, auth(A)); ok(r.s === 204, 'تغییر رمز');
  r = await call('POST', '/auth/refresh', { refreshToken: rt }); ok(r.s === 401, 'نشست‌های قبلی پس از تغییر رمز باطل شد');
  r = await call('POST', '/auth/login', { email: `own${rnd}@t.test`, password: PW }); ok(r.s === 401, 'رمز قدیمی دیگر کار نمی‌کند');
  r = await call('POST', '/auth/login', { email: `own${rnd}@t.test`, password: 'new-password-123' }); ok(r.s === 200, 'رمز جدید کار می‌کند');
  await reg('lock');
  for (let i = 0; i < 5; i++) await call('POST', '/auth/login', { email: `lock${rnd}@t.test`, password: 'bad-password-' + i });
  r = await call('POST', '/auth/login', { email: `lock${rnd}@t.test`, password: PW }); ok(r.s === 401 && String(r.j.message).includes('قفل'), 'پس از ۵ تلاش ناموفق حساب قفل است (حتی با رمز درست)', r);

  console.log('[3] کوپن، ارسال و هم‌زمانی');
  r = await call('POST', '/channels/bale', { storeId: store.id, botToken: TOKEN }, auth(A)); ok(r.s === 201, 'اتصال ربات (Mock)', r);
  r = await call('PATCH', `/stores/${store.id}`, { shippingFlatAmount: '50000', freeShippingOver: '3000000' }, auth(A)); ok(r.s === 200, 'تنظیم هزینه ارسال', r);
  r = await call('POST', '/coupons', { code: 'off10', kind: 'PERCENT', value: '150' }, auth(A)); ok(r.s === 409, 'درصد بالای ۱۰۰ رد شد', r);
  r = await call('POST', '/coupons', { code: 'off10', kind: 'PERCENT', value: '10', minOrderAmount: '500000', maxUses: 1 }, auth(A)); ok(r.s === 201 && r.j.code === 'OFF10', 'ساخت کوپن (کد بزرگ‌حرف می‌شود)', r);
  r = await call('POST', '/coupons', { code: 'OFF10', kind: 'FIXED', value: '1000' }, auth(A)); ok(r.s === 409, 'کد تکراری ۴۰۹');
  const M = `/miniapp/${store.id}`; const H = (u: number) => ({ 'x-init-data': init(u) });
  const prep = async (u: number, qty: number) => {
    const a = await call('POST', M + '/addresses', { recipientName: 'گیرنده', phone: '09121234567', province: 'تهران', city: 'تهران', addressLine: 'خیابان آزادی پلاک ۱۰' }, H(u));
    await call('PUT', M + '/cart/items', { variantId, quantity: qty }, H(u)); return a.j.id as string;
  };
  const co = (u: number, addressId: string, key: string, couponCode?: string) => call('POST', M + '/checkout', { addressId, idempotencyKey: key, ...(couponCode && { couponCode }) }, H(u));
  const a1 = await prep(21, 1); const a2 = await prep(22, 1);
  r = await co(21, a1, 'key-bad-code-1', 'NOSUCH'); ok(r.s === 422, 'کد نامعتبر ۴۲۲', r);
  r = await co(21, a1, 'key-coupon-001', 'off10'); ok(r.s === 201 && r.j.discount === '100000' && r.j.shipping === '50000' && r.j.total === '950000', 'تخفیف ۱۰٪ + ارسال ثابت: ۱٬۰۰۰٬۰۰۰ − ۱۰۰٬۰۰۰ + ۵۰٬۰۰۰ = ۹۵۰٬۰۰۰', r.j); const o1 = r.j;
  r = await co(22, a2, 'key-coupon-002', 'OFF10'); ok(r.s === 422, 'سقف دفعات مصرف کوپن (۱) اعمال شد', r);
  r = await call('GET', '/coupons', undefined, auth(A)); ok(r.j[0].usedCount === 1, 'شمارندهٔ مصرف = ۱', r.j[0]);
  r = await call('POST', `/orders/${o1.orderId}/status`, { status: 'CANCELLED' }, auth(A)); ok(r.s === 200 || r.s === 201, 'لغو سفارش', r);
  r = await call('GET', '/coupons', undefined, auth(A)); ok(r.j[0].usedCount === 0, 'با لغو سفارش مصرف کوپن برگشت', r.j[0]);
  const a3 = await prep(23, 1); const a4 = await prep(24, 1);
  const both = await Promise.all([co(23, a3, 'key-race-0001', 'OFF10'), co(24, a4, 'key-race-0002', 'OFF10')]);
  const codes = both.map((x) => x.s).sort();
  ok(codes[0] === 201 && codes[1] === 422, 'دو مصرف هم‌زمان از کوپن تک‌مصرف: دقیقاً یکی موفق', both.map((x) => x.s));
  r = await call('GET', '/coupons', undefined, auth(A)); ok(r.j[0].usedCount === 1, 'پس از رقابت شمارنده دقیقاً ۱ است', r.j[0]);
  const a5 = await prep(25, 3);
  r = await co(25, a5, 'key-freeship-1'); ok(r.s === 201 && r.j.shipping === '0' && r.j.total === '3000000', 'ارسال رایگان از ۳٬۰۰۰٬۰۰۰ ریال', r.j);

  console.log('[4] آپلود تصویر');
  const up = (path: string, body: Buffer, type: string, tok: string) => fetch(BASE + path, { method: 'POST', headers: { 'content-type': type, authorization: `Bearer ${tok}` }, body }).then(async (x) => ({ s: x.status, j: await x.json().catch(() => null) }));
  let u = await up(`/products/${productId}/media?alt=test`, PNG, 'image/png', A); ok(u.s === 201 && u.j.url, 'آپلود PNG معتبر', u);
  const path = String(u.j?.url ?? '').replace(/^https?:\/\/[^/]+/, '');
  let g = await fetch(BASE + path); ok(g.status === 200 && g.headers.get('content-type') === 'image/png' && g.headers.get('x-content-type-options') === 'nosniff', 'نمایش عمومی با هدر امن', g.status);
  u = await up(`/products/${productId}/media`, Buffer.from('<script>alert(1)</script>'), 'image/png', A); ok(u.s === 422, 'محتوای غیرتصویر با هدر image/png رد شد (بررسی بایت‌های اول)', u);
  u = await up(`/products/${productId}/media`, PNG, 'text/plain', A); ok(u.s === 400, 'Content-Type غیرمجاز رد شد', u);
  const Bt = await reg('oth');
  u = await up(`/products/${productId}/media`, PNG, 'image/png', Bt); ok(u.s === 404, 'مستاجر دیگر روی کالای ما آپلود نمی‌کند', u);
  g = await fetch(BASE + '/media/..%2f..%2fetc/passwd'); ok(g.status === 404, 'Path Traversal مسدود است', g.status);
  const media = (await call('GET', `/products/${productId}`, undefined, auth(A))).j.media[0];
  r = await call('DELETE', `/products/${productId}/media/${media.id}`, undefined, auth(A)); ok(r.s === 204, 'حذف تصویر');
  g = await fetch(BASE + path); ok(g.status === 404, 'فایل پس از حذف در دسترس نیست', g.status);

  console.log('[5] صورتحساب اشتراک و پنل عملیات');
  const AE = process.env.ADMIN_EMAIL, AP = process.env.ADMIN_PASSWORD;
  const plans = (await call('GET', '/plans', undefined, auth(A))).j as any[]; const pro = plans.find((p) => p.code === 'pro');
  r = await call('POST', '/subscription/renew', { planId: pro.id }, auth(A)); ok(r.s === 201 && r.j.status === 'OPEN' && r.j.amount === '4500000', 'درخواست ارتقا به پلن حرفه‌ای → صورتحساب باز', r); const inv = r.j;
  r = await call('POST', '/subscription/renew', { planId: pro.id }, auth(A)); ok(r.s === 409, 'صورتحساب باز دوم ساخته نمی‌شود');
  r = await call('POST', `/admin/invoices/${inv.id}/mark-paid`, { providerRef: 'X' }, auth(A)); ok(r.s === 403, 'مالک عادی نمی‌تواند صورتحساب را تأیید کند');
  if (!AE || !AP) { skipped++; console.log('  ⚠ ADMIN_EMAIL/ADMIN_PASSWORD تنظیم نشده؛ بخش مدیر کل رد شد'); }
  else {
    const adm = (await call('POST', '/auth/login', { email: AE, password: AP })).j.accessToken as string;
    r = await call('POST', `/admin/invoices/${inv.id}/mark-paid`, { providerRef: 'TEST-REF-1' }, auth(adm)); ok(r.s === 200 && r.j.status === 'PAID', 'تأیید پرداخت توسط مدیر کل', r);
    r = await call('POST', `/admin/invoices/${inv.id}/mark-paid`, { providerRef: 'TEST-REF-1' }, auth(adm)); ok(r.s === 409, 'تأیید دوباره رد شد (Idempotent)', r);
    r = await call('GET', '/subscription', undefined, auth(A)); ok(r.j.plan.code === 'pro' && r.j.status === 'ACTIVE' && new Date(r.j.currentPeriodEnd).getTime() > Date.now() + 40 * 86400_000, 'اشتراک به «حرفه‌ای» ارتقا و تمدید شد', r.j);
    r = await call('GET', '/admin/ops', undefined, auth(adm)); ok(r.s === 200 && r.j.queues && typeof r.j.healthy === 'boolean' && r.j.staleReservations === 0, 'پنل عملیات: صف‌ها و رزرو معوق = ۰', r.j);
    r = await call('GET', '/admin/ops', undefined, auth(A)); ok(r.s === 403, 'پنل عملیات فقط برای مدیر کل');
  }
  console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق، ${skipped} رد‌شده`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('خطای اجرای تست:', e); process.exit(2); });
