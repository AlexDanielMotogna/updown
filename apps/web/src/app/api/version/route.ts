import { NextResponse } from 'next/server';
import { BUILD_ID, BREAKING_VERSION } from '@/lib/version';

// Always reflect the CURRENTLY deployed server build — never cache it, so a stale
// client polling this endpoint sees the new build id immediately after a deploy.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(
    { buildId: BUILD_ID, breaking: BREAKING_VERSION },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
