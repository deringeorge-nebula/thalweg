import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// ─── Row types from intelligence_briefs table ─────────────────────────────────

interface GlobalBriefContent {
  id?: string
  date?: string
  generated_at?: string
  classification?: string
  executive_summary?: string
  threat_level?: string
  top_alerts?: unknown[]
  regional_status?: unknown[]
  trend_signals?: unknown[]
  data_quality_note?: string
  generated_by?: string
  sources?: string[]
  anomaly_count?: number
  critical_anomaly_count?: number
  congested_port_count?: number
  new_piracy_incidents?: number
}

interface RegionBriefContent {
  title?: string
  summary?: string
  severity?: string
  category?: string
  full_brief?: string
  data_points?: Record<string, number>
}

interface GlobalBriefRow {
  id: string
  date: string
  generated_at: string
  is_fallback: boolean
  input_tokens: number
  output_tokens: number
  content: GlobalBriefContent
}

interface RegionBriefRow {
  id: string
  region: string | null
  generated_at: string
  is_fallback: boolean
  content: RegionBriefContent
}

// ─── Response shapes ──────────────────────────────────────────────────────────

interface GlobalBriefResponse {
  id: string
  date: string
  generated_at: string
  is_fallback: boolean
  threat_level: string
  executive_summary: string
  top_alerts: unknown[]
  regional_status: unknown[]
  trend_signals: unknown[]
  data_quality_note: string
  input_tokens: number
  output_tokens: number
}

interface RegionBriefResponse {
  id: string
  title: string
  summary: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  region: string
  category: string
  published_at: string
  is_fallback: boolean
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') ?? 'global'

  // ── Region briefs ───────────────────────────────────────────────────────────
  if (type === 'region') {
    const { data, error } = await supabase
      .from('intelligence_briefs')
      .select('id, region, content, generated_at, is_fallback')
      .eq('brief_type', 'region')
      .order('generated_at', { ascending: false })
      .limit(20)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const briefs: RegionBriefResponse[] = (data as RegionBriefRow[] ?? []).map((row) => {
      const content = row.content
      const rawSeverity = content.severity ?? 'MEDIUM'
      const severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' =
        rawSeverity === 'CRITICAL' || rawSeverity === 'HIGH' || rawSeverity === 'LOW'
          ? rawSeverity
          : 'MEDIUM'

      return {
        id: row.id,
        title: content.title ?? `${row.region ?? 'GLOBAL'} Intelligence Brief`,
        summary: content.summary ?? content.full_brief?.slice(0, 200) ?? 'No summary available.',
        severity,
        region: row.region ?? 'GLOBAL',
        category: content.category ?? 'REGIONAL ASSESSMENT',
        published_at: row.generated_at,
        is_fallback: row.is_fallback ?? false,
      }
    })

    return NextResponse.json(briefs, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    })
  }

  // ── Global brief ─────────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10)

  // Try today's brief first
  const { data: todayData, error: todayError } = await supabase
    .from('intelligence_briefs')
    .select('id, date, generated_at, is_fallback, input_tokens, output_tokens, content')
    .eq('brief_type', 'global')
    .eq('date', today)
    .order('generated_at', { ascending: false })
    .limit(1)

  if (todayError) {
    return NextResponse.json({ error: todayError.message }, { status: 500 })
  }

  let row: GlobalBriefRow | null = todayData && todayData.length > 0
    ? (todayData[0] as GlobalBriefRow)
    : null

  // Fall back to most recent global brief regardless of date
  if (!row) {
    const { data: latestData, error: latestError } = await supabase
      .from('intelligence_briefs')
      .select('id, date, generated_at, is_fallback, input_tokens, output_tokens, content')
      .eq('brief_type', 'global')
      .order('generated_at', { ascending: false })
      .limit(1)

    if (latestError) {
      return NextResponse.json({ error: latestError.message }, { status: 500 })
    }

    row = latestData && latestData.length > 0 ? (latestData[0] as GlobalBriefRow) : null
  }

  if (!row) {
    return NextResponse.json({ error: 'No intelligence brief available' }, { status: 404 })
  }

  const content = row.content

  const response: GlobalBriefResponse = {
    id: row.id,
    date: row.date,
    generated_at: row.generated_at,
    is_fallback: row.is_fallback ?? false,
    threat_level: content.threat_level ?? 'MODERATE',
    executive_summary: content.executive_summary ?? '',
    top_alerts: content.top_alerts ?? [],
    regional_status: content.regional_status ?? [],
    trend_signals: content.trend_signals ?? [],
    data_quality_note: content.data_quality_note ?? '',
    input_tokens: row.input_tokens ?? 0,
    output_tokens: row.output_tokens ?? 0,
  }

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  })
}