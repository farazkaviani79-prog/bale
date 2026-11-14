'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api, useApi, fa, rial, statusFa } from '@/lib/client';
import { ErrorBox, Loading } from '@/components/ui';
const NEXT: Record<string, string[]> = { PAID: ['PROCESSING'], PROCESSING: ['SHIPPED'], SHIPPED: ['COMPLETED'], PENDING: ['CANCELLED'], AWAITING_PAYMENT: ['CANCELLED'] };
export default function OrderDetail({ params }: { params: { id: string } }) {
  const { data: o, error, loading, reload } = useApi<any>(`orders/${params.id}`); const [msg, setMsg] = useState('');
  async function go(status: string) { setMsg(''); try { await api(`orders/${params.id}/status`, { method: 'POST', body: JSON.stringify({ status }) }); reload(); } catch (e: any) { setMsg(e.message); } }
  if (loading) return <Loading />; if (error || !o) return <ErrorBox msg={error ?? 'یافت نشد'} retry={reload} />;
  return <><p><Link href="/orders">← سفارش‌ها</Link></p><h1>سفارش {fa(o.orderNumber)} <span className="badge">{statusFa[o.status]}</span></h1>
    <section className="grid"><article className="card"><b>مشتری</b><p>{o.customerSnapshot?.fullName ?? '—'}</p>{o.shippingAddress && <p className="mute">{o.shippingAddress.city}، {o.shippingAddress.addressLine}<br />{o.shippingAddress.recipientName} — <span dir="ltr">{o.shippingAddress.phone}</span></p>}</article>
      <article className="card"><b>مبلغ</b><p>جمع کالاها: {rial(o.subtotalAmount)}<br />تخفیف: {rial(o.discountAmount)}<br />ارسال: {rial(o.shippingAmount)}<br /><b>کل: {rial(o.totalAmount)}</b></p></article></section>
    <div className="card scroll" style={{ marginTop: 14 }}><table className="tbl"><thead><tr><th>کالا</th><th>SKU</th><th>تعداد</th><th>قیمت واحد</th><th>جمع</th></tr></thead><tbody>{o.items.map((i: any) => <tr key={i.id}><td>{i.productName}</td><td dir="ltr">{i.sku}</td><td>{fa(i.quantity)}</td><td>{rial(i.unitAmount)}</td><td>{rial(i.lineAmount)}</td></tr>)}</tbody></table></div>
    <div className="toolbar" style={{ marginTop: 14 }}>{(NEXT[o.status] ?? []).map((s) => <button key={s} className={s === 'CANCELLED' ? 'btn ghost' : 'btn'} onClick={() => go(s)}>{s === 'CANCELLED' ? 'لغو سفارش' : `تغییر به «${statusFa[s]}»`}</button>)}</div>
    {msg && <p className="err" role="alert">{msg}</p>}
    <section className="card"><h2 style={{ marginTop: 0 }}>تاریخچه وضعیت</h2>{o.statusHistory.map((h: any) => <p key={h.id}>{new Date(h.createdAt).toLocaleString('fa-IR')} — {statusFa[h.toStatus]} <span className="mute">{h.note}</span></p>)}</section></>;
}
