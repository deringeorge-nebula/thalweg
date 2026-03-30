// src/app/api/intelligence-briefs/generate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface RegionBounds {
    latMin: number; latMax: number
    lonMin: number; lonMax: number
    lonWrap?: boolean
}

type LonFilterQuery = {
    gte: (col: string, val: number) => LonFilterQuery
    lte: (col: string, val: number) => LonFilterQuery
    or: (filter: string) => LonFilterQuery
}

const applyLonFilter = <T extends LonFilterQuery>(query: T, bounds: RegionBounds): T => {
    if (bounds.lonWrap) {
        return query.or(`lon.gte.${bounds.lonMin},lon.lte.${bounds.lonMax}`) as T
    }
    return query.gte('lon', bounds.lonMin).lte('lon', bounds.lonMax) as T
}

const REGION_BOUNDS: Record<string, RegionBounds> = {
    'GLOBAL': { latMin: -90, latMax: 90, lonMin: -180, lonMax: 180 },
    'INDIAN OCEAN': { latMin: -40, latMax: 30, lonMin: 20, lonMax: 110 },
    'RED SEA': { latMin: 12, latMax: 30, lonMin: 32, lonMax: 44 },
    'PERSIAN GULF': { latMin: 22, latMax: 30, lonMin: 48, lonMax: 60 },
    'MEDITERRANEAN': { latMin: 30, latMax: 47, lonMin: -6, lonMax: 42 },
    'ATLANTIC': { latMin: -60, latMax: 70, lonMin: -80, lonMax: 20 },
    'PACIFIC': { latMin: -60, latMax: 70, lonMin: 120, lonMax: -70, lonWrap: true },
}

export async function POST(request: NextRequest) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const targetRegion: string = body.region
    if (!targetRegion || !REGION_BOUNDS[targetRegion]) {
        return NextResponse.json({ error: 'region is required', valid: Object.keys(REGION_BOUNDS) }, { status: 400 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.MY_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    )

    const today = new Date().toISOString().split('T')[0]
    const region = targetRegion

    // Skip if already generated today
    const { data: existing } = await supabase
        .from('intelligence_briefs')
        .select('id')
        .eq('brief_type', 'region')
        .eq('region', region)
        .eq('date', today)
        .maybeSingle()

    if (existing) {
        return NextResponse.json({ date: today, results: [{ region, status: 'skipped', reason: 'already generated today' }] })
    }

    const bounds = REGION_BOUNDS[region]

    const [darkFleetRes, piracyRes, anomaliesRes, stsRes] = await Promise.allSettled([
        applyLonFilter(
            supabase.from('vessels')
                .select('vessel_name, mmsi, dark_fleet_score, flag_state', { count: 'exact' })
                .gte('dark_fleet_score', 60).not('lat', 'is', null)
                .gte('lat', bounds.latMin).lte('lat', bounds.latMax),
            bounds
        ).order('dark_fleet_score', { ascending: false }).limit(5),

        applyLonFilter(
            supabase.from('piracy_incidents')
                .select('area, attack_type', { count: 'exact' })
                .gte('lat', bounds.latMin).lte('lat', bounds.latMax),
            bounds
        ).order('incident_date', { ascending: false }).limit(5),

        applyLonFilter(
            supabase.from('anomalies')
                .select('mmsi, anomaly_type', { count: 'exact' })
                .eq('resolved', false).not('lat', 'is', null)
                .gte('lat', bounds.latMin).lte('lat', bounds.latMax),
            bounds
        ).limit(5),

        applyLonFilter(
            supabase.from('sts_events')
                .select('mmsi1, mmsi2, risk_score', { count: 'exact' })
                .eq('is_active', true).not('lat', 'is', null)
                .gte('lat', bounds.latMin).lte('lat', bounds.latMax),
            bounds
        ).limit(5),
    ])

    const darkFleet = darkFleetRes.status === 'fulfilled' ? darkFleetRes.value : null
    const piracy = piracyRes.status === 'fulfilled' ? piracyRes.value : null
    const anomalies = anomaliesRes.status === 'fulfilled' ? anomaliesRes.value : null
    const sts = stsRes.status === 'fulfilled' ? stsRes.value : null

    const darkFleetCount = darkFleet?.count ?? 0
    const piracyCount = piracy?.count ?? 0
    const anomalyCount = anomalies?.count ?? 0
    const stsCount = sts?.count ?? 0

    const darkFleetList = darkFleet?.data?.length
        ? darkFleet.data.map((v: { vessel_name?: string; mmsi: string; dark_fleet_score: number; flag_state?: string }) =>
            `  - ${v.vessel_name ?? 'Unknown'} (MMSI: ${v.mmsi}, Score: ${v.dark_fleet_score}, Flag: ${v.flag_state ?? 'Unknown'})`
        ).join('\n')
        : null

    const piracyList = piracy?.data?.length
        ? piracy.data.map((p: { attack_type: string; area: string }) =>
            `  - ${p.attack_type} in ${p.area}`
        ).join('\n')
        : null

    const prompt = `You are a maritime intelligence analyst. Generate a concise intelligence brief for the ${region} region.

LIVE DATA (as of ${new Date().toUTCString()}):
- Dark fleet vessels (score ≥60): ${darkFleetCount}
- Active piracy incidents: ${piracyCount}
- Active vessel anomalies: ${anomalyCount}
- Active STS transfers: ${stsCount}
${darkFleetList ? `\nTop dark fleet vessels:\n${darkFleetList}` : ''}
${piracyList ? `\nRecent piracy incidents:\n${piracyList}` : ''}

Respond ONLY with valid JSON:
{
  "title": "Brief headline, max 10 words",
  "summary": "2-3 sentence intelligence summary with key findings",
  "severity": "CRITICAL or HIGH or MEDIUM or LOW",
  "category": "REGIONAL ASSESSMENT",
  "full_brief": "4-6 sentence detailed brief covering threat landscape, notable vessels, and operational implications"
}`

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0.3,
            max_tokens: 400,
        }),
    })

    if (!groqRes.ok) {
        return NextResponse.json({ date: today, results: [{ region, status: 'error', reason: `Groq ${groqRes.status}` }] })
    }

    const groqData = await groqRes.json()
    let content: Record<string, unknown>

    try {
        content = JSON.parse(groqData.choices[0].message.content)
    } catch {
        return NextResponse.json({ date: today, results: [{ region, status: 'error', reason: 'Failed to parse Groq response' }] })
    }

    const { error: insertError } = await supabase
        .from('intelligence_briefs')
        .insert({
            brief_type: 'region',
            region,
            date: today,
            content: {
                ...content,
                data_points: { dark_fleet: darkFleetCount, piracy: piracyCount, anomalies: anomalyCount, sts: stsCount },
            },
            model_used: 'llama-3.3-70b-versatile',
            input_tokens: groqData.usage?.prompt_tokens ?? 0,
            output_tokens: groqData.usage?.completion_tokens ?? 0,
            is_fallback: false,
        })

    const result = insertError
        ? { region, status: 'error', reason: insertError.message }
        : { region, status: 'generated' }

    return NextResponse.json({ date: today, results: [result] })
}