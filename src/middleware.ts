import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const config = {
  matcher: '/api/:path*',
}

export async function middleware(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown'

  // SHA-256 hash the IP for privacy — store hash, not raw IP
  const encoder = new TextEncoder()
  const ipBytes = encoder.encode(ip + (process.env.RATE_LIMIT_SALT ?? 'thalweg'))
  const hashBuffer = await crypto.subtle.digest('SHA-256', ipBytes)
  const ipHash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16)

  // Truncate to the current minute window
  const now = new Date()
  now.setSeconds(0, 0)
  const windowStart = now.toISOString()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.MY_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_ip_hash: ipHash,
    p_window_start: windowStart,
    p_limit: 60,
  })

  if (error) {
    // On rate-limit DB failure: fail open (let request through, log error)
    console.error('[rate-limit] RPC error:', error.message)
    return NextResponse.next()
  }

  const response = NextResponse.next()

  // Always attach rate limit headers
  response.headers.set('X-RateLimit-Limit', '60')
  response.headers.set('X-RateLimit-Remaining', String(data.remaining ?? 0))
  response.headers.set('X-RateLimit-Window', 'per-minute')
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type')

  if (data.exceeded) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        message: 'Maximum 60 requests per minute. See X-RateLimit-Remaining header.',
        retry_after_seconds: 60,
        docs: 'https://github.com/YOUR_USERNAME/thalweg#api',
      },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': '60',
          'X-RateLimit-Remaining': '0',
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      }
    )
  }

  return response
}
