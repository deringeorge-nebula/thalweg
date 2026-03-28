'use client'

import { useState, useEffect } from 'react'

export interface StsEvent {
  id: string
  mmsi1: string | null
  mmsi2: string | null
  vessel1_name: string | null
  vessel2_name: string | null
  lat: number
  lon: number
  separation_nm: number | null
  risk_score: number | null
  risk_factors: string[] | Record<string, unknown> | null
  last_confirmed_at: string | null
  first_detected_at: string | null
}

interface UseStsDataResult {
  stsEvents: StsEvent[]
  isLoading: boolean
}

export function useStsData(): UseStsDataResult {
  const [stsEvents, setStsEvents] = useState<StsEvent[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)

  useEffect(() => {
    fetch('/api/sts')
      .then(r => r.json())
      .then((data: StsEvent[]) => {
        setStsEvents(data)
        setIsLoading(false)
      })
      .catch(() => {
        setIsLoading(false)
      })
  }, [])

  return { stsEvents, isLoading }
}
