'use client';

import { useVesselTrack } from '@/hooks/useVesselTrack';

interface VesselData {
  mmsi: number;
  vessel_name?: string;
  flag_state?: string;
  type_category?: string;
  ship_type?: number;
  sog?: number;
  cog?: number;
  nav_status?: number;
  sanctions_match?: boolean;
  dark_fleet_score?: number;
  is_anomaly?: boolean;
  anomaly_type?: string;
  lat?: number;
  lon?: number;
  last_update?: string;
}

interface ComparePanelProps {
  vesselA: VesselData;
  vesselB: VesselData;
  onClose: () => void;
}

function navStatusLabel(status?: number): string {
  const labels: Record<number, string> = {
    0: 'Underway',
    1: 'At Anchor',
    2: 'Not Under Command',
    3: 'Restricted',
    5: 'Moored',
    7: 'Fishing',
    8: 'Sailing',
    15: 'Unknown',
  };
  return labels[status ?? 15] ?? 'Unknown';
}

export function ComparePanel({ vesselA, vesselB, onClose }: ComparePanelProps) {
  const { track: trackA, hasTrack: hasTrackA } = useVesselTrack(vesselA.mmsi);
  const { track: trackB, hasTrack: hasTrackB } = useVesselTrack(vesselB.mmsi);

  // Compute diff highlights
  const flagsDiffer = vesselA.flag_state !== vesselB.flag_state;
  const darkDiffer =
    Math.abs((vesselA.dark_fleet_score ?? 0) - (vesselB.dark_fleet_score ?? 0)) > 10;

  function darkFleetColor(score?: number): string {
    if ((score ?? 0) >= 80) return 'text-[#ef4444]';
    if ((score ?? 0) >= 60) return 'text-[#eab308]';
    return 'text-slate-500';
  }

  function anomalyColor(isAnomaly?: boolean): string {
    return isAnomaly ? 'text-[#f97316]' : 'text-slate-200';
  }

  function sanctionsColor(match?: boolean): string {
    return match ? 'text-[#ef4444]' : 'text-slate-200';
  }

  function flagColor(vessel: VesselData): string {
    return flagsDiffer ? 'text-[#eab308]' : 'text-slate-200';
  }

  function darkScoreValueColor(vessel: VesselData, other: VesselData): string {
    if (!darkDiffer) return 'text-slate-200';
    const score = vessel.dark_fleet_score ?? 0;
    const otherScore = other.dark_fleet_score ?? 0;
    return score > otherScore ? 'text-[#ef4444]' : 'text-slate-200';
  }

  // Build diff summary
  const diffs: string[] = [];
  if (darkDiffer) {
    diffs.push(
      `Dark fleet score difference: ${Math.abs(
        (vesselA.dark_fleet_score ?? 0) - (vesselB.dark_fleet_score ?? 0)
      )} pts`
    );
  }
  if (flagsDiffer) {
    diffs.push(`Different flag states: ${vesselA.flag_state ?? '—'} vs ${vesselB.flag_state ?? '—'}`);
  }
  if (vesselA.sanctions_match !== vesselB.sanctions_match) {
    diffs.push('Sanctions status differs');
  }
  if (vesselA.is_anomaly !== vesselB.is_anomaly) {
    diffs.push('Anomaly status differs');
  }

  function VesselColumn({
    vessel,
    other,
    track,
    hasTrack,
  }: {
    vessel: VesselData;
    other: VesselData;
    track: typeof trackA;
    hasTrack: boolean;
  }) {
    const rows = [
      {
        label: 'Flag State',
        value: vessel.flag_state ?? '—',
        className: flagColor(vessel),
      },
      {
        label: 'Type',
        value: vessel.type_category ?? '—',
        className: 'text-slate-200',
      },
      {
        label: 'Speed',
        value: vessel.sog != null ? `${vessel.sog.toFixed(1)} kn` : '— kn',
        className: 'text-slate-200',
      },
      {
        label: 'Nav Status',
        value: navStatusLabel(vessel.nav_status),
        className: 'text-slate-200',
      },
      {
        label: 'Anomaly',
        value: vessel.is_anomaly ? (vessel.anomaly_type ?? 'YES') : 'None',
        className: anomalyColor(vessel.is_anomaly),
      },
      {
        label: 'Dark Fleet',
        value: `${vessel.dark_fleet_score ?? 0}/100`,
        className: darkScoreValueColor(vessel, other),
      },
      {
        label: '24h Track',
        value: hasTrack ? `${track.length} positions` : 'No history',
        className: 'text-slate-200',
      },
      {
        label: 'Last Update',
        value: vessel.last_update
          ? new Date(vessel.last_update).toUTCString().slice(0, 22)
          : '—',
        className: 'text-slate-200',
      },
    ];

    return (
      <div>
        {/* Vessel Header */}
        <div className="bg-[#0d1424] rounded-lg px-4 py-3 mb-3 flex items-center justify-between">
          <div className="min-w-0 mr-3">
            <div className="text-white font-data font-bold text-sm truncate max-w-[160px]">
              {vessel.vessel_name ?? 'Unknown Vessel'}
            </div>
            <div className="text-slate-500 text-[10px] font-data mt-0.5">
              MMSI {vessel.mmsi}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            {vessel.sanctions_match && (
              <span className="bg-red-500/20 text-red-400 text-[9px] font-data px-2 py-0.5 rounded tracking-widest">
                SANCTIONED
              </span>
            )}
            <div className={`text-2xl font-bold font-data ${darkFleetColor(vessel.dark_fleet_score)}`}>
              {vessel.dark_fleet_score ?? 0}
            </div>
            <div className="text-[10px] font-data text-slate-500 text-center">DARK FLEET</div>
          </div>
        </div>

        {/* Fields Table */}
        <div>
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex justify-between items-center py-1.5 border-b border-[#1a2744] last:border-b-0"
            >
              <span className="text-[#64748b] text-[10px] font-data uppercase tracking-widest w-24 flex-shrink-0">
                {row.label}
              </span>
              <span className={`text-xs font-data text-right ${row.className}`}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[#0a0f1e]/98 backdrop-blur-sm border-t-2 border-[#00d4ff] z-50 max-h-[60vh] sm:max-h-[45vh] overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-4">
        {/* Header Row */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-[#00d4ff] text-xs font-data tracking-widest">
            VESSEL COMPARISON
          </span>
          <button
            onClick={onClose}
            className="text-slate-400 text-xs font-data hover:text-white cursor-pointer transition-colors"
          >
            ✕ CLOSE
          </button>
        </div>

        {/* Two Column Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          <VesselColumn
            vessel={vesselA}
            other={vesselB}
            track={trackA}
            hasTrack={hasTrackA}
          />
          <VesselColumn
            vessel={vesselB}
            other={vesselA}
            track={trackB}
            hasTrack={hasTrackB}
          />
        </div>

        {/* Diff Summary */}
        <div className="mt-4 pt-4 border-t border-[#1a2744]">
          {diffs.length > 0 ? (
            <>
              <div className="text-slate-500 text-[10px] font-data tracking-widest mb-2">
                KEY DIFFERENCES
              </div>
              <div className="flex flex-wrap gap-2">
                {diffs.map((diff) => (
                  <span
                    key={diff}
                    className="bg-[#1a2744] text-slate-300 text-[10px] font-data px-3 py-1 rounded-full"
                  >
                    {diff}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-slate-500 text-xs font-data">
              No significant differences detected.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
