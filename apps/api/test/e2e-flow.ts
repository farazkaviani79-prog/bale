/** تست جریان کامل روی API در حال اجرا (BALE_MODE=mock) + Postgres/Redis واقعی.  اجرا: BASE=http://localhost:4000 npx tsx test/e2e-flow.ts */
import { signInitDataForTest } from '../src/modules/bale/init-data';
const BASE = process.env.BASE ?? 'http://localhost:4000';
let pass = 0, fail = 0;
const ok = (c: boolean, m: string, extra?: unknown) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m, extra !== undefined ? JSON.stringify(extra) : ''); } };
async function call(method: string, path: string, body?: unknown, h: Record<string, string> = {}) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...h }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let j: any = null; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  return { s: r.status, j };
}
const auth = (t: string) => ({ authorization: `Bearer ${t}` });
const TOKEN = '123456:MOCK-BOT-TOKEN-abcdef';
const init = (uid: number, name = 'مشتری') => signInitDataForTest({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: uid, username: 'u' + uid, first_name: name }), query_id: 'q' }, TOKEN);
(async () => {
  const rnd = Math.random().toString(36).slice(2, 8);
  console.log('[1] احراز هویت');
  let r = await call('POST', '/auth/register', { email: `a${rnd}@t.test`, password: 'short', displayName: 'الف', businessName: 'ب' });
  ok(r.s === 400, 'رمز کوتاه رد شد (۴۰۰)', r);
  r = await call('POST', '/auth/register', { email: `a${rnd}@t.test`, password: 'password-12345', displayName: 'الف', businessName: 'کسب‌وکار الف' });
  ok(r.s === 201 && !!r.j.accessToken && r.j.role === 'OWNER', 'ثبت‌نام مالک', r);
  const A = r.j.accessToken as string;
  r = await call('GET', '/stores'); ok(r.s === 401, 'بدون توکن ۴۰۱');
  r = await call('POST', '/auth/login', { email: `a${rnd}@t.test`, password: 'wrong-password' }); ok(r.s === 401, 'رمز غلط ۴۰۱');
  r = await call('POST', '/auth/login', { email: `a${rnd}@t.test`, password: 'password-12345' }); ok(r.s === 200 && !!r.j.refreshToken, 'ورود موفق');
  const rt = r.j.refreshToken as string;
  r = await call('POST', '/auth/refresh', { refreshToken: rt }); ok(r.s === 200, 'Refresh');
  r = await call('POST', '/auth/refresh', { refreshToken: rt }); ok(r.s === 401, 'استفاده مجدد از Refresh باطل‌شده رد شد');

  console.log('[2] فروشگاه و محصول');
  r = await call('POST', '/stores', { name: 'فروشگاه نمونه', slug: 'shop-' + rnd }, auth(A)); ok(r.s === 201, 'ساخت فروشگاه', r);
  const store = r.j;
  r = await call('POST', '/products', { storeId: store.id, name: 'کفش', status: 'ACTIVE', variants: [{ sku: 'SH-1', priceAmount: '1500000', initialStock: 3 }] }, auth(A)); ok(r.s === 201 && r.j.variants[0].priceAmount === '1500000', 'ساخت محصول با قیمت رشته‌ای ریال', r);
  const variantId = r.j.variants[0].id;
  r = await call('POST', '/products', { storeId: store.id, name: 'تکراری', variants: [{ sku: 'SH-1', priceAmount: '1' }] }, auth(A)); ok(r.s === 409, 'SKU تکراری ۴۰۹', r);
  r = await call('POST', '/products', { storeId: store.id, name: 'بد', variants: [{ sku: 'X', priceAmount: '12.5' }] }, auth(A)); ok(r.s === 400, 'قیمت اعشاری رد شد', r);

  console.log('[3] اتصال بله (Mock) و مینی‌اپ');
  r = await call('POST', '/channels/bale', { storeId: store.id, botToken: TOKEN }, auth(A)); ok(r.s === 201 && r.j.status === 'ACTIVE' && !JSON.stringify(r.j).includes('MOCK-BOT'), 'اتصال ربات؛ توکن بازگردانده نمی‌شود', r);
  r = await call('GET', '/channels', undefined, auth(A)); ok(!JSON.stringify(r.j).includes('MOCK-BOT') && !JSON.stringify(r.j).includes('botTokenEnc'), 'فهرست اتصال‌ها بدون توکن/توکن رمزشده');
  const M = `/miniapp/${store.id}`; const h1 = { 'x-init-data': init(777) }; const h2 = { 'x-init-data': init(888, 'دیگری') };
  r = await call('GET', M + '/catalog'); ok(r.s === 401, 'مینی‌اپ بدون initData ۴۰۱');
  r = await call('GET', M + '/catalog', undefined, { 'x-init-data': init(777).replace(/hash=[0-9a-f]+/, 'hash=' + '0'.repeat(64)) }); ok(r.s === 401, 'initData با امضای جعلی رد شد');
  r = await call('GET', M + '/catalog', undefined, h1); ok(r.s === 200 && r.j.products.length === 1 && r.j.products[0].variants[0].available === 3, 'کاتالوگ با initData معتبر؛ موجودی ۳', r);

  console.log('[4] سبد، سفارش و رزرو');
  r = await call('POST', M + '/addresses', { recipientName: 'علی رضایی', phone: '09121234567', province: 'تهران', city: 'تهران', addressLine: 'خیابان آزادی پلاک ۱۰' }, h1); ok(r.s === 201, 'ثبت نشانی', r); const addr1 = r.j.id;
  r = await call('PUT', M + '/cart/items', { variantId, quantity: 2 }, h1); ok(r.s === 200 && r.j.subtotal === '3000000', 'سبد: جمع ۳٬۰۰۰٬۰۰۰ ریال', r);
  r = await call('POST', M + '/checkout', { addressId: addr1, idempotencyKey: 'idem-key-0001' }, h1); ok(r.s === 201 && r.j.total === '3000000' && r.j.paymentStatus === 'PENDING', 'Checkout: مبلغ از سرور، پرداخت PENDING', r);
  const order1 = r.j;
  r = await call('GET', M + '/catalog', undefined, h2); ok(r.j.products[0].variants[0].available === 1, 'موجودی قابل‌فروش پس از رزرو = ۱', r.j);
  await call('POST', M + '/addresses', { recipientName: 'نفر دوم', phone: '09127654321', province: 'تهران', city: 'تهران', addressLine: 'خیابان ولیعصر پلاک ۲۰' }, h2);
  const addr2 = (await call('GET', M + '/addresses', undefined, h2)).j[0].id;
  await call('PUT', M + '/cart/items', { variantId, quantity: 2 }, h2);
  r = await call('POST', M + '/checkout', { addressId: addr2, idempotencyKey: 'idem-key-0002' }, h2); ok(r.s === 409, 'فروش بیش از موجودی رد شد (۴۰۹)', r);

  console.log('[5] پرداخت');
  r = await call('POST', M + `/payments/${order1.invoicePayload}/mock-confirm`, undefined, h1); ok(r.s === 200 && r.j.action === 'MARK_PAID', 'SuccessfulPayment معتبر → MARK_PAID', r);
  r = await call('POST', M + `/payments/${order1.invoicePayload}/mock-confirm`, undefined, h1); ok(r.j?.action === 'IGNORE_DUPLICATE', 'رویداد تکراری نادیده گرفته شد (Idempotent)', r);
  r = await call('GET', `/orders/${order1.orderId}`, undefined, auth(A)); ok(r.j.status === 'PAID' && r.j.payments[0].status === 'PAID' && r.j.items[0].unitAmount === '1500000', 'سفارش PAID با Snapshot قیمت', r.j && { st: r.j.status });
  r = await call('GET', '/inventory?storeId=' + store.id, undefined, auth(A)); ok(r.j[0].onHand === 1 && r.j[0].reserved === 0, 'موجودی قطعی: onHand=1 reserved=0', r.j);
  r = await call('POST', `/orders/${order1.orderId}/status`, { status: 'PAID' }, auth(A)); ok(r.s === 400, 'تغییر دستی به PAID ممکن نیست', r);
  r = await call('POST', `/orders/${order1.orderId}/status`, { status: 'PROCESSING' }, auth(A)); ok(r.s === 201 || r.s === 200, 'PAID → PROCESSING', r);

  console.log('[6] جداسازی مستاجر');
  r = await call('POST', '/auth/register', { email: `b${rnd}@t.test`, password: 'password-12345', displayName: 'ب', businessName: 'کسب‌وکار ب' }); const B = r.j.accessToken as string;
  r = await call('GET', `/orders/${order1.orderId}`, undefined, auth(B)); ok(r.s === 404, 'مستاجر ب سفارش مستاجر الف را نمی‌بیند (۴۰۴)', r.s);
  r = await call('GET', '/products', undefined, auth(B)); ok(r.s === 200 && r.j.total === 0, 'فهرست محصولات مستاجر ب خالی است', r.j);
  r = await call('GET', `/products/${(await call('GET', '/products', undefined, auth(A))).j.items[0].id}`, undefined, auth(B)); ok(r.s === 404, 'دسترسی مستقیم به محصول دیگر مستاجر ۴۰۴');
  r = await call('POST', '/payments/refunds', { paymentId: 'x', amount: '1', reason: 'r' }, auth(B)); ok(r.s === 404, 'بازپرداخت پرداخت مستاجر دیگر ۴۰۴', r);
  r = await call('GET', '/admin/overview', undefined, auth(A)); ok(r.s === 403, 'مالک عادی به پنل مدیر کل دسترسی ندارد', r);

  console.log('[7] بازپرداخت و گزارش');
  const pid = (await call('GET', `/orders/${order1.orderId}`, undefined, auth(A))).j.payments[0].id;
  r = await call('POST', '/payments/refunds', { paymentId: pid, amount: '4000000', reason: 'بیش از مبلغ' }, auth(A)); ok(r.s === 409, 'بازپرداخت بیش از مبلغ پرداخت رد شد', r);
  r = await call('POST', '/payments/refunds', { paymentId: pid, amount: '3000000', reason: 'انصراف' }, auth(A)); ok(r.s === 201 && r.j.status === 'SUCCEEDED', 'بازپرداخت کامل (Mock)', r);
  r = await call('GET', `/orders/${order1.orderId}`, undefined, auth(A)); ok(r.j.status === 'REFUNDED', 'وضعیت سفارش REFUNDED', r.j.status);
  r = await call('GET', '/reports/dashboard', undefined, auth(A)); ok(r.s === 200 && typeof r.j.todaySales === 'string', 'گزارش داشبورد', r);
  console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`); process.exit(fail ? 1 : 0);
})();
