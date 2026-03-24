import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { standardRatelimit, getClientIp } from '@/lib/ratelimit'

export async function GET(
  request: Request,
  { params }: { params: { mmsi: string } }
) {
  const ip = getClientIp(request)
  const { success } = await standardRatelimit.limit(ip)
  if (!success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again in a minute.' },
      { status: 429 }
    )
  }

  const mmsi = params.mmsi

  // Validation: Exactly 9 digits
  if (!/^\d{9}$/.test(mmsi)) {
    return NextResponse.json(
      { 
        error: 'Invalid MMSI', 
        message: 'MMSI must be exactly 9 digits', 
        example: '/api/vessel/273267690' 
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

  // 1. Fetch Vessel
  const { data: vessel, error: vesselError } = await supabase
    .from('vessels')
    .select('*')
    .eq('mmsi', mmsi)
    .single()

  if (vesselError) {
    if (vesselError.code === 'PGRST116') {
      return NextResponse.json(
        { error: 'Vessel not found', mmsi },
        { status: 404 }
      )
    }
    return NextResponse.json(
      { error: 'Database error', message: vesselError.message },
      { status: 500 }
    )
  }

  // 2. Fetch Sanctions (conditionally build OR query)
  let sanctionsQuery = supabase.from('sanctioned_vessels').select('*')
  if (vessel.imo_number) {
    sanctionsQuery = sanctionsQuery.or(`mmsi.eq.${mmsi},imo_number.eq.${vessel.imo_number}`)
  } else {
    sanctionsQuery = sanctionsQuery.eq('mmsi', mmsi)
  }
  const { data: sanctions, error: sanctionsError } = await sanctionsQuery.limit(1).maybeSingle()

  if (sanctionsError) {
    return NextResponse.json(
      { error: 'Database error', message: sanctionsError.message },
      { status: 500 }
    )
  }

  // 3 & 4. Fetch Anomalies and STS Events in parallel
  const [anomaliesResult, stsEventsResult] = await Promise.all([
    supabase
      .from('anomalies')
      .select('*')
      .eq('mmsi', mmsi)
      .eq('resolved', false)
      .order('detected_at', { ascending: false })
      .limit(20),
    supabase
      .from('sts_events')
      .select('*')
      .or(`mmsi1.eq.${mmsi},mmsi2.eq.${mmsi}`)
      .eq('is_active', true)
      .order('first_detected_at', { ascending: false })
      .limit(10)
  ])

  if (anomaliesResult.error) {
    return NextResponse.json(
      { error: 'Database error', message: anomaliesResult.error.message },
      { status: 500 }
    )
  }
  
  if (stsEventsResult.error) {
    return NextResponse.json(
      { error: 'Database error', message: stsEventsResult.error.message },
      { status: 500 }
    )
  }

  // If vessel is flagged sanctioned but no enriched record found, return structured fallback
  const sanctionsResult = sanctions ?? (vessel?.sanctions_match === true
    ? {
        note: 'Vessel flagged as sanctions match. Detailed record pending data enrichment.',
        confirmed: true,
        source: 'vessels.sanctions_match flag (set by sanctions-sync)',
        mmsi: mmsi,
        enriched: false
      }
    : null)

  // Build the successful response payload
  const response = NextResponse.json(
    {
      vessel,
      sanctions: sanctionsResult,
      anomalies: anomaliesResult.data,
      sts_events: stsEventsResult.data,
      meta: {
        generated_at: new Date().toISOString(),
        mmsi
      }
    },
    { status: 200 }
  )

  // Explicit cache headers for high frequency production polling API endpoint
  response.headers.set('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=10')

  return response
}
