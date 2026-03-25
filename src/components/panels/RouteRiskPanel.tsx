'use client'

import { X } from 'lucide-react'
import type { RoutePoint, RouteThreat } from '@/hooks/useRouteRisk'

export interface RouteRiskPanelProps {
  waypoints: RoutePoint[]
  threats: RouteThreat[]
  isAnalyzing: boolean
  onClear: () => void
}

export function RouteRiskPanel({
  waypoints,
  threats,
  isAnalyzing,
  onClear,
}: RouteRiskPanelProps) {
  if (waypoints.length === 0) return null

  return (
    <div className="absolute right-4 top-20 w-80 glass-panel rounded z-20 overflow-hidden flex flex-col">
      {/* HEADER */}
      <div className="flex items-start justify-between p-4 border-b border-glow">
        <div className="flex-1 min-w-0">
          <div className="font-data text-white text-xs tracking-widest font-bold mb-1">
            ROUTE ANALYSIS
          </div>
          {waypoints.length === 1 ? (
            <div className="text-[#00d4ff] text-xs font-data">
              Origin set - Shift+click destination
            </div>
          ) : (
            <div className="text-slate-400 text-xs font-data">
              {waypoints[0].lat.toFixed(2)}°,{waypoints[0].lon.toFixed(2)}° →{' '}
              {waypoints[1].lat.toFixed(2)}°,{waypoints[1].lon.toFixed(2)}°
            </div>
          )}
        </div>
        <button
          onClick={onClear}
          className="text-slate-500 hover:text-white transition-colors ml-2"
        >
          <X size={16} />
        </button>
      </div>

      {/* BODY */}
      {waypoints.length === 2 && (
        <div className="p-4 bg-[#0a0f1e]/80">
          {/* STATUS BAR */}
          <div className="flex items-center gap-2 mb-3">
            {isAnalyzing ? (
              <>
                <div
                  className="w-2 h-2 rounded-full bg-[#eab308] animate-pulse"
                  style={{ boxShadow: '0 0 6px #eab308' }}
                />
                <span className="text-[#eab308] text-xs font-data">
                  Analyzing 50nm corridor...
                </span>
              </>
            ) : (
              <>
                <div
                  className={`w-2 h-2 rounded-full ${threats.length === 0 ? 'bg-[#00ff88]' : 'bg-[#ef4444]'
                    }`}
                  style={{
                    boxShadow: `0 0 6px ${threats.length === 0 ? '#00ff88' : '#ef4444'
                      }`,
                  }}
                />
                <span
                  className={`text-xs font-data ${threats.length === 0 ? 'text-[#00ff88]' : 'text-[#ef4444]'
                    }`}
                >
                  {threats.length} threats detected
                </span>
              </>
            )}
          </div>

          {/* NO THREATS */}
          {!isAnalyzing && threats.length === 0 && (
            <div className="py-6 border border-[#1a2744] bg-[#0d1424] rounded px-4">
              <div className="text-[#00ff88] text-sm font-data text-center w-full">
                Route corridor clear
              </div>
              <div className="text-slate-500 text-xs text-center mt-1">
                No sanctioned vessels, dark fleet, or anomalies detected within 50nm
              </div>
            </div>
          )}

          {/* THREATS LIST */}
          {!isAnalyzing && threats.length > 0 && (
            <div className="flex flex-col gap-2 mt-3 max-h-96 overflow-y-auto pr-1 custom-scrollbar">
              {threats.map((t, i) => {
                const borderColors = {
                  CRITICAL: 'border-[#ef4444]',
                  HIGH: 'border-[#f97316]',
                  MEDIUM: 'border-[#eab308]',
                }
                const borderColor = borderColors[t.severity] || 'border-slate-500'

                let badgeClass = ''
                if (t.threat_type === 'VESSEL_SANCTIONS') {
                  badgeClass = 'bg-red-900/50 text-red-400 border border-red-800'
                } else if (t.threat_type === 'DARK_FLEET') {
                  badgeClass = 'bg-yellow-900/50 text-yellow-400 border border-yellow-800'
                } else if (t.threat_type === 'ANOMALY') {
                  badgeClass = 'bg-orange-900/50 text-orange-400 border border-orange-800'
                } else {
                  badgeClass = 'bg-slate-800 text-slate-300 border border-slate-600'
                }

                return (
                  <div
                    key={`${t.mmsi}-${i}-${t.threat_type}`}
                    className={`border-l-2 ${borderColor} pl-3 py-1 bg-[#0d1424]/50`}
                  >
                    <div className="flex items-center mb-1">
                      <span
                        className={`text-[9px] font-data px-1 py-0.5 rounded mr-2 uppercase flex-shrink-0 ${badgeClass}`}
                      >
                        {t.threat_type.replace('_', ' ')}
                      </span>
                      <span className="text-white text-xs font-bold truncate">
                        {t.vessel_name || `MMSI: ${t.mmsi}`}
                      </span>
                    </div>
                    <div className="text-slate-400 text-[10px] font-data leading-snug">
                      {t.detail}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* CLEAR / NEW ROUTE */}
          {!isAnalyzing && (
            <button
              onClick={onClear}
              className="w-full mt-3 py-1.5 text-xs font-data border border-[#00d4ff]/30 text-[#00d4ff] rounded hover:bg-[#00d4ff]/10 transition-colors"
            >
              ANALYZE NEW ROUTE
            </button>
          )}
        </div>
      )}
    </div>
  )
}
