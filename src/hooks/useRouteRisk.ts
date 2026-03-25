import { useState, useCallback, useEffect } from 'react'

export interface RoutePoint {
  lat: number
  lon: number
}

export interface RouteThreat {
  threat_type: 'VESSEL_SANCTIONS' | 'DARK_FLEET' | 'ANOMALY' | 'PIRACY'
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM'
  mmsi: number
  vessel_name: string
  lat: number
  lon: number
  detail: string
}

export function useRouteRisk(): {
  isRouteMode: boolean
  setIsRouteMode: (v: boolean) => void
  waypoints: RoutePoint[]
  addWaypoint: (point: RoutePoint) => void
  clearRoute: () => void
  threats: RouteThreat[]
  isAnalyzing: boolean
  threatCount: number
} {
  const [isRouteMode, setIsRouteMode] = useState(false)
  const [waypoints, setWaypoints] = useState<RoutePoint[]>([])
  const [threats, setThreats] = useState<RouteThreat[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const clearRoute = useCallback(() => {
    setWaypoints([])
    setThreats([])
    setIsAnalyzing(false)
  }, [])

  const addWaypoint = useCallback((point: RoutePoint) => {
    setWaypoints((prev) => {
      if (prev.length >= 2) {
        return [point]
      }
      return [...prev, point]
    })
  }, [])

  useEffect(() => {
    if (waypoints.length === 2) {
      let isMounted = true
      setIsAnalyzing(true)

      fetch('/api/route-risks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat1: waypoints[0].lat,
          lon1: waypoints[0].lon,
          lat2: waypoints[1].lat,
          lon2: waypoints[1].lon,
          corridorNm: 50,
        }),
      })
        .then((res) => {
          if (!res.ok) throw new Error('API Error')
          return res.json()
        })
        .then((data) => {
          if (isMounted) {
            setThreats(data.risks || [])
            setIsAnalyzing(false)
          }
        })
        .catch(() => {
          if (isMounted) {
            setIsAnalyzing(false)
          }
        })

      return () => {
        isMounted = false
      }
    }
  }, [waypoints])

  useEffect(() => {
    if (!isRouteMode) {
      clearRoute()
    }
  }, [isRouteMode, clearRoute])

  return {
    isRouteMode,
    setIsRouteMode,
    waypoints,
    addWaypoint,
    clearRoute,
    threats,
    isAnalyzing,
    threatCount: threats.length,
  }
}
