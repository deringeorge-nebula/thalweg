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

    const edgeUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/spill-predictor`

    try {
      const response = await fetch(edgeUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        setError(errorData?.error || 'Prediction service unavailable')
        setLoading(false)
        return
      }

      const data = await response.json()
      setResult(data as SpillResult)
      setLoading(false)
    } catch (err) {
      setError('Prediction service unavailable')
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
