import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { standardRatelimit, getClientIp } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase configuration missing')
  return createClient(url, key)
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  const { success } = await standardRatelimit.limit(ip)
  if (!success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { mmsi, email, vessel_name } = body as Record<string, unknown>

  if (!mmsi || typeof mmsi !== 'string') {
    return NextResponse.json({ error: 'mmsi is required' }, { status: 400 })
  }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
  }

  const { error } = await getSupabaseAdmin()
    .from('watched_vessels')
    .upsert({
      mmsi,
      email,
      vessel_name: vessel_name ?? null,
      is_active: true,
    }, { onConflict: 'mmsi,email' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    message: `Now watching MMSI ${mmsi}. Alerts will be sent to ${email}.`
  })
}

export async function DELETE(request: NextRequest) {
  const ip = getClientIp(request)
  const { success } = await standardRatelimit.limit(ip)
  if (!success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { mmsi, email } = body as Record<string, unknown>

  if (!mmsi || !email) {
    return NextResponse.json({ error: 'mmsi and email required' }, { status: 400 })
  }

  const { error } = await getSupabaseAdmin()
    .from('watched_vessels')
    .update({ is_active: false })
    .eq('mmsi', mmsi)
    .eq('email', email)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: 'Watch removed.' })
}
