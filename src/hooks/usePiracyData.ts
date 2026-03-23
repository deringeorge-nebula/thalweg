import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'

export interface PiracyIncident {
  id: string
  incident_date: string
  lat: number
  lon: number
  area: string
  sub_area: string | null
  attack_type: 'BOARDED' | 'FIRED_UPON' | 'APPROACHED' | 'HIJACKED' | 'ATTEMPTED' | 'SUSPICIOUS'
  vessel_type: string | null
  vessel_status: string | null
  crew_count: number | null
  description: string | null
  source: string
  year: number
}

export interface PiracyRiskZone {
  id: string
  name: string
  risk_level: 'HIGH' | 'CRITICAL'
  center_lat: number
  center_lon: number
  radius_nm: number
  description: string
}

export interface PiracyData {
  incidents: PiracyIncident[]
  riskZones: PiracyRiskZone[]
  loading: boolean
  error: string | null
  stats: {
    total: number
    byArea: Record<string, number>
    hijacked: number
    year2025: number
  }
}

// Client-side Supabase client initialization
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function usePiracyData(): PiracyData {
  const [incidents, setIncidents] = useState<PiracyIncident[]>([])
  const [riskZones, setRiskZones] = useState<PiracyRiskZone[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function fetchData() {
      try {
        setLoading(true)
        setError(null)
        
        // Execute queries concurrently
        const [incidentsResponse, riskZonesResponse] = await Promise.all([
          supabase
            .from('piracy_incidents')
            .select('*')
            .order('incident_date', { ascending: false }),
          supabase
            .from('piracy_risk_zones')
            .select('*')
            .eq('active', true)
        ])

        if (incidentsResponse.error) throw incidentsResponse.error
        if (riskZonesResponse.error) throw riskZonesResponse.error

        if (mounted) {
          setIncidents(incidentsResponse.data as PiracyIncident[])
          setRiskZones(riskZonesResponse.data as PiracyRiskZone[])
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || 'Failed to fetch piracy data')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      mounted = false
    }
  }, []) // Empty dependency array ensures run-once on mount

  // Compute stats on-the-fly and memoize them
  const stats = useMemo(() => {
    const byArea = incidents.reduce((acc, curr) => {
      if (curr.area) {
        acc[curr.area] = (acc[curr.area] || 0) + 1
      }
      return acc
    }, {} as Record<string, number>)

    return {
      total: incidents.length,
      byArea,
      hijacked: incidents.filter(i => i.attack_type === 'HIJACKED').length,
      year2025: incidents.filter(i => i.year === 2025).length
    }
  }, [incidents])

  // Memoize the deeply nested return object to prevent unnecessary re-renders in consumers
  return useMemo(
    () => ({
      incidents,
      riskZones,
      loading,
      error,
      stats
    }),
    [incidents, riskZones, loading, error, stats]
  )
}
