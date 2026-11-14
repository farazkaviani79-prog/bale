'use client';
import { useEffect, useState } from 'react';
export const Loading = () => <div className="card mute" role="status">در حال بارگذاری…</div>;
export const ErrorBox = ({ msg, retry }: { msg: string; retry?: () => void }) => <div className="card err" role="alert">{msg} {retry && <button className="btn ghost" onClick={retry}>تلاش مجدد</button>}</div>;
export const Empty = ({ text }: { text: string }) => <div className="card mute" style={{ textAlign: 'center', padding: 40 }}>{text}</div>;
export function Bars({ values, labels }: { values: number[]; labels: string[] }) {
  const max = Math.max(1, ...values);
  return <div className="bar" role="img" aria-label="نمودار فروش">{values.map((v, i) => <i key={i} title={`${labels[i]}: ${v}`} style={{ height: `${(v / max) * 100}%` }} />)}</div>;
}
export function Pager({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (p: number) => void }) {
  return <div className="toolbar" style={{ justifyContent: 'center', marginTop: 14 }}><button className="btn ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>قبلی</button><span className="mute">صفحه {page} از {pageCount}</span><button className="btn ghost" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>بعدی</button></div>;
}
export function useDebounced(v: string, ms = 350) {
  const [d, set] = useState(v);
  useEffect(() => { const t = setTimeout(() => set(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}
