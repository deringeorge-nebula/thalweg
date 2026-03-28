'use client'

import React from 'react'
import { useWatchList } from '@/hooks/useWatchList'

function getFlagEmoji(flag: string): string {
  if (!flag || flag.length !== 2) return '🏳'
  const codePoints = flag.toUpperCase().split('').map(
    c => 127397 + c.charCodeAt(0)
  )
  return String.fromCodePoint(...codePoints)
}

function getRelativeTime(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return 'just now'
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`
  return `${Math.floor(diffInSeconds / 86400)} days ago`
}

interface WatchListPanelProps {
  onClose: () => void
  onSelectVessel: (mmsi: string) => void
}

export default function WatchListPanel({ onClose, onSelectVessel }: WatchListPanelProps) {
  const { watchList, removeVessel, clearAll, count } = useWatchList()

  const sortedList = [...watchList].sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())

  return (
    <div className="fixed right-0 top-0 h-full w-full sm:w-96 bg-[#0d1424] border-l border-[#1a2744] z-40 flex flex-col overflow-hidden">
      {/* HEADER */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-[#1a2744] flex items-center justify-between">
        <div className="flex items-center">
          <span className="font-mono tracking-widest text-xs text-[#00d4ff]">WATCH LIST</span>
          <span className="font-mono tracking-widest text-xs text-slate-400">
             {' · '}{count} VESSEL{count !== 1 ? 'S' : ''}
          </span>
        </div>
        <div className="flex items-center">
          {count > 0 && (
            <button
              onClick={clearAll}
              className="font-mono tracking-widest text-[10px] text-[#ef4444] border border-[#ef4444] px-2 py-1 mr-2 hover:bg-[#ef4444] hover:text-white transition-colors touch-manipulation"
            >
              CLEAR ALL
            </button>
          )}
          <button
            onClick={onClose}
            className="font-mono text-slate-400 hover:text-white transition-colors touch-manipulation text-sm px-2 py-1"
          >
            ✕
          </button>
        </div>
      </div>

      {/* BODY */}
      <div className="flex-1 overflow-y-auto">
        {count === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="font-mono tracking-widest text-xs text-slate-500 text-center">
              NO VESSELS ON WATCH LIST
            </div>
            <div className="font-mono tracking-widest text-[10px] text-slate-600 text-center max-w-[200px] leading-relaxed mt-1">
              SELECT A VESSEL ON THE GLOBE AND TAP WATCH TO ADD IT
            </div>
          </div>
        ) : (
          <div>
            {sortedList.map((vessel) => (
              <div key={vessel.mmsi} className="px-4 py-3 border-b border-[#1a2744] hover:bg-[#0a0f1e] transition-colors">
                <div className="text-white font-mono tracking-widest text-sm truncate">
                  {getFlagEmoji(vessel.flag)} {!vessel.name || vessel.name === 'UNKNOWN' ? <span className="text-slate-500">UNKNOWN VESSEL</span> : vessel.name}
                </div>
                <div className="text-slate-400 font-mono tracking-widest text-[10px] mt-0.5">
                  TYPE {vessel.vessel_type} · {vessel.flag}
                </div>
                <div className="text-[#00d4ff] font-mono tracking-widest text-[10px] mt-0.5">
                  MMSI: {vessel.mmsi}
                </div>
                <div className="text-slate-500 font-mono tracking-widest text-[10px] mt-0.5">
                  ADDED: {getRelativeTime(vessel.addedAt)}
                </div>
                <div className="mt-2 flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      onSelectVessel(vessel.mmsi)
                      onClose()
                    }}
                    className="font-mono tracking-widest text-[10px] border border-[#00d4ff] text-[#00d4ff] px-2 py-1 hover:bg-[#00d4ff] hover:text-[#0a0f1e] transition-colors touch-manipulation"
                  >
                    VIEW →
                  </button>
                  <button
                    onClick={() => removeVessel(vessel.mmsi)}
                    className="font-mono tracking-widest text-[10px] border border-[#1a2744] text-slate-400 px-2 py-1 hover:border-[#ef4444] hover:text-[#ef4444] transition-colors touch-manipulation"
                  >
                    REMOVE
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div className="flex-shrink-0 border-t border-[#1a2744] px-4 py-2">
        <div className="font-mono tracking-widest text-[10px] text-slate-600 text-center">
          WATCH LIST IS STORED LOCALLY ON THIS DEVICE
        </div>
      </div>
    </div>
  )
}
