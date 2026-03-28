import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
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

interface AnomalyRow {
  id: string
  severity: string | null
  title: string | null
  description: string | null
  mmsi: string | null
  lat: number | null
  lon: number | null
  detected_at: string | null
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

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data, error } = await supabase
      .from('anomalies')
      .select('id, severity, title, description, mmsi, lat, lon, detected_at')
      .eq('anomaly_type', 'DARK_VESSEL')
      .eq('resolved', false)
      .eq('false_positive', false)
      .in('severity', ['MEDIUM', 'LOW'])
      .not('lat', 'is', null)
      .not('lon', 'is', null)
      .order('detected_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('[anomalies] Supabase error:', error)
      return NextResponse.json([], { status: 200 })
    }

    const events: RiskEvent[] = (data ?? []).map((v: AnomalyRow): RiskEvent => ({
      id: `anomaly-${v.id}`,
      severity: (v.severity as RiskEvent['severity']) ?? 'MEDIUM',
      category: 'ANOMALY',
      title: v.title ?? `VESSEL ANOMALY — MMSI ${v.mmsi ?? 'UNKNOWN'}`,
      region: deriveRegion(v.lat, v.lon),
      detail: v.description ?? 'Vessel anomaly detected.',
      timestamp: v.detected_at ?? new Date().toISOString(),
      mmsi: v.mmsi ?? undefined,
      lat: v.lat ?? undefined,
      lon: v.lon ?? undefined,
    }))

    return NextResponse.json(events, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' },
    })
  } catch (err) {
    console.error('[anomalies] Unexpected error:', err)
    return NextResponse.json([], { status: 200 })
  }
}