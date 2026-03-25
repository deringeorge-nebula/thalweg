'use client'

import { useEffect, useRef } from 'react'
import { useVesselSearch } from '@/hooks/useVesselSearch'
import type { VesselRow } from '@/types/vessel'

export interface VesselSearchBarProps {
  vessels: VesselRow[]
  onVesselSelect: (vessel: VesselRow) => void
}

export function VesselSearchBar({ vessels, onVesselSelect }: VesselSearchBarProps) {
  const { query, setQuery, results, isOpen, setIsOpen, clearSearch } = useVesselSearch(vessels)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // CMD+K / CTRL+K GLOBAL SHORTCUT
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // CLICK OUTSIDE TO CLOSE
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        clearSearch()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [clearSearch])

  const handleResultClick = (vessel: VesselRow) => {
    onVesselSelect(vessel)
    clearSearch()
  }

  return (
    <div ref={containerRef} className="relative flex items-center">
      <input
        ref={inputRef}
        type="text"
        placeholder="Search vessel or MMSI..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (query.length >= 2) setIsOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            clearSearch()
            inputRef.current?.blur()
          }
        }}
        className="w-48 focus:w-64 transition-all duration-200 bg-[#0d1424] border border-[#1a2744] rounded px-3 py-1 text-white font-data text-xs focus:outline-none focus:border-[#00d4ff] placeholder:text-slate-500"
      />

      <span className="absolute right-3 text-slate-600 text-[10px] font-data pointer-events-none">
        ⌘K
      </span>

      {/* RESULTS DROPDOWN */}
      {isOpen && query.length >= 2 && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-[#0d1424] border border-[#1a2744] rounded-lg shadow-xl w-80 overflow-hidden">
          {results.length > 0 ? (
            results.map((vessel, i) => {
              // Color priority logic for dot
              const dotColor = vessel.sanctions_match
                ? '#ef4444' // red
                : vessel.is_anomaly
                ? '#f97316' // orange
                : (vessel.dark_fleet_score ?? 0) > 60
                ? '#eab308' // yellow
                : vessel.type_color ?? '#00d4ff' // cyan default

              return (
                <div
                  key={`${vessel.mmsi}-${i}`}
                  onClick={() => handleResultClick(vessel)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[#1a2744] cursor-pointer transition-colors border-b border-[#1a2744] last:border-b-0"
                >
                  {/* LEFT: Color dot */}
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: dotColor }}
                  />

                  {/* MIDDLE: Text */}
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-xs font-data font-medium truncate">
                      {vessel.vessel_name ?? 'Unknown Vessel'}
                    </div>
                    <div className="text-slate-400 text-[10px] font-data truncate mt-0.5">
                      {vessel.mmsi} {vessel.flag_state ? `· ${vessel.flag_state}` : ''}
                    </div>
                  </div>

                  {/* RIGHT: Status Badge */}
                  {vessel.sanctions_match ? (
                    <span className="text-[10px] font-data px-1.5 py-0.5 rounded bg-red-900/50 text-red-400 border border-red-800 flex-shrink-0">
                      SANCTION
                    </span>
                  ) : vessel.is_anomaly ? (
                    <span className="text-[10px] font-data px-1.5 py-0.5 rounded bg-orange-900/50 text-orange-400 border border-orange-800 flex-shrink-0">
                      ANOMALY
                    </span>
                  ) : (vessel.dark_fleet_score ?? 0) > 60 ? (
                    <span className="text-[10px] font-data px-1.5 py-0.5 rounded bg-yellow-900/50 text-yellow-400 border border-yellow-800 flex-shrink-0">
                      DARK FLEET
                    </span>
                  ) : null}
                </div>
              )
            })
          ) : (
            <div className="text-slate-500 text-xs font-data text-center py-4">
              No vessels found
            </div>
          )}
        </div>
      )}
    </div>
  )
}
