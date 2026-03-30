'use client'

import { useState, useEffect } from 'react'

export interface WatchedVessel {
  mmsi: string
  name: string
  vessel_type: number
  flag: string
  addedAt: string   // ISO string
}

export interface UseWatchListReturn {
  watchList: WatchedVessel[]
  addVessel: (vessel: WatchedVessel) => void
  removeVessel: (mmsi: string) => void
  isWatched: (mmsi: string) => boolean
  clearAll: () => void
  count: number
}

const STORAGE_KEY = 'thalweg_watchlist'

export function useWatchList(): UseWatchListReturn {
  const [watchList, setWatchList] = useState<WatchedVessel[]>([])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        setWatchList(JSON.parse(stored))
      }
    } catch {
      // Ignore
    }
  }, [])

  const addVessel = (vessel: WatchedVessel) => {
    setWatchList(prev => {
      if (prev.some(v => v.mmsi === vessel.mmsi)) return prev
      const updated = [...prev, vessel]
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      } catch {
        // Ignore
      }
      return updated
    })
  }

  const removeVessel = (mmsi: string) => {
    setWatchList(prev => {
      const updated = prev.filter(v => v.mmsi !== mmsi)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      } catch {
        // Ignore
      }
      return updated
    })
  }

  const isWatched = (mmsi: string) => {
    return watchList.some(v => v.mmsi === mmsi)
  }

  const clearAll = () => {
    setWatchList([])
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Ignore
    }
  }

  return {
    watchList,
    addVessel,
    removeVessel,
    isWatched,
    clearAll,
    count: watchList.length
  }
}
