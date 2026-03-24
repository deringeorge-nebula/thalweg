import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { standardRatelimit, getClientIp } from '@/lib/ratelimit'

export async function GET(
  request: Request,
  { params }: { params: { locode: string } }
) {
  const ip = getClientIp(request)
  const { success } = await standardRatelimit.limit(ip)
  if (!success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again in a minute.' },
      { status: 429 }
    )
  }

  // Normalize LOCODE to uppercase
  const locodeRaw = params.locode || ''
  const locode = locodeRaw.toUpperCase()

  // Validation: 5 alphanumeric characters (2 alpha + 3 alnum)
  if (!/^[A-Z]{2}[A-Z0-9]{3}$/.test(locode)) {
    return NextResponse.json(
      { 
        error: 'Invalid UN LOCODE', 
        message: 'Format: 2-letter country code + 3-char location (e.g. SGSIN, NLRTM, INVCZ)'
      },
      { status: 400 }
    )
  }

  // Create isolated Supabase service role client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.MY_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  // 1. Fetch Port (case-insensitive lookup, even though we uppercased the param)
  const { data: port, error: portError } = await supabase
    .from('ports')
    .select('*')
    .ilike('un_locode', locode)
    .single()

  if (portError) {
    if (portError.code === 'PGRST116') {
      return NextResponse.json(
        { 
          error: 'Port not found', 
          locode,
          message: 'Only top 50 global ports are indexed. Full list at /api/ports (coming soon)'
        },
        { status: 404 }
      )
    }
    return NextResponse.json(
      { error: 'Database error', message: portError.message },
      { status: 500 }
    )
  }

  // 2. Fetch Congestion for the found port
  const { data: congestion, error: congestionError } = await supabase
    .from('port_congestion')
    .select('*')
    .eq('port_id', port.id)
    .maybeSingle()

  if (congestionError) {
    return NextResponse.json(
      { error: 'Database error', message: congestionError.message },
      { status: 500 }
    )
  }

  let dataFreshnessSeconds = null
  if (congestion && congestion.calculated_at) {
    dataFreshnessSeconds = Math.floor((Date.now() - new Date(congestion.calculated_at).getTime()) / 1000)
  }

  // Build the successful response payload
  const payload = {
    port,
    congestion: congestion || null,
    meta: {
      generated_at: new Date().toISOString(),
      locode,
      data_freshness_seconds: dataFreshnessSeconds
    }
  }

  const response = NextResponse.json(payload, { status: 200 })

  // Caching: Congestion updates every 5 minutes — 30s cache is accurate enough
  response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')

  return response
}
