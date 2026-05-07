import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase configuration missing')
  return createClient(url, key)
}

export async function GET(
  _request: Request,
  { params }: { params: { locode: string } }
) {
  const { locode } = params

  if (!locode || !/^[A-Za-z0-9]{2,10}$/.test(locode)) {
    return NextResponse.json(
      { error: 'Invalid locode' },
      { status: 400 }
    )
  }

  const { data, error } = await getSupabaseAdmin().rpc(
    'get_port_forecast',
    { p_locode: params.locode.toUpperCase().trim(), p_hours_ahead: 72 }
  )

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json(
    { locode: locode.toUpperCase(), forecast: data },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    }
  )
}
