import { useState, useMemo, useCallback, useEffect } from 'react'
import Fuse from 'fuse.js'
import type { VesselRow } from '@/types/vessel'

export function useVesselSearch(vessels: VesselRow[]): {
  query: string
  setQuery: (q: string) => void
  results: VesselRow[]
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  clearSearch: () => void
} {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const fuse = useMemo(
    () =>
      new Fuse(vessels, {
        keys: [
          { name: 'vessel_name', weight: 0.6 },
          { name: 'mmsi', weight: 0.3 },
          { name: 'flag_state', weight: 0.1 },
        ],
        threshold: 0.3,
        minMatchCharLength: 2,
        shouldSort: true,
        includeScore: true,
      }),
    // React exhaustive-deps wants `vessels`, but recreating a 40k-item
    // Fuse index every 500ms when the globe array updates will freeze the UI.
    // Tracking vessels.length handles macro changes (loading/demo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vessels.length]
  )

  const results = useMemo(() => {
    if (query.length < 2) return []
    return fuse
      .search(query)
      .slice(0, 8)
      .map((r) => r.item)
  }, [fuse, query])

  const clearSearch = useCallback(() => {
    setQuery('')
    setIsOpen(false)
  }, [])

  useEffect(() => {
    setIsOpen(query.length >= 2)
  }, [query])

  return {
    query,
    setQuery,
    results,
    isOpen,
    setIsOpen,
    clearSearch,
  }
}
