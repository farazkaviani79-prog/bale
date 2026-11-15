'use client';
import { useState } from 'react';
import { api, useApi, rial, fa } from '@/lib/client';
import { ErrorBox, Loading } from '@/components/ui';
export default function Settings() {
  const stores = useApi<any[]>('stores'); const ch = useApi<any[]>('channels'); const sub = useApi<any>('subscription'); const plans = useApi<any[]>('plans');
  const [token, setToken] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const store = stores.data?.[0];
  const [ship, setShip] = useState<{ flat: string; free: string } | null>(null); const [smsg, setSmsg] = useState(''); const [pw, setPw] = useState({ cur: '', next: '' }); const [pmsg, setPmsg] = useState('');
  async function saveShip(e: React.FormEvent) {
    e.preventDefault(); setSmsg(''); const v = ship ?? { flat: String(store.shippingFlatAmount), free: store.freeShippingOver ?? '' };
    if (!/^\d{1,15}$/.test(v.flat) || !/^(\d{1,15})?$/.test(v.free)) return setSmsg('مبلغ‌ها باید عدد صحیح (ریال) باشند');
    try { await api(`stores/${store.id}`, { method: 'PATCH', body: JSON.stringify({ shippingFlatAmount: v.flat, freeShippingOver: v.free }) }); setSmsg('ذخیره شد ✓'); stores.reload(); } catch (e: any) { setSmsg(e.message); }
  }
  async function changePw(e: React.FormEvent) {
    e.preventDefault(); setPmsg(''); if (pw.next.length < 10) return setPmsg('رمز جدید حداقل ۱۰ کاراکتر باشد');
    try { await api('auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: pw.cur, newPassword: pw.next }) }); setPw({ cur: '', next: '' }); setPmsg('رمز تغییر کرد ✓ (دوباره وارد شوید)'); } catch (e: any) { setPmsg(e.message); }
  }
  async function renew(planId: string) { try { await api('subscription/renew', { method: 'POST', body: JSON.stringify({ planId }) }); setPmsg('صورتحساب ساخته شد ✓ پس از پرداخت، مدیر پلتفرم آن را تأیید می‌کند.'); sub.reload(); } catch (e: any) { setPmsg(e.message); } }
  async function connect(e: React.FormEvent) {
    e.preventDefault(); setMsg(''); if (token.trim().length < 10) return setMsg('توکن ربات نامعتبر است');
    setBusy(true);
    try { await api('channels/bale', { method: 'POST', body: JSON.stringify({ storeId: store.id, botToken: token.trim() }) }); setToken(''); setMsg('ربات متصل شد ✓'); ch.reload(); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }
  if (stores.loading || ch.loading || sub.loading) return <Loading />; if (stores.error) return <ErrorBox msg={stores.error} retry={stores.reload} />;
  const s = sub.data;
  return <><h1>تنظیمات</h1>
    <section className="card"><h2 style={{ marginTop: 0 }}>اتصال ربات بله</h2>
      {!store ? <p className="mute">ابتدا یک فروشگاه بسازید.</p> : <>
        {ch.data?.length ? ch.data.map((c) => <p key={c.id}>ربات <b dir="ltr">@{c.botUsername}</b> — <span className="badge">{c.status}</span></p>) : <p className="mute">هنوز رباتی متصل نشده است.</p>}
        <form onSubmit={connect}><label><span>توکن ربات (فقط به سرور ارسال و رمزنگاری می‌شود؛ هرگز نمایش داده نمی‌شود)</span><input style={{ width: '100%' }} dir="ltr" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} /></label>
          {msg && <p className={msg.includes('✓') ? '' : 'err'} role="status">{msg}</p>}<button className="btn" disabled={busy}>{busy ? 'در حال اتصال…' : 'اتصال ربات'}</button></form></>}</section>
    {store && <section className="card" style={{ marginTop: 16 }}><h2 style={{ marginTop: 0 }}>هزینه ارسال</h2><form onSubmit={saveShip}>
      <label><span>هزینه ثابت ارسال (ریال)</span><input dir="ltr" inputMode="numeric" defaultValue={String(store.shippingFlatAmount)} onChange={(e) => setShip({ flat: e.target.value, free: ship?.free ?? store.freeShippingOver ?? '' })} /></label>
      <label><span>ارسال رایگان از مبلغ (ریال، خالی = ندارد)</span><input dir="ltr" inputMode="numeric" defaultValue={store.freeShippingOver ?? ''} onChange={(e) => setShip({ flat: ship?.flat ?? String(store.shippingFlatAmount), free: e.target.value })} /></label>
      {smsg && <p className={smsg.includes('✓') ? '' : 'err'} role="status">{smsg}</p>}<button className="btn">ذخیره</button></form></section>}
    <section className="card" style={{ marginTop: 16 }}><h2 style={{ marginTop: 0 }}>اشتراک</h2>
      {s ? <p>پلن <b>{s.plan.name}</b> — وضعیت <span className="badge">{s.status}</span> — تا {new Date(s.currentPeriodEnd).toLocaleDateString('fa-IR')}</p> : <p className="err">اشتراک فعالی ندارید.</p>}
      <div className="grid">{plans.data?.map((p) => <article key={p.id} className="card"><b>{p.name}</b><p className="mute">{rial(p.priceAmount)} / ماه</p><small>{fa(p.limits.maxProducts === -1 ? 'نامحدود' : p.limits.maxProducts)} کالا · {fa(p.limits.maxStores)} فروشگاه</small><br /><button className="btn ghost" onClick={() => renew(p.id)}>درخواست تمدید/ارتقا</button></article>)}</div>
      <p className="mute">پرداخت آنلاین اشتراک هنوز وصل نیست: پس از ثبت درخواست، مبلغ را طبق راهنمای پلتفرم پرداخت کنید تا مدیر آن را تأیید کند.</p>{pmsg && <p className={pmsg.includes('✓') ? '' : 'err'} role="status">{pmsg}</p>}</section>
    <section className="card" style={{ marginTop: 16 }}><h2 style={{ marginTop: 0 }}>تغییر رمز عبور</h2><form onSubmit={changePw}>
      <label><span>رمز فعلی</span><input type="password" autoComplete="current-password" dir="ltr" value={pw.cur} onChange={(e) => setPw({ ...pw, cur: e.target.value })} /></label>
      <label><span>رمز جدید</span><input type="password" autoComplete="new-password" dir="ltr" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></label><button className="btn">تغییر رمز</button></form></section></>;
}
