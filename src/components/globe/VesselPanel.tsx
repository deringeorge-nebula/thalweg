// src/components/globe/VesselPanel.tsx
'use client';

import { X, Ship, AlertTriangle, AlertCircle, Navigation } from 'lucide-react';
import type { VesselRow } from '@/types/vessel';
import { NAV_STATUS_LABELS } from '@/types/vessel';

interface Props {
    vessel: VesselRow;
    onClose: () => void;
}

export default function VesselPanel({ vessel, onClose }: Props) {
    const formatCoord = (val: number, isLat: boolean) => {
        const abs = Math.abs(val).toFixed(4);
        const dir = isLat ? (val >= 0 ? 'N' : 'S') : val >= 0 ? 'E' : 'W';
        return `${abs}° ${dir}`;
    };

    return (
        <div className="absolute top-14 right-4 w-72 glass-panel rounded z-20 overflow-hidden">
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
