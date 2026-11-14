// داده نمونه + آدرس مینی‌اپ آزمایشی (فقط BALE_MODE=mock). اجرا پس از بالا آمدن API:  node scripts/demo-seed.mjs
import { createHmac, randomBytes } from 'node:crypto';
const API = process.env.API_URL ?? 'http://localhost:4000';
const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const TOKEN = '123456:MOCK-BOT-TOKEN-abcdef'; // توکن ساختگی Mock، نه توکن واقعی
const call = async (m, p, b, t) => { const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); const j = await r.json().catch(() => null); if (!r.ok) throw new Error(`${m} ${p} → ${r.status} ${JSON.stringify(j)}`); return j; };
const rnd = randomBytes(3).toString('hex'); const email = `demo${rnd}@botshop.local`; const password = randomBytes(9).toString('base64url');
const reg = await call('POST', '/auth/register', { email, password, displayName: 'فروشنده نمونه', businessName: 'کسب‌وکار نمونه' });
const t = reg.accessToken;
const store = await call('POST', '/stores', { name: 'فروشگاه نمونه', slug: 'demo-' + rnd }, t);
await call('POST', '/products', { storeId: store.id, name: 'کفش ورزشی', status: 'ACTIVE', variants: [{ sku: 'SH-' + rnd, priceAmount: '1500000', initialStock: 10 }] }, t);
await call('POST', '/products', { storeId: store.id, name: 'کیف دوشی', status: 'ACTIVE', variants: [{ sku: 'BG-' + rnd, priceAmount: '900000', initialStock: 5 }] }, t);
await call('POST', '/channels/bale', { storeId: store.id, botToken: TOKEN }, t);
const f = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 1001, username: 'demo_customer', first_name: 'مشتری' }), query_id: 'q' };
const pairs = Object.entries(f).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
const hash = createHmac('sha256', createHmac('sha256', 'WebAppData').update(TOKEN).digest()).update(pairs).digest('hex');
const init = new URLSearchParams({ ...f, hash }).toString();
console.log(`\nپنل فروشنده:  ${WEB}/login\n  ایمیل: ${email}\n  رمز:   ${password}\n\nمینی‌اپ مشتری (آزمایشی، تا ۱ ساعت معتبر):\n  ${WEB}/miniapp/${store.id}?initData=${encodeURIComponent(init)}\n`);
