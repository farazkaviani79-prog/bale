'use client';
import { useCallback, useEffect, useState } from 'react';
import { mini } from '@/lib/miniapp';
import { fa, rial, statusFa } from '@/lib/client';
import { Empty, ErrorBox, Loading } from '@/components/ui';

type Tab = 'shop' | 'cart' | 'orders';
export default function MiniApp({ params }: { params: { storeId: string } }) {
  const sid = params.storeId;
  const [tab, setTab] = useState<Tab>('shop');
  const [cat, setCat] = useState<any>(); const [cart, setCart] = useState<any>({ items: [], subtotal: '0' });
  const [err, setErr] = useState(''); const [loading, setLoading] = useState(true); const [q, setQ] = useState('');
  const load = useCallback(async () => {
    setErr(''); setLoading(true);
    try { const [c, k] = await Promise.all([mini(sid, 'catalog'), mini(sid, 'cart')]); setCat(c); setCart(k); } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  }, [sid]);
  useEffect(() => { load(); }, [load]);
  const setQty = async (variantId: string, quantity: number) => { try { setCart(await mini(sid, 'cart/items', { method: 'PUT', body: JSON.stringify({ variantId, quantity }) })); } catch (e: any) { setErr(e.message); } };
  const count = cart.items.reduce((s: number, i: any) => s + i.quantity, 0);
  const qtyOf = (id: string) => cart.items.find((i: any) => i.variantId === id)?.quantity ?? 0;

  if (loading) return <main style={{ padding: 16 }}><Loading /></main>;
  if (err && !cat) return <main style={{ padding: 16 }}><ErrorBox msg={err} retry={load} /></main>;
  const products = (cat?.products ?? []).filter((p: any) => !q || p.name.includes(q));
  return <main style={{ maxWidth: 560, margin: '0 auto', padding: '12px 14px 90px' }}>
    <header><h1 style={{ margin: '4px 0' }}>{cat?.store?.name}</h1>{cat?.store?.description && <p className="mute" style={{ marginTop: 0 }}>{cat.store.description}</p>}</header>
    {err && <p className="err" role="alert">{err}</p>}
    {tab === 'shop' && <>
      <input style={{ width: '100%', marginBottom: 12 }} placeholder="جست‌وجوی کالا" value={q} onChange={(e) => setQ(e.target.value)} />
      {!products.length ? <Empty text="کالایی یافت نشد" /> : products.map((p: any) => <article key={p.id} className="card" style={{ marginBottom: 10 }}>
        {p.image && <img src={p.image} alt={p.name} style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8, marginBottom: 6 }} />}<b>{p.name}</b>{p.description && <p className="mute" style={{ margin: '4px 0' }}>{p.description}</p>}
        {p.variants.map((v: any) => { const sold = v.available !== null && v.available <= 0; const n = qtyOf(v.id);
          return <div key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
            <span>{v.title !== 'پیش‌فرض' && v.title + ' — '}{rial(v.price)}{sold && <span className="err"> (ناموجود)</span>}</span>
            {n === 0 ? <button className="btn" disabled={sold} onClick={() => setQty(v.id, 1)}>افزودن</button>
              : <span><button className="btn ghost" aria-label="کم" onClick={() => setQty(v.id, n - 1)}>−</button> <b>{fa(n)}</b> <button className="btn ghost" aria-label="زیاد" disabled={v.available !== null && n >= v.available} onClick={() => setQty(v.id, n + 1)}>+</button></span>}
          </div>; })}
      </article>)}</>}
    {tab === 'cart' && <Cart sid={sid} cart={cart} setQty={setQty} onDone={() => { load(); setTab('orders'); }} />}
    {tab === 'orders' && <Orders sid={sid} />}
    <nav style={{ position: 'fixed', insetInline: 0, bottom: 0, background: 'var(--card)', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-around', padding: 8 }} aria-label="ناوبری">
      {([['shop', 'فروشگاه'], ['cart', `سبد (${fa(count)})`], ['orders', 'سفارش‌ها']] as [Tab, string][]).map(([k, t]) => <button key={k} className={k === tab ? 'btn' : 'btn ghost'} onClick={() => setTab(k)}>{t}</button>)}
    </nav></main>;
}

function Cart({ sid, cart, setQty, onDone }: { sid: string; cart: any; setQty: (id: string, q: number) => void; onDone: () => void }) {
  const [addrs, setAddrs] = useState<any[]>([]); const [addrId, setAddrId] = useState(''); const [form, setForm] = useState<any>({}); const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [paid, setPaid] = useState<any>(null); const [coupon, setCoupon] = useState('');
  const loadAddr = useCallback(async () => { const a = await mini(sid, 'addresses').catch(() => []); setAddrs(a); if (a[0]) setAddrId((x) => x || a[0].id); }, [sid]);
  useEffect(() => { loadAddr(); }, [loadAddr]);
  async function saveAddr(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    if (!/^09\d{9}$/.test(form.phone ?? '')) return setMsg('شماره موبایل نامعتبر است (مثال: 09121234567)');
    if ((form.addressLine ?? '').length < 8) return setMsg('نشانی کامل را وارد کنید');
    try { const a = await mini(sid, 'addresses', { method: 'POST', body: JSON.stringify(form) }); setAddrId(a.id); setAdding(false); loadAddr(); } catch (e: any) { setMsg(e.message); }
  }
  async function checkout() {
    setMsg(''); setBusy(true);
    try { const r = await mini(sid, 'checkout', { method: 'POST', body: JSON.stringify({ addressId: addrId, idempotencyKey: crypto.randomUUID(), ...(coupon.trim() && { couponCode: coupon.trim() }) }) }); setPaid(r); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function mockPay() { setBusy(true); try { await mini(sid, `payments/${paid.invoicePayload}/mock-confirm`, { method: 'POST' }); onDone(); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); } }

  if (paid) return <div className="card"><h2 style={{ marginTop: 0 }}>سفارش {fa(paid.orderNumber)} ثبت شد</h2><p>جمع کالاها: {rial(paid.subtotal)}<br />تخفیف: {rial(paid.discount)}<br />ارسال: {rial(paid.shipping)}<br />مبلغ قابل پرداخت: <b>{rial(paid.total)}</b></p>
    {paid.invoicePayload ? <><p className="mute">حالت آزمایشی: پرداخت واقعی انجام نمی‌شود.</p><button className="btn" disabled={busy} onClick={mockPay}>پرداخت آزمایشی</button></> : <p className="mute">فاکتور پرداخت در گفتگوی ربات برای شما ارسال شد.</p>}
    {msg && <p className="err">{msg}</p>}</div>;
  if (!cart.items.length) return <Empty text="سبد خرید خالی است" />;
  return <div>{cart.items.map((i: any) => <div key={i.variantId} className="card" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span>{i.name}<br /><small className="mute">{rial(i.unit)} × {fa(i.quantity)}</small></span>
      <span><button className="btn ghost" onClick={() => setQty(i.variantId, i.quantity - 1)}>−</button> <b>{fa(i.quantity)}</b> <button className="btn ghost" onClick={() => setQty(i.variantId, i.quantity + 1)}>+</button></span></div>)}
    <p>جمع: <b>{rial(cart.subtotal)}</b></p>
    <section className="card"><h3 style={{ marginTop: 0 }}>نشانی تحویل</h3>
      {addrs.map((a) => <label key={a.id} style={{ display: 'block' }}><input type="radio" name="addr" checked={addrId === a.id} onChange={() => setAddrId(a.id)} /> {a.recipientName} — {a.city}، {a.addressLine}</label>)}
      {adding ? <form onSubmit={saveAddr}>{([['recipientName', 'نام گیرنده'], ['phone', 'موبایل'], ['province', 'استان'], ['city', 'شهر'], ['addressLine', 'نشانی کامل'], ['postalCode', 'کد پستی (اختیاری)']] as [string, string][]).map(([k, l]) => <label key={k}><span>{l}</span><input style={{ width: '100%' }} value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></label>)}<button className="btn">ذخیره نشانی</button></form>
        : <button className="btn ghost" onClick={() => setAdding(true)}>+ نشانی جدید</button>}</section>
    <label><span>کد تخفیف (اختیاری)</span><input dir="ltr" style={{ width: '100%' }} value={coupon} onChange={(e) => setCoupon(e.target.value)} /></label>
    {msg && <p className="err" role="alert">{msg}</p>}
    <button className="btn" style={{ width: '100%', marginTop: 10 }} disabled={busy || !addrId} onClick={checkout}>{busy ? 'در حال ثبت…' : 'ثبت سفارش و پرداخت'}</button></div>;
}

function Orders({ sid }: { sid: string }) {
  const [rows, setRows] = useState<any[] | null>(null); const [err, setErr] = useState('');
  useEffect(() => { mini(sid, 'orders').then(setRows).catch((e) => setErr(e.message)); }, [sid]);
  if (err) return <ErrorBox msg={err} />; if (!rows) return <Loading />; if (!rows.length) return <Empty text="هنوز سفارشی ندارید" />;
  return <>{rows.map((o) => <div key={o.id} className="card" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}><span>{fa(o.orderNumber)}<br /><small className="mute">{rial(o.totalAmount)}</small></span><span className="badge">{statusFa[o.status]}</span></div>)}</>;
}
