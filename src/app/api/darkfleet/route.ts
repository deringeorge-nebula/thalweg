import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const revalidate = 60
export const dynamic = 'force-dynamic'

interface RiskEvent {
  id: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  category: 'DARK FLEET' | 'ANOMALY' | 'ROUTE RISK' | 'SANCTIONS' | 'PIRACY'
  title: string
  region: string
  detail: string
  timestamp: string
  mmsi?: string
  lat?: number
  lon?: number
}

interface DarkFleetRow {
  mmsi: string
  vessel_name: string | null
  dark_fleet_score: number | null
  lat: number | null
  lon: number | null
  sog: number | null
  flag_state: string | null
  sanctions_match: boolean | null
  is_anomaly: boolean | null
  nav_status: number | null
  last_update: string | null
}

function deriveRegion(lat?: number | null, lon?: number | null): string {
  if (lat == null || lon == null) return 'GLOBAL'
  if (lat >= 10 && lat <= 30 && lon >= 32 && lon <= 45) return 'RED SEA'
  if (lat >= 22 && lat <= 30 && lon >= 48 && lon <= 60) return 'PERSIAN GULF'
  if (lat >= 30 && lat <= 47 && lon >= -6 && lon <= 37) return 'MEDITERRANEAN'
  if (lat >= -40 && lat <= 25 && lon >= 40 && lon <= 100) return 'INDIAN OCEAN'
  if (lat >= -60 && lat <= 70 && lon >= -80 && lon <= 0) return 'ATLANTIC'
  if (lat >= -60 && lat <= 70 && (lon >= 120 || lon <= -120)) return 'PACIFIC'
  return 'GLOBAL'
}

function vesselLabel(row: DarkFleetRow): string {
  return row.vessel_name && row.vessel_name.trim() !== ''
    ? row.vessel_name.trim()
    : `MMSI ${row.mmsi}`
}

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data, error } = await supabase
      .from('alerts')
      .select('mmsi, vessel_name, dark_fleet_score, lat, lon, sog, flag_state, sanctions_match, is_anomaly, nav_status, last_update')
      .not('lat', 'is', null)
      .not('lon', 'is', null)
      .order('dark_fleet_score', { ascending: false })
      .limit(50)

    if (error) {
      console.error('[darkfleet] Supabase error:', error)
      return NextResponse.json([], { status: 200 })
    }

    const events: RiskEvent[] = (data ?? []).map((v: DarkFleetRow): RiskEvent => {
      const score = v.dark_fleet_score ?? 0
      const sog = v.sog ?? 0
      const isSanctioned = v.sanctions_match === true

      let severity: RiskEvent['severity']
      if (isSanctioned || score >= 79) severity = 'CRITICAL'
      else if (score >= 73) severity = 'HIGH'
      else if (score >= 63) severity = 'MEDIUM'
      else severity = 'LOW'

      const category: RiskEvent['category'] = isSanctioned ? 'SANCTIONS' : 'DARK FLEET'

      const title = isSanctioned
        ? `SANCTIONS MATCH — ${vesselLabel(v)}`
        : `DARK FLEET DETECTED — ${vesselLabel(v)}`

      const detail = isSanctioned
        ? `Vessel flagged as sanctions match. Dark fleet score: ${score}/100. SOG: ${sog.toFixed(1)} kts. Flag: ${v.flag_state ?? 'UNKNOWN'}.`
        : `Dark fleet score: ${score}/100. SOG: ${sog.toFixed(1)} kts. Flag: ${v.flag_state ?? 'UNKNOWN'}. AIS manipulation risk detected.`

      return {
        id: `darkfleet-${v.mmsi}`,
        severity,
        category,
        title,
        region: deriveRegion(v.lat, v.lon),
        detail,
        timestamp: v.last_update ?? new Date().toISOString(),
        mmsi: v.mmsi,
        lat: v.lat ?? undefined,
        lon: v.lon ?? undefined,
      }
    })

    return NextResponse.json(events, {
      headers: {
        'Cache-Control': 's-maxage=60, stale-while-revalidate=30',
      },
    })
  } catch (err) {
    console.error('[darkfleet] Unexpected error:', err)
    return NextResponse.json([], { status: 200 })
  }
}