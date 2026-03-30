import { useState, useEffect } from 'react'

export interface ForecastPoint {
  hour_offset: number
  vessel_count: number
  congestion_index: number
}

export function usePortForecast(locode: string | null): {
  forecast: ForecastPoint[]
  isLoading: boolean
  error: string | null
} {
  const [forecast, setForecast] = useState<ForecastPoint[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!locode) {
      setForecast([])
      setIsLoading(false)
      setError(null)
      return
    }

    let isMounted = true
    setIsLoading(true)
    setError(null)

    async function loadForecast() {
      try {
        const res = await fetch(`/api/port/${locode}/forecast`)
        if (!res.ok) {
          const errorData = await res.json().catch(() => null)
          throw new Error(errorData?.error || `HTTP error ${res.status}`)
        }
        const data = await res.json()

        if (isMounted) {
          setForecast(data.forecast || [])
          setIsLoading(false)
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to fetch forecast')
          setIsLoading(false)
        }
      }
    }

    loadForecast()

    return () => {
      isMounted = false
    }
  }, [locode])

  return { forecast, isLoading, error }
}
