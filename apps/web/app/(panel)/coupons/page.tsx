'use client';
import { useState } from 'react';
import { api, useApi, fa, rial } from '@/lib/client';
import { Empty, ErrorBox, Loading } from '@/components/ui';
export default function Coupons() {
  const { data, error, loading, reload } = useApi<any[]>('coupons');
  const [f, setF] = useState({ code: '', kind: 'PERCENT', value: '', min: '', max: '' }); const [msg, setMsg] = useState('');
  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    if (!/^[A-Za-z0-9_-]{3,32}$/.test(f.code)) return setMsg('کد: ۳ تا ۳۲ حرف انگلیسی/عدد'); if (!/^\d{1,15}$/.test(f.value)) return setMsg('مقدار باید عدد صحیح باشد');
    if (f.kind === 'PERCENT' && (+f.value < 1 || +f.value > 100)) return setMsg('درصد بین ۱ تا ۱۰۰ باشد');
    try { await api('coupons', { method: 'POST', body: JSON.stringify({ code: f.code, kind: f.kind, value: f.value, ...(f.min && { minOrderAmount: f.min }), ...(f.max && { maxUses: Number(f.max) }) }) }); setF({ code: '', kind: 'PERCENT', value: '', min: '', max: '' }); setMsg('کد ساخته شد ✓'); reload(); } catch (e: any) { setMsg(e.message); }
  }
  async function toggle(c: any) { try { await api(`coupons/${c.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !c.isActive }) }); reload(); } catch (e: any) { setMsg(e.message); } }
  return <><h1>کدهای تخفیف</h1>
    <form onSubmit={add} className="card" style={{ marginBottom: 16 }}><div className="grid">
      <label><span>کد</span><input dir="ltr" style={{ width: '100%' }} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></label>
      <label><span>نوع</span><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="PERCENT">درصدی</option><option value="FIXED">مبلغ ثابت (ریال)</option></select></label>
      <label><span>مقدار</span><input dir="ltr" inputMode="numeric" style={{ width: '100%' }} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></label>
      <label><span>حداقل سفارش (ریال، اختیاری)</span><input dir="ltr" inputMode="numeric" style={{ width: '100%' }} value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} /></label>
      <label><span>سقف دفعات استفاده (اختیاری)</span><input dir="ltr" inputMode="numeric" style={{ width: '100%' }} value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} /></label></div>
      {msg && <p className={msg.includes('✓') ? '' : 'err'} role="status">{msg}</p>}<button className="btn">ساخت کد</button></form>
    {loading ? <Loading /> : error ? <ErrorBox msg={error} retry={reload} /> : !data?.length ? <Empty text="هنوز کدی نساخته‌اید" /> :
      <div className="card scroll"><table className="tbl"><thead><tr><th>کد</th><th>تخفیف</th><th>مصرف</th><th>وضعیت</th><th></th></tr></thead>
        <tbody>{data.map((c) => <tr key={c.id}><td dir="ltr">{c.code}</td><td>{c.kind === 'PERCENT' ? `${fa(c.value)}٪` : rial(c.value)}</td><td>{fa(c.usedCount)}{c.maxUses ? ` / ${fa(c.maxUses)}` : ''}</td><td><span className="badge">{c.isActive ? 'فعال' : 'غیرفعال'}</span></td><td><button className="btn ghost" onClick={() => toggle(c)}>{c.isActive ? 'غیرفعال‌سازی' : 'فعال‌سازی'}</button></td></tr>)}</tbody></table></div>}</>;
}
