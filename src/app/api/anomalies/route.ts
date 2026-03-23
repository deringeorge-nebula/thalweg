import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  
  // Extract parameters
  const severity = searchParams.get('severity')
  const typeParam = searchParams.get('type')
  const limitParam = searchParams.get('limit')
  const offsetParam = searchParams.get('offset')

  // Validation
  const validSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
  if (severity && !validSeverities.includes(severity)) {
    return NextResponse.json(
      { error: 'Invalid severity', message: 'Must be one of: LOW | MEDIUM | HIGH | CRITICAL' },
      { status: 400 }
    )
  }

  const validTypes = ['DARK_VESSEL', 'SPOOFING', 'SPEED_ANOMALY', 'STS_TRANSFER', 'MPA_VIOLATION', 'CASCADE']
  if (typeParam && !validTypes.includes(typeParam)) {
    return NextResponse.json(
      { error: 'Invalid type', message: 'Must be one of: DARK_VESSEL | SPOOFING | SPEED_ANOMALY | STS_TRANSFER | MPA_VIOLATION | CASCADE' },
      { status: 400 }
    )
  }

  let limit = 100
  if (limitParam) {
    const parsed = parseInt(limitParam, 10)
    if (!isNaN(parsed)) limit = parsed
  }
  if (limit < 1) limit = 1
  if (limit > 500) limit = 500

  let offset = 0
  if (offsetParam) {
    const parsed = parseInt(offsetParam, 10)
    if (!isNaN(parsed)) offset = parsed
  }
  if (offset < 0) offset = 0

  // Create isolated Supabase service role client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.MY_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  // 1. Total Count Query (with filters)
  let countQuery = supabase
    .from('anomalies')
    .select('*', { count: 'exact', head: true })
    .eq('resolved', false)
    .eq('false_positive', false)

  // 2. Data Query (with filters, sort, limit, offset)
  let dataQuery = supabase
    .from('anomalies')
    .select('*')
    .eq('resolved', false)
    .eq('false_positive', false)

  // Apply dynamic filters
  if (severity) {
    countQuery = countQuery.eq('severity', severity)
    dataQuery = dataQuery.eq('severity', severity)
  }
  
  if (typeParam) {
    countQuery = countQuery.eq('anomaly_type', typeParam)
    dataQuery = dataQuery.eq('anomaly_type', typeParam)
  }

  dataQuery = dataQuery
    // Assuming Postgres ENUM is used for severity to match the DB order natively
    .order('severity', { ascending: false }) 
    .order('detected_at', { ascending: false })
    .range(offset, offset + limit - 1)

  // 3. Meta Counts — explicit queries for CRITICAL and HIGH to bypass PostgREST GROUP BY limitation
  const criticalCountQuery = supabase
    .from('anomalies')
    .select('*', { count: 'exact', head: true })
    .eq('resolved', false)
    .eq('false_positive', false)
    .eq('severity', 'CRITICAL')

  const highCountQuery = supabase
    .from('anomalies')
    .select('*', { count: 'exact', head: true })
    .eq('resolved', false)
    .eq('false_positive', false)
    .eq('severity', 'HIGH')

  // Run all queries concurrently
  const [
    { count: total, error: countErr },
    { data: anomalies, error: dataErr },
    { count: criticalCount, error: criticalErr },
    { count: highCount, error: highErr }
  ] = await Promise.all([
    countQuery,
    dataQuery,
    criticalCountQuery,
    highCountQuery
  ])

  // Process standard DB errors
  if (countErr) return NextResponse.json({ error: 'Database error', message: countErr.message }, { status: 500 })
  if (dataErr) return NextResponse.json({ error: 'Database error', message: dataErr.message }, { status: 500 })
  if (criticalErr) return NextResponse.json({ error: 'Database error', message: criticalErr.message }, { status: 500 })
  if (highErr) return NextResponse.json({ error: 'Database error', message: highErr.message }, { status: 500 })

  // Construct precise payload contract
  const payload = {
    anomalies: anomalies || [],
    pagination: {
      total: total || 0,
      limit,
      offset,
      has_more: (total || 0) > offset + limit
    },
    filters: {
      severity: severity || null,
      type: typeParam || null
    },
    meta: {
      generated_at: new Date().toISOString(),
      critical_count: criticalCount || 0,
      high_count: highCount || 0
    }
  }

  const response = NextResponse.json(payload, { status: 200 })

  // Caching: Anomaly updates run roughly every 10 min — 30s cache is highly efficient and safe
  response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')

  return response
}
