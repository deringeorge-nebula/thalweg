import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.MY_SERVICE_ROLE_KEY!
)

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

  const { data, error } = await supabaseAdmin.rpc(
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
