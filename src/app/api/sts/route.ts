import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 60

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

interface StsRow {
  id: string
  mmsi1: string | null
  mmsi2: string | null
  vessel1_name: string | null
  vessel2_name: string | null
  lat: number | null
  lon: number | null
  separation_nm: number | null
  vessel1_sog: number | null
  vessel2_sog: number | null
  risk_score: number | null
  risk_factors: string[] | Record<string, unknown> | null
  first_detected_at: string | null
  last_confirmed_at: string | null
  is_active: boolean | null
}

function deriveStsSevertiy(score: number | null): RiskEvent['severity'] {
  if (score == null) return 'MEDIUM'
  if (score >= 80) return 'CRITICAL'
  if (score >= 60) return 'HIGH'
  if (score >= 40) return 'MEDIUM'
  return 'LOW'
}

function formatRiskFactors(rf: StsRow['risk_factors']): string {
  if (!rf) return ''
  if (Array.isArray(rf)) return rf.join(', ')
  if (typeof rf === 'object') return Object.keys(rf).join(', ')
  return String(rf)
}

function vesselLabel(name: string | null, mmsi: string | null): string {
  return (name && name.trim() !== '') ? name.trim() : (mmsi ? `MMSI ${mmsi}` : 'UNKNOWN')
}

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseKey) return NextResponse.json([])

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data, error } = await supabase
      .from('sts_events')
      .select('id, mmsi1, mmsi2, vessel1_name, vessel2_name, lat, lon, separation_nm, vessel1_sog, vessel2_sog, risk_score, risk_factors, first_detected_at, last_confirmed_at, is_active')
      .eq('is_active', true)
      .not('lat', 'is', null)
      .not('lon', 'is', null)
      .order('risk_score', { ascending: false })
      .limit(50)

    if (error) {
      console.error(error)
      return NextResponse.json([])
    }

    const events: RiskEvent[] = (data ?? []).map((v: StsRow): RiskEvent => {
      const v1 = vesselLabel(v.vessel1_name, v.mmsi1)
      const v2 = vesselLabel(v.vessel2_name, v.mmsi2)
      const score = v.risk_score ?? 0
      const sep = v.separation_nm != null ? `${v.separation_nm.toFixed(2)} nm apart.` : ''
      const factors = formatRiskFactors(v.risk_factors)
      const factorNote = factors ? ` Risk factors: ${factors}.` : ''

      return {
        id: `sts-${v.id}`,
        severity: deriveStsSevertiy(v.risk_score),
        category: 'DARK FLEET',
        title: `STS TRANSFER — ${v1} / ${v2}`,
        region: deriveRegion(v.lat, v.lon),
        detail: `Active ship-to-ship transfer detected. Risk score: ${score}/100. ${sep}${factorNote}`,
        timestamp: v.last_confirmed_at ?? v.first_detected_at ?? new Date().toISOString(),
        mmsi: v.mmsi1 ?? undefined,
        lat: v.lat ?? undefined,
        lon: v.lon ?? undefined,
      }
    })

    return NextResponse.json(events, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' }
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json([])
  }
}
