import { useState, useEffect } from 'react'
import useSpillPredictor, { SpillResult } from '../../hooks/useSpillPredictor'

export interface SpillPanelProps {
  vesselLat: number
  vesselLon: number
  mmsi: string
  vesselType: string | null
  onSpillResult: (result: SpillResult | null) => void
}

export default function SpillPanel({
  vesselLat,
  vesselLon,
  mmsi,
  vesselType,
  onSpillResult
}: SpillPanelProps) {
  const { loading, result, error, runPrediction, clearResult } = useSpillPredictor()
  const [tonnes, setTonnes] = useState<number>(1000)

  useEffect(() => {
    if (result) {
      onSpillResult(result)
    }
  }, [result, onSpillResult])

  const handleRun = () => {
    runPrediction({
      lat: vesselLat,
      lon: vesselLon,
      mmsi,
      vessel_type: vesselType || 'unknown',
      spill_tonnes: tonnes
    })
  }

  const handleClear = () => {
    clearResult()
    onSpillResult(null)
  }

  return (
    <div className="glass-panel mt-2 p-4 bg-navy-950/95">
      {/* Header Row */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-orange-400 font-heading text-xs uppercase tracking-widest font-semibold">
          SPILL DRIFT PREDICTION
        </span>
        {result ? (
          <button 
            onClick={handleClear}
            className="text-gray-400 hover:text-white text-xs font-data transition-colors"
          >
            Clear
          </button>
        ) : (
          <span className="text-gray-500 text-xs font-body">?</span>
        )}
      </div>

      {/* STATE 2 — Loading */}
      {loading && (
        <div className="py-2">
          <div className="text-gray-400 text-sm font-data animate-pulse mb-1">
            Running particle simulation...
          </div>
          <div className="text-gray-500 text-xs font-body">
            200 particles, 72h forward advection
          </div>
        </div>
      )}

      {/* Error state fallback */}
      {error && !loading && (
        <div className="text-red-400 text-xs font-data py-2 mb-3">
          Error: {error}
        </div>
      )}

      {/* STATE 1 — Idle */}
      {!loading && !result && (
        <div className="space-y-4">
          <div className="text-gray-400 text-xs italic font-body">
            Simulation only. Not for emergency response use.
          </div>
          
          <div className="space-y-2">
            <div className="text-gray-400 text-xs font-heading">EST. SPILL VOLUME</div>
            <div className="flex gap-2">
              {[500, 1000, 5000, 10000].map(val => (
                <button
                  key={val}
                  onClick={() => setTonnes(val)}
                  className={`flex-1 py-1 px-2 rounded text-xs font-data border transition-colors ${
                    tonnes === val
                      ? 'bg-orange-900/40 border-orange-500 text-orange-400'
                      : 'bg-navy-950/40 border-gray-600 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {val.toLocaleString()}t
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleRun}
            className="w-full py-2.5 rounded bg-orange-900/40 border border-orange-500 text-orange-400 font-heading uppercase tracking-wider text-sm transition-colors hover:bg-orange-900/60"
          >
            RUN 72H DRIFT PREDICTION
          </button>
        </div>
      )}

      {/* STATE 3 — Result */}
      {result && !loading && (
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-[16px_auto_1fr] items-baseline gap-x-2 gap-y-2 text-xs font-data">
            {/* 24 Hours */}
            <div className="w-2 h-2 rounded-full bg-yellow-400 translate-y-px"></div>
            <div className="text-gray-300 font-heading uppercase">24 HOURS</div>
            <div className="text-gray-400 text-right">
              <span className="text-white block">{result.centroid_drift.h24.distance_km} km drift</span>
              {result.centroid_drift.h24.lat}, {result.centroid_drift.h24.lon}
            </div>

            {/* 48 Hours */}
            <div className="w-2 h-2 rounded-full bg-orange-400 translate-y-px mt-2"></div>
            <div className="text-gray-300 font-heading uppercase mt-2">48 HOURS</div>
            <div className="text-gray-400 text-right mt-2">
              <span className="text-white block">{result.centroid_drift.h48.distance_km} km drift</span>
              {result.centroid_drift.h48.lat}, {result.centroid_drift.h48.lon}
            </div>

            {/* 72 Hours */}
            <div className="w-2 h-2 rounded-full bg-red-400 translate-y-px mt-2"></div>
            <div className="text-gray-300 font-heading uppercase mt-2">72 HOURS</div>
            <div className="text-gray-400 text-right mt-2">
              <span className="text-white block">{result.centroid_drift.h72.distance_km} km drift</span>
              {result.centroid_drift.h72.lat}, {result.centroid_drift.h72.lon}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-800/50 space-y-2">
            <div className="text-gray-500 text-xs font-body">
              <div>Currents: {result.data_sources.currents}</div>
              <div>Wind: {result.data_sources.wind}</div>
            </div>
            <div className="text-gray-500 text-xs italic font-body">
              Simulation only. Not for emergency response use.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
