'use client';
import { useState } from 'react';
import { useApi, fa } from '@/lib/client';
import { Empty, ErrorBox, Loading, useDebounced } from '@/components/ui';
export default function Customers() {
  const [q, setQ] = useState(''); const dq = useDebounced(q);
  const { data, error, loading, reload } = useApi<any[]>(`customers${dq ? `?q=${encodeURIComponent(dq)}` : ''}`);
  return <><h1>مشتریان</h1><div className="toolbar"><input placeholder="نام یا شماره موبایل" value={q} onChange={(e) => setQ(e.target.value)} /></div>
    {loading ? <Loading /> : error ? <ErrorBox msg={error} retry={reload} /> : !data?.length ? <Empty text="مشتری یافت نشد" /> :
      <div className="card scroll"><table className="tbl"><thead><tr><th>نام</th><th>موبایل</th><th>پیام‌رسان</th><th>سفارش‌ها</th></tr></thead>
        <tbody>{data.map((c) => <tr key={c.id}><td>{c.fullName ?? '—'}</td><td dir="ltr">{c.phone ?? '—'}</td><td>{c.identities.map((i: any) => i.username ? '@' + i.username : i.channel).join('، ') || '—'}</td><td>{fa(c._count.orders)}</td></tr>)}</tbody></table></div>}</>;
}
