'use client';
import { useCallback, useEffect, useState } from 'react';
export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api/bff/${path}`, { ...init, headers: { 'content-type': 'application/json' } });
  if (r.status === 401) { window.location.href = '/login'; throw new Error('نشست منقضی شده است'); }
  const text = await r.text(); const j = text ? JSON.parse(text) : null;
  if (!r.ok) throw new Error(Array.isArray(j?.message) ? j.message[0] : j?.message ?? 'خطای ناشناخته');
  return j as T;
}
export async function upload(path: string, file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('فقط JPG، PNG یا WebP مجاز است');
  if (file.size > 2 * 1024 * 1024) throw new Error('حجم تصویر حداکثر ۲ مگابایت');
  const r = await fetch(`/api/bff/${path}`, { method: 'POST', headers: { 'content-type': file.type }, body: file });
  const t = await r.text(); const j = t ? JSON.parse(t) : null;
  if (!r.ok) throw new Error(Array.isArray(j?.message) ? j.message[0] : j?.message ?? 'خطای ناشناخته');
  return j;
}
export function useApi<T>(path: string | null) {
  const [s, set] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const load = useCallback(() => { if (!path) { set({ loading: false }); return; } set((p) => ({ ...p, loading: true, error: undefined })); api<T>(path).then((data) => set({ data, loading: false })).catch((e) => set({ error: e.message, loading: false })); }, [path]);
  useEffect(load, [load]);
  return { ...s, reload: load };
}
const FA = '۰۱۲۳۴۵۶۷۸۹';
export const fa = (n: number | string) => String(n).replace(/\d/g, (d) => FA[+d]);
export const rial = (v: string | number | bigint) => fa(v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '٬')) + ' ریال';
export const statusFa: Record<string, string> = { PENDING: 'در انتظار ثبت', AWAITING_PAYMENT: 'در انتظار پرداخت', PAID: 'پرداخت‌شده', PROCESSING: 'در حال پردازش', SHIPPED: 'ارسال‌شده', COMPLETED: 'تکمیل‌شده', CANCELLED: 'لغوشده', REFUNDED: 'بازپرداخت‌شده', DRAFT: 'پیش‌نویس', ACTIVE: 'فعال', ARCHIVED: 'بایگانی' };
