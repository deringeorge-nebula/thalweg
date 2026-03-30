// src/app/api/intelligence-briefs/generate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const VALID_REGIONS = [
    'GLOBAL', 'INDIAN OCEAN', 'RED SEA',
    'PERSIAN GULF', 'MEDITERRANEAN', 'ATLANTIC', 'PACIFIC'
] as const

type ValidRegion = typeof VALID_REGIONS[number]

export async function POST(request: NextRequest) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const region: string = body.region
    if (!region || !VALID_REGIONS.includes(region as ValidRegion)) {
        return NextResponse.json({ error: 'region is required', valid: VALID_REGIONS }, { status: 400 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.MY_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    )

    const today = new Date().toISOString().split('T')[0]

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

    const prompt = `You are a senior maritime intelligence analyst at a global risk firm. Today is ${new Date().toUTCString()}.

Generate a current intelligence brief for the ${region} region based on known maritime threat patterns, geopolitical context, and typical activity for this time of year.

Respond ONLY with valid JSON:
{
  "title": "Concise headline, max 10 words",
  "summary": "2-3 sentences covering the primary threat picture for this region right now",
  "severity": "CRITICAL or HIGH or MEDIUM or LOW",
  "category": "REGIONAL ASSESSMENT",
  "full_brief": "4-5 sentences covering: threat landscape, key chokepoints or risk zones, dark fleet or sanctions activity patterns, and operational recommendations for vessels transiting this region"
}`

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
                temperature: 0.4,
                max_tokens: 350,
            }),
            signal: controller.signal,
        })
    } catch {
        clearTimeout(timeout)
        return NextResponse.json({
            date: today,
            results: [{ region, status: 'error', reason: 'Groq timed out' }]
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
            results: [{ region, status: 'error', reason: 'Failed to parse Groq response' }]
        })
    }

    const { error: insertError } = await supabase
        .from('intelligence_briefs')
        .insert({
            brief_type: 'region',
            region,
            date: today,
            content,
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