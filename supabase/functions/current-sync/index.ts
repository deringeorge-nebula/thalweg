import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('MY_SERVICE_ROLE_KEY')!
)

interface CurrentPoint {
  lat: number
  lon: number
  u: number
  v: number
}

interface WindPoint {
  lat: number
  lon: number
  u_wind: number
  v_wind: number
}

function parseERDDAPCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n')
  if (lines.length < 3) return []
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
  const rows: Record<string, string>[] = []
  for (let i = 2; i < lines.length; i++) {
    const values = lines[i].split(',')
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = (values[idx] ?? '').trim() })
    rows.push(row)
  }
  return rows
}

// Convert 0-360 longitude to -180/180
function normalizeLon(lon: number): number {
  return lon > 180 ? lon - 360 : lon
}

Deno.serve(async () => {
  try {

    // ── CURRENTS: NOAA CoastWatch Blended NRT Currents ──
    // Dataset: noaacwBLENDEDNRTcurrentsDaily
    // Variables: u_current (eastward m/s), v_current (northward m/s)
    // Stride 6 = ~0.5 degree resolution (0.083 deg native)
    const currentUrl =
      'https://coastwatch.noaa.gov/erddap/griddap/noaacwBLENDEDNRTcurrentsDaily.csvp' +
      '?u_current[(last):1:(last)][(-80):6:(80)][(-180):6:(180)]' +
      ',v_current[(last):1:(last)][(-80):6:(80)][(-180):6:(180)]'

    let currents: CurrentPoint[] = []
    let currentTime = ''

    try {
      const res = await fetch(currentUrl)
      if (res.ok) {
        const csv = await res.text()
        const rows = parseERDDAPCsv(csv)
        // Get time from first row — header will contain 'time (UTC)'
        const timeKey = Object.keys(rows[0] ?? {}).find(k => k.includes('time')) ?? ''
        currentTime = rows[0]?.[timeKey] ?? ''
        const latKey = Object.keys(rows[0] ?? {}).find(k => k.includes('latitude')) ?? ''
        const lonKey = Object.keys(rows[0] ?? {}).find(k => k.includes('longitude')) ?? ''
        const uKey = Object.keys(rows[0] ?? {}).find(k => k.includes('u_current')) ?? ''
        const vKey = Object.keys(rows[0] ?? {}).find(k => k.includes('v_current')) ?? ''
        const CURRENT_FILL_VALUE = -214748.3648
        currents = rows
          .filter(r => r[uKey] && r[vKey] && r[uKey] !== 'NaN' && r[vKey] !== 'NaN')
          .map(r => ({
            lat: Math.round(parseFloat(r[latKey]) * 10) / 10,
            lon: Math.round(parseFloat(r[lonKey]) * 10) / 10,
            u: Math.round(parseFloat(r[uKey]) * 10000) / 10000,
            v: Math.round(parseFloat(r[vKey]) * 10000) / 10000,
          }))
          .filter(p =>
            !isNaN(p.lat) && !isNaN(p.lon) && !isNaN(p.u) && !isNaN(p.v) &&
            Math.abs(p.u - CURRENT_FILL_VALUE) > 1 &&
            Math.abs(p.v - CURRENT_FILL_VALUE) > 1
          )
      } else {
        console.error('Current fetch HTTP error:', res.status, await res.text())
      }
    } catch (e) {
      console.error('Current fetch failed:', e)
    }

    // ── WIND: NOAA GFS via CoastWatch ERDDAP ──
    // Dataset: NCEP_Global_Best
    // Variables: ugrd10m, vgrd10m (10m wind m/s)
    // Longitude: 0-360 range (not -180 to 180)
    const windUrl =
      'https://coastwatch.pfeg.noaa.gov/erddap/griddap/NCEP_Global_Best.csvp' +
      '?ugrd10m[(last):1:(last)][(-80):8:(80)][(0):8:(359)]' +
      ',vgrd10m[(last):1:(last)][(-80):8:(80)][(0):8:(359)]'

    let winds: WindPoint[] = []
    let windTime = ''

    try {
      const res = await fetch(windUrl)
      if (res.ok) {
        const csv = await res.text()
        const rows = parseERDDAPCsv(csv)
        const timeKey = Object.keys(rows[0] ?? {}).find(k => k.includes('time')) ?? ''
        windTime = rows[0]?.[timeKey] ?? ''
        const latKey = Object.keys(rows[0] ?? {}).find(k => k.includes('latitude')) ?? ''
        const lonKey = Object.keys(rows[0] ?? {}).find(k => k.includes('longitude')) ?? ''
        const uKey = Object.keys(rows[0] ?? {}).find(k => k.includes('ugrd10m')) ?? ''
        const vKey = Object.keys(rows[0] ?? {}).find(k => k.includes('vgrd10m')) ?? ''
        winds = rows
          .filter(r => r[uKey] && r[vKey] && r[uKey] !== 'NaN' && r[vKey] !== 'NaN')
          .map(r => ({
            lat: Math.round(parseFloat(r[latKey]) * 10) / 10,
            lon: Math.round(normalizeLon(parseFloat(r[lonKey])) * 10) / 10,
            u_wind: Math.round(parseFloat(r[uKey]) * 100) / 100,
            v_wind: Math.round(parseFloat(r[vKey]) * 100) / 100,
          }))
          .filter(p => !isNaN(p.lat) && !isNaN(p.lon) && !isNaN(p.u_wind) && !isNaN(p.v_wind))
      } else {
        console.error('Wind fetch HTTP error:', res.status, await res.text())
      }
    } catch (e) {
      console.error('Wind fetch failed:', e)
    }

    const tile = {
      generated_at: new Date().toISOString(),
      current_time: currentTime,
      wind_time: windTime,
      currents,
      winds
    }

    const { error: uploadError } = await supabase.storage
      .from('ocean-data')
      .upload('current-tile.json', JSON.stringify(tile), {
        contentType: 'application/json',
        upsert: true
      })

    if (uploadError) throw uploadError

    return new Response(JSON.stringify({
      success: true,
      current_points: currents.length,
      wind_points: winds.length,
      current_time: currentTime,
      wind_time: windTime,
      generated_at: tile.generated_at
    }), { headers: { 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('current-sync failed:', err)
    return new Response(JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : String(err)
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
