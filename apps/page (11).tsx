'use client';
import { useState } from 'react';
import { api, useApi, fa } from '@/lib/client';
import { Empty, ErrorBox, Loading } from '@/components/ui';
export default function Inventory() {
  const stores = useApi<any[]>('stores'); const sid = stores.data?.[0]?.id;
  const { data, error, loading, reload } = useApi<any[]>(sid ? `inventory?storeId=${sid}` : null);
  const [sel, setSel] = useState<any>(null); const [delta, setDelta] = useState('1'); const [reason, setReason] = useState(''); const [msg, setMsg] = useState('');
  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg(''); const d = Number(delta);
    if (!Number.isInteger(d) || d === 0) return setMsg('مقدار تغییر باید عدد صحیح و غیر صفر باشد'); if (reason.trim().length < 2) return setMsg('دلیل تغییر را بنویسید');
    try { await api('inventory/adjust', { method: 'POST', body: JSON.stringify({ variantId: sel.variantId, locationId: sel.locationId, delta: d, reason, type: d > 0 ? 'RECEIPT' : 'ADJUSTMENT' }) }); setSel(null); setReason(''); reload(); } catch (e: any) { setMsg(e.message); }
  }
  if (stores.loading || loading) return <Loading />; if (error || stores.error) return <ErrorBox msg={(error ?? stores.error)!} retry={reload} />;
  return <><h1>موجودی انبار</h1>
    {!data?.length ? <Empty text="هنوز موجودی ثبت نشده است" /> : <div className="card scroll"><table className="tbl"><thead><tr><th>کالا</th><th>SKU</th><th>انبار</th><th>موجود</th><th>رزرو</th><th>قابل‌فروش</th><th></th></tr></thead>
      <tbody>{data.map((r) => <tr key={r.variantId + r.locationId}><td>{r.product}</td><td dir="ltr">{r.sku}</td><td>{r.location}</td><td>{fa(r.onHand)}</td><td>{fa(r.reserved)}</td><td>{fa(r.available)} {r.low && <span className="badge err">کم</span>}</td><td><button className="btn ghost" onClick={() => { setSel(r); setMsg(''); }}>تعدیل</button></td></tr>)}</tbody></table></div>}
    {sel && <form onSubmit={save} className="card" style={{ marginTop: 14 }}><h2 style={{ marginTop: 0 }}>تعدیل موجودی: {sel.product}</h2>
      <label><span>مقدار تغییر (منفی = کاهش)</span><input dir="ltr" value={delta} onChange={(e) => setDelta(e.target.value)} /></label>
      <label><span>دلیل</span><input style={{ width: '100%' }} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      {msg && <p className="err" role="alert">{msg}</p>}<button className="btn">ثبت</button> <button type="button" className="btn ghost" onClick={() => setSel(null)}>انصراف</button></form>}</>;
}
