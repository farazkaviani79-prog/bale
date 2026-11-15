'use client';
import { useState } from 'react';
export default function Login() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); if (!/^\S+@\S+\.\S+$/.test(email)) return setErr('ایمیل نامعتبر است'); if (password.length < 1) return setErr('رمز عبور را وارد کنید');
    setBusy(true); const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    if (r.ok) window.location.href = '/dashboard'; else { setErr((await r.json().catch(() => ({}))).message ?? 'ورود ناموفق بود'); setBusy(false); }
  }
  return <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 16 }}>
    <form onSubmit={submit} className="card" style={{ width: 380, maxWidth: '100%' }}>
      <h1 style={{ marginTop: 0 }}>ورود به BotShop</h1>
      <label><span>ایمیل</span><input style={{ width: '100%' }} type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></label>
      <label><span>رمز عبور</span><input style={{ width: '100%' }} type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn" disabled={busy} style={{ width: '100%' }}>{busy ? 'در حال ورود…' : 'ورود'}</button>
    </form></main>;
}
