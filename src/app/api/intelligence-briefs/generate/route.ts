// src/app/api/intelligence-briefs/generate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface RegionBounds {
    latMin: number; latMax: number
    lonMin: number; lonMax: number
}

const REGION_BOUNDS: Record<string, RegionBounds> = {
    'GLOBAL': { latMin: -90, latMax: 90, lonMin: -180, lonMax: 180 },
    'INDIAN OCEAN': { latMin: -40, latMax: 30, lonMin: 20, lonMax: 110 },
    'RED SEA': { latMin: 12, latMax: 30, lonMin: 32, lonMax: 44 },
    'PERSIAN GULF': { latMin: 22, latMax: 30, lonMin: 48, lonMax: 60 },
    'MEDITERRANEAN': { latMin: 30, latMax: 47, lonMin: -6, lonMax: 42 },
    'ATLANTIC': { latMin: -60, latMax: 70, lonMin: -80, lonMax: 20 },
    'PACIFIC': { latMin: -60, latMax: 70, lonMin: 120, lonMax: -70 },
}

export async function POST(request: NextRequest) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const region: string = body.region
    if (!region || !REGION_BOUNDS[region]) {
        return NextResponse.json({
            error: 'region is required',
            valid: Object.keys(REGION_BOUNDS)
        }, { status: 400 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.MY_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    )

    const today = new Date().toISOString().split('T')[0]

    // Skip if already generated today
    const { data: existing } = await supabase
        .from('intelligence_briefs')
        .select('id')
        .eq('brief_type', 'region')
        .eq('region', region)
        .eq('date', today)
        .maybeSingle()

    if (existing) {
        return NextResponse.json({
            date: today,
            results: [{ region, status: 'skipped', reason: 'already generated today' }]
        })
    }

    const bounds = REGION_BOUNDS[region]
    const isGlobal = region === 'GLOBAL'

    // Fast lightweight queries — counts only, no full table scans
    const [darkFleetRes, piracyRes, anomalyRes, stsRes] = await Promise.allSettled([
        isGlobal
            ? supabase.from('vessels').select('*', { count: 'exact', head: true }).gte('dark_fleet_score', 60)
            : supabase.from('vessels').select('*', { count: 'exact', head: true })
                .gte('dark_fleet_score', 60)
                .gte('lat', bounds.latMin).lte('lat', bounds.latMax)
                .gte('lon', bounds.lonMin).lte('lon', bounds.lonMax),

        isGlobal
            ? supabase.from('piracy_incidents').select('*', { count: 'exact', head: true })
            : supabase.from('piracy_incidents').select('*', { count: 'exact', head: true })
                .gte('lat', bounds.latMin).lte('lat', bounds.latMax)
                .gte('lon', bounds.lonMin).lte('lon', bounds.lonMax),

        isGlobal
            ? supabase.from('anomalies').select('*', { count: 'exact', head: true }).eq('resolved', false)
            : supabase.from('anomalies').select('*', { count: 'exact', head: true })
                .eq('resolved', false)
                .gte('lat', bounds.latMin).lte('lat', bounds.latMax)
                .gte('lon', bounds.lonMin).lte('lon', bounds.lonMax),

        isGlobal
            ? supabase.from('sts_events').select('*', { count: 'exact', head: true }).eq('is_active', true)
            : supabase.from('sts_events').select('*', { count: 'exact', head: true })
                .eq('is_active', true)
                .gte('lat', bounds.latMin).lte('lat', bounds.latMax)
                .gte('lon', bounds.lonMin).lte('lon', bounds.lonMax),
    ])

    const darkFleetCount = darkFleetRes.status === 'fulfilled' ? (darkFleetRes.value.count ?? 0) : 0
    const piracyCount = piracyRes.status === 'fulfilled' ? (piracyRes.value.count ?? 0) : 0
    const anomalyCount = anomalyRes.status === 'fulfilled' ? (anomalyRes.value.count ?? 0) : 0
    const stsCount = stsRes.status === 'fulfilled' ? (stsRes.value.count ?? 0) : 0

    const prompt = `You are a maritime intelligence analyst. Generate a concise intelligence brief for the ${region} region.

LIVE DATA (as of ${new Date().toUTCString()}):
- Dark fleet vessels (score ≥60): ${darkFleetCount}
- Active piracy incidents: ${piracyCount}
- Active vessel anomalies: ${anomalyCount}
- Active STS transfers: ${stsCount}

Respond ONLY with valid JSON:
{
  "title": "Brief headline, max 10 words",
  "summary": "2-3 sentence intelligence summary with key findings",
  "severity": "CRITICAL or HIGH or MEDIUM or LOW",
  "category": "REGIONAL ASSESSMENT",
  "full_brief": "4-6 sentence detailed brief covering threat landscape and operational implications"
}`

    // Hard 8s abort — stays well inside Vercel Hobby 10s limit
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    let groqRes: Response
    try {
        groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
                max_tokens: 350,
            }),
            signal: controller.signal,
        })
    } catch {
        clearTimeout(timeout)
        return NextResponse.json({
            date: today,
            results: [{ region, status: 'error', reason: 'Groq request timed out or failed' }]
        })
    }
    clearTimeout(timeout)

    if (!groqRes.ok) {
        return NextResponse.json({
            date: today,
            results: [{ region, status: 'error', reason: `Groq HTTP ${groqRes.status}` }]
        })
    }

    const groqData = await groqRes.json()
    let content: Record<string, unknown>

    try {
        content = JSON.parse(groqData.choices[0].message.content)
    } catch {
        return NextResponse.json({
            date: today,
            results: [{ region, status: 'error', reason: 'Failed to parse Groq JSON response' }]
        })
    }

    const { error: insertError } = await supabase
        .from('intelligence_briefs')
        .insert({
            brief_type: 'region',
            region,
            date: today,
            content: {
                ...content,
                data_points: {
                    dark_fleet: darkFleetCount,
                    piracy: piracyCount,
                    anomalies: anomalyCount,
                    sts: stsCount,
                },
            },
            model_used: 'llama-3.3-70b-versatile',
            input_tokens: groqData.usage?.prompt_tokens ?? 0,
            output_tokens: groqData.usage?.completion_tokens ?? 0,
            is_fallback: false,
        })

    return NextResponse.json({
        date: today,
        results: [insertError
            ? { region, status: 'error', reason: insertError.message }
            : { region, status: 'generated' }
        ]
    })
}