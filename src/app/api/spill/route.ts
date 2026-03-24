import { NextRequest, NextResponse } from 'next/server'

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 10
const ipRequestCounts = new Map<string, { count: number; resetAt: number }>()

function getRateLimitResult(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const record = ipRequestCounts.get(ip)

  if (!record || now > record.resetAt) {
    ipRequestCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 }
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 }
  }

  record.count++
  return { allowed: true, remaining: RATE_LIMIT_MAX - record.count }
}

export async function POST(request: NextRequest) {
  // Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown'

  const { allowed, remaining } = getRateLimitResult(ip)

  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Maximum 10 spill predictions per minute.' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
          'X-RateLimit-Remaining': '0',
          'Retry-After': '60',
        }
      }
    )
  }

  // Parse and validate request body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  const { lat, lon, vessel_type, spill_tonnes, mmsi } = body as Record<string, unknown>

  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return NextResponse.json(
      { error: 'lat and lon are required and must be numbers' },
      { status: 400 }
    )
  }

  if (lat < -90 || lat > 90) {
    return NextResponse.json(
      { error: 'lat must be between -90 and 90' },
      { status: 400 }
    )
  }

  if (lon < -180 || lon > 180) {
    return NextResponse.json(
      { error: 'lon must be between -180 and 180' },
      { status: 400 }
    )
  }

  // Proxy to Supabase edge function
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
  const edgeUrl = `${supabaseUrl}/functions/v1/spill-predictor`

  try {
    const edgeResponse = await fetch(edgeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''}`,
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      },
      body: JSON.stringify({ lat, lon, vessel_type, spill_tonnes, mmsi }),
    })

    if (!edgeResponse.ok) {
      const errText = await edgeResponse.text()
      return NextResponse.json(
        { error: 'Prediction service error', detail: errText },
        { status: edgeResponse.status }
      )
    }

    const data = await edgeResponse.json()

    return NextResponse.json(data, {
      headers: {
        'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
        'X-RateLimit-Remaining': String(remaining),
        'Cache-Control': 'no-store',
      }
    })

  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to reach prediction service', detail: err instanceof Error ? err.message : String(err) },
      { status: 503 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/spill',
    method: 'POST',
    rate_limit: '10 requests per minute',
    description: 'Oil spill drift prediction using 200-particle forward advection over 72 hours',
    body: {
      lat: 'number (required) - incident latitude -90 to 90',
      lon: 'number (required) - incident longitude -180 to 180',
      vessel_type: 'string (optional) - e.g. tanker, cargo, unknown',
      spill_tonnes: 'number (optional) - estimated spill volume in tonnes, default 500',
      mmsi: 'string (optional) - vessel MMSI for context'
    },
    example_request: {
      lat: 25.276,
      lon: 55.296,
      vessel_type: 'tanker',
      spill_tonnes: 5000,
      mmsi: '123456789'
    },
    data_sources: {
      currents: 'NOAA CoastWatch Blended NRT Currents',
      wind: 'NOAA GFS 10m wind'
    },
    output: {
      footprints: 'GeoJSON Polygons for 24h, 48h, 72h contamination extent',
      centroid_drift: 'Predicted spill center position and km drift at each horizon',
      particle_count: 200,
      disclaimer: 'Simulation only. Not for emergency response use.'
    }
  })
}
