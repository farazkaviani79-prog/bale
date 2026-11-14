import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { API, setSession, clearSession } from '@/lib/server';

// بدنه فقط یک‌بار خوانده می‌شود (برای تلاش مجدد پس از نوسازی نشست) و نوع محتوا حفظ می‌شود (آپلود تصویر = بایت خام).
async function forward(req: NextRequest, path: string[], body: ArrayBuffer | undefined, token?: string) {
  const url = `${API}/${path.join('/')}${req.nextUrl.search}`;
  const ct = req.headers.get('content-type') ?? 'application/json';
  return fetch(url, { method: req.method, headers: { 'content-type': ct, ...(token && { authorization: `Bearer ${token}` }) }, body, cache: 'no-store' });
}
async function handle(req: NextRequest, { params }: { params: { path: string[] } }) {
  const c = cookies(); let at = c.get('bs_at')?.value; const rt = c.get('bs_rt')?.value;
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer();
  let r = await forward(req, params.path, body, at);
  if (r.status === 401 && rt) { // تلاش یک‌باره برای نوسازی نشست
    const rr = await fetch(`${API}/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) });
    if (rr.ok) { const t = await rr.json(); setSession(t); r = await forward(req, params.path, body, t.accessToken); } else clearSession();
  }
  const text = await r.text();
  return new NextResponse(text || null, { status: r.status, headers: { 'content-type': r.headers.get('content-type') ?? 'application/json' } });
}
export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
