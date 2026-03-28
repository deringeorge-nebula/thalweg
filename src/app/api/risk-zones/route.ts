import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 600

interface IntelBrief {
  id: string
  title: string
  summary: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  region: string
  category: string
  published_at: string
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

interface ZoneRow {
  id: string
  name: string | null
  risk_level: string | null
  center_lat: number | null
  center_lon: number | null
  radius_nm: number | null
  description: string | null
  active: boolean | null
}

function zoneRiskToSeverity(level: string | null): IntelBrief['severity'] {
  if (!level) return 'MEDIUM'
  const l = level.toUpperCase()
  if (l === 'CRITICAL') return 'CRITICAL'
  if (l === 'HIGH') return 'HIGH'
  if (l === 'MEDIUM') return 'MEDIUM'
  return 'LOW'
}

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseKey) return NextResponse.json([])

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data, error } = await supabase
      .from('piracy_risk_zones')
      .select('id, name, risk_level, center_lat, center_lon, radius_nm, description, active')
      .eq('active', true)
      .order('risk_level', { ascending: false })

    if (error) {
      console.error(error)
      return NextResponse.json([])
    }

    const briefs: IntelBrief[] = (data ?? []).map((z: ZoneRow): IntelBrief => {
      const radiusNote = z.radius_nm 
        ? ` Zone radius: ${z.radius_nm} nm.` 
        : ''
      return {
        id: `zone-${z.id}`,
        title: z.name ?? 'RISK ZONE',
        summary: z.description 
          ? `${z.description}${radiusNote}` 
          : `Active piracy risk zone.${radiusNote}`,
        severity: zoneRiskToSeverity(z.risk_level),
        region: deriveRegion(z.center_lat, z.center_lon),
        category: 'PIRACY RISK ZONE',
        published_at: new Date().toISOString(),
      }
    })

    return NextResponse.json(briefs, {
      headers: { 'Cache-Control': 's-maxage=600, stale-while-revalidate=120' }
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json([])
  }
}
