import { cookies } from 'next/headers';
export const API = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const base = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/' };
/** توکن‌ها فقط در کوکی httpOnly هستند؛ جاوااسکریپت مرورگر هرگز آن‌ها را نمی‌بیند. */
export function setSession(t: { accessToken: string; refreshToken: string; expiresIn: number }) {
  const c = cookies(); c.set('bs_at', t.accessToken, { ...base, maxAge: t.expiresIn }); c.set('bs_rt', t.refreshToken, { ...base, maxAge: 30 * 86400 });
}
export function clearSession() { const c = cookies(); c.delete('bs_at'); c.delete('bs_rt'); }
