import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

interface BriefContent {
    title?: string
    summary?: string
    severity?: string
    category?: string
    full_brief?: string
    data_points?: Record<string, number>
}

export async function GET() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.MY_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    )

    const { data, error } = await supabase
        .from('intelligence_briefs')
        .select('id, brief_type, region, content, generated_at, is_fallback')
        .eq('brief_type', 'region')
        .order('generated_at', { ascending: false })
        .limit(20)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const briefs = (data ?? []).map((row) => {
        const content = row.content as BriefContent
        return {
            id: row.id,
            title: content.title ?? `${row.region} Intelligence Brief`,
            summary: content.summary ?? content.full_brief?.slice(0, 200) ?? 'No summary available.',
            severity: (content.severity as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW') ?? 'MEDIUM',
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