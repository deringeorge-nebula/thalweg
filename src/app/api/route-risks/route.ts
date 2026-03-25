import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.MY_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { lat1, lon1, lat2, lon2, corridorNm = 50 } = body

    if (
      typeof lat1 !== 'number' || lat1 < -90 || lat1 > 90 ||
      typeof lon1 !== 'number' || lon1 < -180 || lon1 > 180 ||
      typeof lat2 !== 'number' || lat2 < -90 || lat2 > 90 ||
      typeof lon2 !== 'number' || lon2 < -180 || lon2 > 180 ||
      typeof corridorNm !== 'number'
    ) {
      return NextResponse.json(
        { error: 'Invalid coordinates' },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin.rpc('get_route_risks', {
      p_lat1: lat1,
      p_lon1: lon1,
      p_lat2: lat2,
      p_lon2: lon2,
      p_corridor_nm: corridorNm,
    })

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { risks: data, count: data?.length ?? 0 },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    )
  }
}
