import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('MY_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

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

interface OceanTile {
  generated_at: string
  current_time: string
  wind_time: string
  currents: CurrentPoint[]
  winds: WindPoint[]
}

interface Particle {
  lat: number
  lon: number
}

interface GeoJSONPolygon {
  type: 'Polygon'
  coordinates: number[][][]
}

interface SpillRequest {
  lat: number
  lon: number
  vessel_type?: string
  spill_tonnes?: number
  mmsi?: string
}

// Nearest-neighbour lookup in the current grid
// Returns {u, v} in m/s or {u:0, v:0} if no nearby point
function interpolateCurrent(
  lat: number,
  lon: number,
  currents: CurrentPoint[]
): { u: number; v: number } {
  // Find the single closest point within 1.5 degrees
  let best: CurrentPoint | null = null
  let bestDist = Infinity
  for (const c of currents) {
    const d = Math.abs(c.lat - lat) + Math.abs(c.lon - lon)
    if (d < bestDist) {
      bestDist = d
      best = c
    }
  }
  if (!best || bestDist > 3.0) return { u: 0, v: 0 }
  return { u: best.u, v: best.v }
}

// Same for wind
function interpolateWind(
  lat: number,
  lon: number,
  winds: WindPoint[]
): { u_wind: number; v_wind: number } {
  let best: WindPoint | null = null
  let bestDist = Infinity
  for (const w of winds) {
    const d = Math.abs(w.lat - lat) + Math.abs(w.lon - lon)
    if (d < bestDist) {
      bestDist = d
      best = w
    }
  }
  if (!best || bestDist > 5.0) return { u_wind: 0, v_wind: 0 }
  return { u_wind: best.u_wind, v_wind: best.v_wind }
}

// Convert m/s velocity to degrees/hour displacement
// 1 degree lat = 111,320 m
// 1 degree lon = 111,320 * cos(lat) m
function velocityToDegrees(
  u: number,  // eastward m/s
  v: number,  // northward m/s
  lat: number
): { dLon: number; dLat: number } {
  const metersPerDegLat = 111320
  const metersPerDegLon = 111320 * Math.cos((lat * Math.PI) / 180)
  const secondsPerHour = 3600
  return {
    dLat: (v * secondsPerHour) / metersPerDegLat,
    dLon: (u * secondsPerHour) / Math.max(metersPerDegLon, 1000)
  }
}

// Compute convex hull using Graham scan
// Returns points in counter-clockwise order
function convexHull(points: Particle[]): Particle[] {
  if (points.length < 3) return points

  // Find bottom-most point (lowest lat, then leftmost lon)
  let pivot = points[0]
  for (const p of points) {
    if (p.lat < pivot.lat || (p.lat === pivot.lat && p.lon < pivot.lon)) {
      pivot = p
    }
  }

  // Sort by polar angle relative to pivot
  const sorted = points
    .filter(p => p !== pivot)
    .sort((a, b) => {
      const angleA = Math.atan2(a.lat - pivot.lat, a.lon - pivot.lon)
      const angleB = Math.atan2(b.lat - pivot.lat, b.lon - pivot.lon)
      if (angleA !== angleB) return angleA - angleB
      // Same angle: sort by distance
      const dA = (a.lat - pivot.lat) ** 2 + (a.lon - pivot.lon) ** 2
      const dB = (b.lat - pivot.lat) ** 2 + (b.lon - pivot.lon) ** 2
      return dA - dB
    })

  const hull: Particle[] = [pivot]
  for (const p of sorted) {
    while (hull.length > 1) {
      const o = hull[hull.length - 2]
      const a = hull[hull.length - 1]
      const cross = (a.lon - o.lon) * (p.lat - o.lat) - (a.lat - o.lat) * (p.lon - o.lon)
      if (cross <= 0) hull.pop()
      else break
    }
    hull.push(p)
  }
  return hull
}

// Convert hull points to GeoJSON Polygon
function hullToGeoJSON(hull: Particle[]): GeoJSONPolygon {
  const coords = hull.map(p => [
    Math.round(p.lon * 1000) / 1000,
    Math.round(p.lat * 1000) / 1000
  ])
  // Close the ring
  if (coords.length > 0) coords.push(coords[0])
  return {
    type: 'Polygon',
    coordinates: [coords]
  }
}

// Haversine distance in km
function haversineKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    // ── Parse request ──
    const body = await req.json() as SpillRequest
    const { lat, lon, vessel_type = 'unknown', spill_tonnes = 500, mmsi } = body

    if (!lat || !lon || isNaN(lat) || isNaN(lon)) {
      return new Response(
        JSON.stringify({ error: 'lat and lon are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Load ocean tile from storage ──
    const { data: tileData, error: tileError } = await supabase.storage
      .from('ocean-data')
      .download('current-tile.json')

    if (tileError || !tileData) {
      return new Response(
        JSON.stringify({ error: 'Ocean current data not available', detail: tileError?.message }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const tileText = await tileData.text()
    const tile: OceanTile = JSON.parse(tileText)

    // ── Initialize 200 particles at origin ──
    // Add small initial scatter (0.05 deg std dev) to simulate release area
    const PARTICLE_COUNT = 200
    const TIMESTEP_HOURS = 1
    const TOTAL_HOURS = 72
    const WIND_DRIFT_FACTOR = 0.03  // 3% Stokes drift
    const DIFFUSION_STD = 0.008     // degrees, turbulent diffusion per hour

    // Seeded deterministic scatter using simple LCG
    // so same input always produces same output
    let seed = Math.floor(Math.abs(lat * lon * 1000)) % 2147483647
    const lcg = () => {
      seed = (seed * 1664525 + 1013904223) & 0x7fffffff
      return seed / 0x7fffffff
    }

    let particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => ({
      lat: lat + (lcg() - 0.5) * 0.05,
      lon: lon + (lcg() - 0.5) * 0.05
    }))

    const snapshots: { h24: Particle[]; h48: Particle[]; h72: Particle[] } = {
      h24: [], h48: [], h72: []
    }

    // ── Run advection simulation ──
    for (let hour = 1; hour <= TOTAL_HOURS; hour++) {
      particles = particles.map(p => {
        const curr = interpolateCurrent(p.lat, p.lon, tile.currents)
        const wind = interpolateWind(p.lat, p.lon, tile.winds)

        // Combined velocity: current + 3% wind (Stokes drift)
        const u_total = curr.u + WIND_DRIFT_FACTOR * wind.u_wind
        const v_total = curr.v + WIND_DRIFT_FACTOR * wind.v_wind

        // Convert to degree displacement per timestep
        const disp = velocityToDegrees(u_total, v_total, p.lat)

        // Add turbulent diffusion
        const noise_lat = (lcg() - 0.5) * 2 * DIFFUSION_STD
        const noise_lon = (lcg() - 0.5) * 2 * DIFFUSION_STD

        return {
          lat: p.lat + disp.dLat * TIMESTEP_HOURS + noise_lat,
          lon: p.lon + disp.dLon * TIMESTEP_HOURS + noise_lon
        }
      })

      // Snapshot at 24h, 48h, 72h
      if (hour === 24) snapshots.h24 = [...particles]
      if (hour === 48) snapshots.h48 = [...particles]
      if (hour === 72) snapshots.h72 = [...particles]
    }

    // ── Compute convex hulls ──
    const hull24 = convexHull(snapshots.h24)
    const hull48 = convexHull(snapshots.h48)
    const hull72 = convexHull(snapshots.h72)

    // ── Compute centroid drift ──
    const centroid = (pts: Particle[]) => ({
      lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
      lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length
    })

    const c24 = centroid(snapshots.h24)
    const c48 = centroid(snapshots.h48)
    const c72 = centroid(snapshots.h72)

    // ── Build response ──
    const response = {
      mmsi: mmsi ?? null,
      vessel_type,
      spill_tonnes,
      origin: { lat, lon },
      generated_at: new Date().toISOString(),
      footprints: {
        h24: hullToGeoJSON(hull24),
        h48: hullToGeoJSON(hull48),
        h72: hullToGeoJSON(hull72)
      },
      centroid_drift: {
        h24: {
          lat: Math.round(c24.lat * 1000) / 1000,
          lon: Math.round(c24.lon * 1000) / 1000,
          distance_km: Math.round(haversineKm(lat, lon, c24.lat, c24.lon))
        },
        h48: {
          lat: Math.round(c48.lat * 1000) / 1000,
          lon: Math.round(c48.lon * 1000) / 1000,
          distance_km: Math.round(haversineKm(lat, lon, c48.lat, c48.lon))
        },
        h72: {
          lat: Math.round(c72.lat * 1000) / 1000,
          lon: Math.round(c72.lon * 1000) / 1000,
          distance_km: Math.round(haversineKm(lat, lon, c72.lat, c72.lon))
        }
      },
      particle_count: PARTICLE_COUNT,
      data_sources: {
        currents: 'NOAA CoastWatch Blended NRT - ' + (tile.current_time?.split('T')[0] ?? 'unknown'),
        wind: 'NOAA GFS - ' + (tile.wind_time?.split('T')[0] ?? 'unknown')
      }
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('spill-predictor failed:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
