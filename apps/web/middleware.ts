import { NextRequest, NextResponse } from 'next/server';
export function middleware(req: NextRequest) {
  const has = req.cookies.get('bs_at') || req.cookies.get('bs_rt');
  if (!has) return NextResponse.redirect(new URL('/login', req.url));
  return NextResponse.next();
}
export const config = { matcher: ['/dashboard/:path*', '/products/:path*', '/orders/:path*', '/inventory/:path*', '/customers/:path*', '/settings/:path*', '/coupons/:path*', '/team/:path*', '/admin/:path*'] };
