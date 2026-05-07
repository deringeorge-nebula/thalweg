import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase configuration missing')
  }
  return createClient(url, key)
}

export async function GET(
  request: Request,
  { params }: { params: { mmsi: string } }
) {
  try {
    const { mmsi } = params;

    if (!/^\d{9}$/.test(mmsi)) {
      return NextResponse.json({ error: 'Invalid MMSI' }, { status: 400 });
    }

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await getSupabaseAdmin()
      .from('vessel_positions')
      .select('lat, lon, sog, recorded_at')
      .eq('mmsi', parseInt(mmsi))
      .gte('recorded_at', cutoff)
      .order('recorded_at', { ascending: true })
      .limit(288); // max 1 point per 5 min over 24h

    if (error) {
      console.error('[vessel track API] Supabase error:', error.message);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    return NextResponse.json(
      { mmsi, track: data ?? [], count: data?.length ?? 0 },
      { headers: { 'Cache-Control': 'public, s-maxage=60' } }
    );
  } catch (err: unknown) {
    console.error('[vessel track API] Unexpected error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
