import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 300

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

function derivePiracySeverity(attackType: string | null): RiskEvent['severity'] {
  if (!attackType) return 'MEDIUM'
  const t = attackType.toUpperCase()
  if (t.includes('HIJACK') || t.includes('BOARDED') || t.includes('FIRED')) 
    return 'CRITICAL'
  if (t.includes('ATTEMPTED') || t.includes('APPROACHED') || t.includes('ATTACK'))
    return 'HIGH'
  if (t.includes('SUSPICIOUS') || t.includes('ROBBERY') || t.includes('THEFT'))
    return 'MEDIUM'
  return 'MEDIUM'
}

interface PiracyRow {
  id: string
  incident_date: string | null
  lat: number | null
  lon: number | null
  area: string | null
  sub_area: string | null
  attack_type: string | null
  vessel_type: string | null
  vessel_status: string | null
  crew_count: number | null
  description: string | null
  source: string | null
  year: number | null
}

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseKey) return NextResponse.json([])

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data, error } = await supabase
      .from('piracy_incidents')
      .select('id, incident_date, lat, lon, area, sub_area, attack_type, vessel_type, vessel_status, crew_count, description, source, year')
      .not('lat', 'is', null)
      .not('lon', 'is', null)
      .order('incident_date', { ascending: false })
      .limit(25)

    if (error) {
      console.error(error)
      return NextResponse.json([])
    }

    const events: RiskEvent[] = (data ?? []).map((v: PiracyRow): RiskEvent => {
      const area = v.sub_area 
        ? `${v.area ?? 'UNKNOWN'} — ${v.sub_area}` 
        : (v.area ?? 'UNKNOWN')
      
      const title = v.attack_type
        ? `${v.attack_type.toUpperCase()} — ${area}`
        : `PIRACY INCIDENT — ${area}`

      const crewNote = v.crew_count 
        ? ` Crew aboard: ${v.crew_count}.` 
        : ''
      
      const vesselNote = v.vessel_type 
        ? ` Vessel type: ${v.vessel_type}.` 
        : ''
      
      const statusNote = v.vessel_status 
        ? ` Vessel status: ${v.vessel_status}.` 
        : ''
      
      const detail = v.description
        ? `${v.description}${crewNote}${vesselNote}`
        : `${area}.${crewNote}${vesselNote}${statusNote}`

      return {
        id: `piracy-${v.id}`,
        severity: derivePiracySeverity(v.attack_type),
        category: 'PIRACY',
        title,
        region: deriveRegion(v.lat, v.lon),
        detail,
        timestamp: v.incident_date 
          ? new Date(v.incident_date).toISOString() 
          : new Date().toISOString(),
        lat: v.lat ?? undefined,
        lon: v.lon ?? undefined,
      }
    })

    return NextResponse.json(events, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=60' }
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json([])
  }
}
