'use client';
/**
 * ⚠️ تأییدنشده با مستندات رسمی بله (https://docs.bale.ai/miniapp): نام شیء سراسری SDK و فیلد initData.
 * فعلاً هر دو الگوی رایج بررسی می‌شود. initData فقط برای ارسال به سرور است و در سرور اعتبارسنجی می‌شود؛
 * هیچ تصمیم امنیتی در مرورگر گرفته نمی‌شود.
 */
declare global { interface Window { Bale?: { WebApp?: { initData?: string; ready?: () => void; expand?: () => void } }; Telegram?: { WebApp?: { initData?: string; ready?: () => void; expand?: () => void } } } }
// ✅ راستی‌آزمایی‌شده با ربات واقعی (۱۴۰۵/۰۸/۲۱): بله initData را در hash آدرس به شکل `#tgWebAppData=...` می‌دهد
// و شیء سراسری `BaleWebApp` است. چون hash پس از ناوبری داخلی ممکن است از بین برود، در sessionStorage نگه داشته می‌شود.
export function getInitData(): string {
  const w = typeof window === 'undefined' ? undefined : window;
  const app = (w as any)?.BaleWebApp ?? w?.Bale?.WebApp ?? w?.Telegram?.WebApp;
  app?.ready?.(); app?.expand?.();
  if (app?.initData) return app.initData;
  try {
    const fromHash = new URLSearchParams((w?.location.hash ?? '').replace(/^#/, '')).get('tgWebAppData');
    if (fromHash) { try { w?.sessionStorage.setItem('bs_initdata', fromHash); } catch { /* ignore */ } return fromHash; }
    const saved = w?.sessionStorage.getItem('bs_initdata'); if (saved) return saved;
  } catch { /* ignore */ }
  // فقط توسعه (Mock): initData امضاشده از آدرس
  if (process.env.NEXT_PUBLIC_MINIAPP_DEV === 'true') return new URLSearchParams(w?.location.search).get('initData') ?? '';
  return '';
}
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export async function mini<T = any>(storeId: string, path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}/miniapp/${storeId}/${path}`, { ...init, headers: { 'content-type': 'application/json', 'x-init-data': getInitData() } });
  const t = await r.text(); const j = t ? JSON.parse(t) : null;
  if (!r.ok) throw new Error(Array.isArray(j?.message) ? j.message[0] : j?.message ?? 'خطای ناشناخته');
  return j as T;
}
