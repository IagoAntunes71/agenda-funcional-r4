import { NextResponse } from 'next/server';

export function GET(request: Request) {
    return NextResponse.redirect(new URL('/pwa/portal.webmanifest', request.url), 308);
}
