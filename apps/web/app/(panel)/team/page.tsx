'use client';
import { useState } from 'react';
import { api, useApi } from '@/lib/client';
import { ErrorBox, Loading } from '@/components/ui';
const ROLE_FA: Record<string, string> = { OWNER: 'مالک', ADMIN: 'مدیر', MANAGER: 'مدیر فروش', STAFF: 'کارمند' };
export default function Team() {
  const { data, error, loading, reload } = useApi<any[]>('team');
  const [f, setF] = useState({ email: '', displayName: '', password: '', role: 'STAFF' }); const [msg, setMsg] = useState('');
  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    if (!/^\S+@\S+\.\S+$/.test(f.email)) return setMsg('ایمیل نامعتبر است'); if (f.password.length < 10) return setMsg('رمز اولیه حداقل ۱۰ کاراکتر باشد'); if (!f.displayName.trim()) return setMsg('نام را وارد کنید');
    try { await api('team/members', { method: 'POST', body: JSON.stringify(f) }); setF({ email: '', displayName: '', password: '', role: 'STAFF' }); setMsg('عضو اضافه شد ✓ (رمز را به‌صورت امن به او بدهید)'); reload(); } catch (e: any) { setMsg(e.message); }
  }
  async function setRole(id: string, role: string) { try { await api(`team/${id}`, { method: 'PATCH', body: JSON.stringify({ role }) }); reload(); } catch (e: any) { setMsg(e.message); } }
  async function remove(id: string) { if (!confirm('این عضو حذف شود؟')) return; try { await api(`team/${id}`, { method: 'DELETE' }); reload(); } catch (e: any) { setMsg(e.message); } }
  if (loading) return <Loading />; if (error) return <ErrorBox msg={error} retry={reload} />;
  return <><h1>تیم</h1>
    <div className="card scroll"><table className="tbl"><thead><tr><th>نام</th><th>ایمیل</th><th>نقش</th><th></th></tr></thead>
      <tbody>{data?.map((m) => <tr key={m.id}><td>{m.user.displayName}</td><td dir="ltr">{m.user.email}</td>
        <td>{m.role === 'OWNER' ? ROLE_FA.OWNER : <select value={m.role} onChange={(e) => setRole(m.id, e.target.value)}>{['ADMIN', 'MANAGER', 'STAFF'].map((r) => <option key={r} value={r}>{ROLE_FA[r]}</option>)}</select>}</td>
        <td>{m.role !== 'OWNER' && <button className="btn ghost" onClick={() => remove(m.id)}>حذف</button>}</td></tr>)}</tbody></table></div>
    <form onSubmit={add} className="card" style={{ marginTop: 16 }}><h2 style={{ marginTop: 0 }}>افزودن عضو</h2><div className="grid">
      <label><span>نام</span><input style={{ width: '100%' }} value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></label>
      <label><span>ایمیل</span><input dir="ltr" style={{ width: '100%' }} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
      <label><span>رمز اولیه</span><input dir="ltr" type="password" autoComplete="new-password" style={{ width: '100%' }} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
      <label><span>نقش</span><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{['ADMIN', 'MANAGER', 'STAFF'].map((r) => <option key={r} value={r}>{ROLE_FA[r]}</option>)}</select></label></div>
      {msg && <p className={msg.includes('✓') ? '' : 'err'} role="status">{msg}</p>}<button className="btn">افزودن</button></form></>;
}
