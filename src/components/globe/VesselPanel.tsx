// src/components/globe/VesselPanel.tsx
'use client';

import { useState, useEffect } from 'react';
import { generateVesselBrief } from '@/lib/intelligenceBrief';
import { X, Ship, AlertTriangle, AlertCircle, Sparkles, Loader2 } from 'lucide-react';
import type { VesselRow } from '@/types/vessel';
import { NAV_STATUS_LABELS } from '@/types/vessel';
import WatchPanel from '@/components/panels/WatchPanel';
import { trackIntelBrief } from '@/lib/analytics';
import { useVesselTrack } from '@/hooks/useVesselTrack';
import { useWatchList } from '@/hooks/useWatchList';
import type { WatchedVessel } from '@/hooks/useWatchList';

interface Props {
    vessel: VesselRow;
    onClose: () => void;
}

export default function VesselPanel({ vessel, onClose }: Props) {
    const [brief, setBrief] = useState<string | null>(null);
    const [briefLoading, setBriefLoading] = useState(false);
    const [briefError, setBriefError] = useState<string | null>(null);

    const { track, isLoading: trackLoading, hasTrack } = useVesselTrack(
        vessel?.mmsi ? Number(vessel.mmsi) : null
    );

    const { addVessel, removeVessel, isWatched } = useWatchList();
    const watched = isWatched(vessel.mmsi);

    useEffect(() => {
        setBrief(null);
        setBriefError(null);
        setBriefLoading(false);
    }, [vessel.mmsi]);

    async function handleGenerateBrief() {
        setBriefLoading(true);
        setBriefError(null);
        setBrief(null);
        trackIntelBrief(vessel.mmsi, vessel.vessel_name ?? 'Unknown');
        try {
            const result = await generateVesselBrief(vessel.mmsi);
            setBrief(result.brief);
        } catch (e) {
            setBriefError(e instanceof Error ? e.message : 'Brief generation failed');
        } finally {
            setBriefLoading(false);
        }
    }

    const formatCoord = (val: number, isLat: boolean) => {
        const abs = Math.abs(val).toFixed(4);
        const dir = isLat ? (val >= 0 ? 'N' : 'S') : val >= 0 ? 'E' : 'W';
        return `${abs}° ${dir}`;
    };

    return (
        <div className="absolute top-16 right-3 sm:right-4 w-[calc(100vw-24px)] sm:w-72 max-w-sm glass-panel rounded z-20 overflow-y-auto max-h-[80vh]">
            {/* Header */}
            <div className="flex items-start justify-between p-4 border-b border-glow">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        {vessel.sanctions_match && (
                            <AlertCircle size={14} className="text-alert-critical flex-shrink-0" />
                        )}
                        {vessel.is_anomaly && !vessel.sanctions_match && (
                            <AlertTriangle size={14} className="text-alert-warning flex-shrink-0" />
                        )}
                        <Ship size={14} className="text-accent-cyan flex-shrink-0" />
                    </div>
                    <div className="mt-1 font-heading font-semibold text-white text-sm leading-tight truncate">
                        {vessel.vessel_name || 'UNKNOWN VESSEL'}
                    </div>
                    <div className="text-text-secondary text-xs font-body mt-0.5">
                        {vessel.type_category || 'Unknown Type'}
                        {vessel.flag_state && ` · ${vessel.flag_state}`}
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="text-text-muted hover:text-white transition-colors ml-2 flex-shrink-0"
                >
                    <X size={16} />
                </button>
            </div>

            {/* Alert banner */}
            {vessel.sanctions_match && (
                <div className="px-4 py-2 bg-alert-critical/20 border-b border-alert-critical/30">
                    <span className="text-alert-critical text-xs font-data font-bold">
                        ⚠ SANCTIONS MATCH DETECTED
                    </span>
                </div>
            )}
            {vessel.is_anomaly && !vessel.sanctions_match && (
                <div className="px-4 py-2 bg-alert-warning/20 border-b border-alert-warning/30">
                    <span className="text-alert-warning text-xs font-data font-bold">
                        ⚠ BEHAVIORAL ANOMALY
                    </span>
                </div>
            )}

            {/* Data rows */}
            <div className="p-4 space-y-2.5">
                <div className="flex mb-3">
                    {!watched ? (
                        <button
                            onClick={() => {
                                const watchedVessel: WatchedVessel = {
                                    mmsi: vessel.mmsi,
                                    name: vessel.vessel_name ?? 'UNKNOWN',
                                    vessel_type: vessel.nav_status ?? 0,
                                    flag: vessel.flag_state ?? '',
                                    addedAt: new Date().toISOString()
                                }
                                addVessel(watchedVessel)
                            }}
                            className="font-mono tracking-widest text-[10px] border border-[#00d4ff] text-[#00d4ff] px-3 py-1.5 hover:bg-[#00d4ff] hover:text-[#0a0f1e] transition-colors touch-manipulation w-full sm:w-auto"
                        >
                            ☆ WATCH
                        </button>
                    ) : (
                        <button
                            onClick={() => removeVessel(vessel.mmsi)}
                            className="font-mono tracking-widest text-[10px] bg-[#00d4ff] text-[#0a0f1e] px-3 py-1.5 hover:bg-transparent hover:text-[#00d4ff] hover:border-[#00d4ff] border border-[#00d4ff] transition-colors touch-manipulation w-full sm:w-auto"
                        >
                            ★ WATCHING
                        </button>
                    )}
                </div>
                <DataRow label="MMSI" value={vessel.mmsi} />
                {vessel.imo_number && <DataRow label="IMO" value={vessel.imo_number} />}
                {vessel.call_sign && <DataRow label="CALLSIGN" value={vessel.call_sign} />}

                <div className="border-t border-glow my-2" />

                <DataRow label="LATITUDE" value={formatCoord(vessel.lat, true)} />
                <DataRow label="LONGITUDE" value={formatCoord(vessel.lon, false)} />
                {vessel.sog != null && (
                    <DataRow label="SPEED" value={`${vessel.sog.toFixed(1)} kn`} />
                )}
                {vessel.cog != null && (
                    <DataRow label="COURSE" value={`${vessel.cog.toFixed(1)}°`} />
                )}
                {vessel.true_heading != null && vessel.true_heading !== 511 && (
                    <DataRow label="HEADING" value={`${vessel.true_heading}°`} />
                )}
                {vessel.nav_status != null && (
                    <DataRow
                        label="STATUS"
                        value={NAV_STATUS_LABELS[vessel.nav_status] || `Code ${vessel.nav_status}`}
                    />
                )}

                {vessel.destination && (
                    <>
                        <div className="border-t border-glow my-2" />
                        <DataRow label="DESTINATION" value={vessel.destination} />
                    </>
                )}

                {vessel.last_update && (
                    <>
                        <div className="border-t border-glow my-2" />
                        <DataRow
                            label="LAST UPDATE"
                            value={new Date(vessel.last_update).toLocaleTimeString('en-GB', {
                                hour12: false,
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                            })}
                            muted
                        />
                    </>
                )}

                {(vessel.dark_fleet_score ?? 0) > 0 && (
                    <>
                        <div className="border-t border-glow my-2" />
                        <div className="flex justify-between items-baseline gap-2 mb-1">
                            <span className="text-text-muted text-xs font-data flex-shrink-0">
                                DARK FLEET SCORE
                            </span>
                            <span
                                className={`text-xs font-data font-bold ${
                                    (vessel.dark_fleet_score ?? 0) >= 80
                                        ? 'text-alert-critical'
                                        : (vessel.dark_fleet_score ?? 0) >= 60
                                        ? 'text-alert-warning'
                                        : 'text-yellow-400'
                                }`}
                            >
                                {vessel.dark_fleet_score}/100
                            </span>
                        </div>
                        <div className="w-full h-1.5 bg-[#1a2744] rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all ${
                                    (vessel.dark_fleet_score ?? 0) >= 80
                                        ? 'bg-alert-critical'
                                        : (vessel.dark_fleet_score ?? 0) >= 60
                                        ? 'bg-alert-warning'
                                        : 'bg-yellow-400'
                                }`}
                                style={{ width: `${vessel.dark_fleet_score ?? 0}%` }}
                            />
                        </div>
                    </>
                )}

                <div className="mt-3 pt-3 border-t border-[#1a2744]">
                    <div className="flex items-center justify-between">
                        <span className="text-[#64748b] text-[10px] font-data uppercase tracking-widest">
                            24H TRACK
                        </span>
                        {trackLoading ? (
                            <span className="text-[#475569] text-[10px] font-data">
                                Loading...
                            </span>
                        ) : hasTrack ? (
                            <span className="text-[#00d4ff] text-[10px] font-data">
                                {track.length} positions recorded
                            </span>
                        ) : (
                            <span className="text-[#475569] text-[10px] font-data">
                                No history yet
                            </span>
                        )}
                    </div>
                    {hasTrack && (
                        <div className="text-[9px] font-data text-slate-500 mt-1">
                            From {new Date(track[0].recorded_at).toUTCString().slice(0, 22)} UTC
                        </div>
                    )}
                </div>

                {/* AI Intelligence Brief */}
                <div className="border-t border-glow pt-3 mt-1">
                    <button
                        onClick={handleGenerateBrief}
                        disabled={briefLoading}
                        className="w-full flex items-center justify-center gap-2 py-2 px-3
                            rounded border border-accent-cyan text-accent-cyan text-xs font-data
                            hover:bg-accent-cyan hover:text-navy-950 transition-all duration-200
                            disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {briefLoading ? (
                            <>
                                <Loader2 size={13} className="animate-spin" />
                                GENERATING BRIEF...
                            </>
                        ) : (
                            <>
                                <Sparkles size={13} />
                                GENERATE INTELLIGENCE BRIEF
                            </>
                        )}
                    </button>

                    {briefError && (
                        <div className="mt-2 flex items-start gap-2 text-alert-critical text-xs font-body">
                            <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                            <span>{briefError}</span>
                        </div>
                    )}

                    {brief && (
                        <div className="mt-3 p-3 rounded bg-white/5 border border-glow">
                            <div className="flex items-center gap-1.5 mb-2">
                                <Sparkles size={11} className="text-accent-cyan" />
                                <span className="text-accent-cyan text-xs font-data tracking-widest">
                                    AI INTELLIGENCE BRIEF
                                </span>
                            </div>
                            <div className="text-text-secondary text-xs font-body leading-relaxed
                                whitespace-pre-wrap max-h-72 overflow-y-auto">
                                {brief}
                            </div>
                            <div className="text-text-muted text-xs font-data mt-2 text-right">
                                llama-3.3-70b · groq
                            </div>
                        </div>
                    )}
                </div>

                <WatchPanel
                    mmsi={vessel.mmsi}
                    vesselName={vessel.vessel_name ?? null}
                />
            </div>
        </div>
    );
}

function DataRow({
    label,
    value,
    muted = false,
}: {
    label: string;
    value: string;
    muted?: boolean;
}) {
    return (
        <div className="flex justify-between items-baseline gap-2">
            <span className="text-text-muted text-xs font-data flex-shrink-0">{label}</span>
            <span
                className={`text-xs font-data text-right truncate ${muted ? 'text-text-muted' : 'text-white'
                    }`}
            >
                {value}
            </span>
        </div>
    );
}
