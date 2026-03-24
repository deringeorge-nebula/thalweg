import { useState, useCallback } from 'react'

export interface SpillFootprint {
  type: 'Polygon'
  coordinates: number[][][]
}

export interface SpillCentroid {
  lat: number
  lon: number
  distance_km: number
}

export interface SpillResult {
  mmsi: string | null
  vessel_type: string
  spill_tonnes: number
  origin: { lat: number; lon: number }
  generated_at: string
  footprints: {
    h24: SpillFootprint
    h48: SpillFootprint
    h72: SpillFootprint
  }
  centroid_drift: {
    h24: SpillCentroid
    h48: SpillCentroid
    h72: SpillCentroid
  }
  particle_count: number
  data_sources: {
    currents: string
    wind: string
  }
}

export interface SpillState {
  loading: boolean
  result: SpillResult | null
  error: string | null
  runPrediction: (params: {
    lat: number
    lon: number
    mmsi?: string
    vessel_type?: string
    spill_tonnes?: number
  }) => Promise<void>
  clearResult: () => void
}

export function useSpillPredictor(): SpillState {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SpillResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runPrediction = useCallback(async (params: {
    lat: number
    lon: number
    mmsi?: string
    vessel_type?: string
    spill_tonnes?: number
  }) => {
    setLoading(true)
    setError(null)
    setResult(null)

    // Strip trailing slash from URL if present
    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
    const edgeUrl = `${supabaseUrl}/functions/v1/spill-predictor`

    try {
      const res = await fetch(edgeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''}`,
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
        },
        body: JSON.stringify(params)
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Spill predictor returned ${res.status}: ${errText}`)
      }

      const data: SpillResult = await res.json()
      setResult(data)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prediction service unavailable')
      setLoading(false)
      setResult(null)
    }
  }, [])

  const clearResult = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  return { loading, result, error, runPrediction, clearResult }
}

export default useSpillPredictor
