import { useState, useEffect } from 'react'
import { DEMO_VESSELS } from '@/lib/demo-data'
import type { VesselRow } from '@/types/vessel'

export function useDemoMode(liveVesselCount: number): {
  isDemoMode: boolean
  demoVessels: VesselRow[]
} {
  const envForcedDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

  const [graceExpired, setGraceExpired] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setGraceExpired(true)
    }, 8000)

    return () => clearTimeout(timer)
  }, [])

  const isDemoMode = envForcedDemo || (graceExpired && liveVesselCount === 0)

  return {
    isDemoMode,
    demoVessels: isDemoMode ? DEMO_VESSELS : [],
  }
}
