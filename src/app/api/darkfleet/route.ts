import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  // Create isolated Supabase service role client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.MY_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  interface DarkFleetVessel {
    mmsi: string
    vessel_name: string | null
    dark_fleet_score: number
    lat: number
    lon: number
    sog: number
    cog: number
    flag_state: string | null
    type_category: string | null
    destination: string | null
    imo_number: string | null
    sanctions_match: boolean
    is_anomaly: boolean
    nav_status: number | null
    last_update: string | null
  }

  // Execute single DB fetch retrieving exactly the specified columns
  // No `is_active` filter so vessels intentionally going dark remain in scope
  const { data: vessels, error } = await supabase
    .from('vessels')
    .select(
      'mmsi, vessel_name, dark_fleet_score, lat, lon, sog, cog, flag_state, type_category, ' +
      'destination, imo_number, sanctions_match, is_anomaly, nav_status, last_update'
    )
    .gte('dark_fleet_score', 60)
    .order('dark_fleet_score', { ascending: false })

  if (error) {
    return NextResponse.json(
      { error: 'Database error', message: error.message },
      { status: 500 }
    )
  }

  // Calculate score distribution in JS to prevent subsequent DB hits
  let criticalCount = 0
  let highCount = 0

  const safeVessels = (vessels as unknown as DarkFleetVessel[]) || []
  
  for (const vessel of safeVessels) {
    const score = vessel.dark_fleet_score ?? 0
    if (score >= 75) {
      criticalCount++
    } else if (score >= 60) {
      highCount++
    }
  }

  const payload = {
    vessels: safeVessels,
    count: safeVessels.length,
    score_distribution: {
      critical: criticalCount,
      high: highCount
    },
    meta: {
      generated_at: new Date().toISOString(),
      threshold: 60,
      note: 'Vessels with dark fleet score >= 60. Score computed from 9 signals: sanctions match (+40), AIS silence (+15), sanctioned EEZ proximity (+10), unknown type (+8), speed anomaly (+8), no vessel name (+6), stationary open ocean (+5), anchored open ocean (+5), heading unavailable (+3).'
    }
  }

  const response = NextResponse.json(payload, { status: 200 })

  // Caching configuration: dark-fleet-scorer updates roughly every 30m, so 60s cache is highly fresh
  response.headers.set(
    'Cache-Control', 
    'public, s-maxage=60, stale-while-revalidate=120'
  )

  return response
}
