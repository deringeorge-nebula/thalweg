// src/components/globe/PortPanel.tsx
'use client';

import { X, Anchor } from 'lucide-react';
import type { PortWithCongestion } from '@/hooks/usePortCongestion';

interface Props {
    port: PortWithCongestion;
    onClose: () => void;
}

const STATUS_COLORS: Record<string, string> = {
    NORMAL: 'text-alert-ok',
    ELEVATED: 'text-yellow-400',
    CONGESTED: 'text-alert-warning',
    SEVERE: 'text-alert-critical',
};

const BAR_COLORS: Record<string, string> = {
    NORMAL: 'bg-alert-ok',
    ELEVATED: 'bg-yellow-400',
    CONGESTED: 'bg-alert-warning',
    SEVERE: 'bg-alert-critical',
};

function PredictionBar({
    label,
    value,
    status,
}: {
    label: string;
    value: number;
    status: string;
}) {
    const color = BAR_COLORS[status] ?? 'bg-accent-cyan';
    return (
        <div className="mb-2">
            <div className="flex justify-between text-xs font-data mb-1">
                <span className="text-text-muted">{label}</span>
                <span className="text-white">{value}</span>
            </div>
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${color}`}
                    style={{ width: `${Math.min(100, value)}%` }}
                />
            </div>
        </div>
    );
}

export default function PortPanel({ port, onClose }: Props) {
    const statusColor = STATUS_COLORS[port.congestion_status] ?? 'text-white';
    const barColor = BAR_COLORS[port.congestion_status] ?? 'bg-accent-cyan';

    return (
        <div className="absolute top-14 right-4 w-72 glass-panel rounded z-20 overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between p-4 border-b border-glow">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <Anchor size={13} className="text-accent-cyan flex-shrink-0" />
                        <span className="text-text-muted text-xs font-data">PORT INTELLIGENCE</span>
                    </div>
                    <div className="font-heading font-bold text-white text-base leading-tight">
                        {port.name}
                    </div>
                    <div className="text-text-secondary text-xs font-body mt-0.5">
                        {port.country}
                        {port.un_locode && (
                            <span className="text-text-muted ml-1">· {port.un_locode}</span>
                        )}
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="text-text-muted hover:text-white transition-colors ml-2 flex-shrink-0"
                >
                    <X size={16} />
                </button>
            </div>

            <div className="p-4 space-y-4">
                {/* Current congestion index */}
                <div>
                    <div className="flex justify-between items-center mb-1.5">
                        <span className="text-text-muted text-xs font-data">CONGESTION INDEX</span>
                        <span className={`text-sm font-heading font-bold ${statusColor}`}>
                            {port.congestion_status}
                        </span>
                    </div>
                    <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                            style={{ width: `${Math.min(100, port.congestion_index)}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-xs font-data mt-1">
                        <span className="text-text-muted">0</span>
                        <span className={`font-bold ${statusColor}`}>{port.congestion_index}</span>
                        <span className="text-text-muted">100</span>
                    </div>
                </div>

                {/* Vessel counts */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="glass-panel rounded p-2.5 text-center">
                        <div className="text-white font-heading font-bold text-lg">
                            {port.active_vessel_count.toLocaleString()}
                        </div>
                        <div className="text-text-muted text-xs font-data mt-0.5">IN ZONE</div>
                    </div>
                    <div className="glass-panel rounded p-2.5 text-center">
                        <div className="text-accent-cyan font-heading font-bold text-lg">
                            {port.inbound_vessel_count.toLocaleString()}
                        </div>
                        <div className="text-text-muted text-xs font-data mt-0.5">INBOUND</div>
                    </div>
                </div>

                {/* 72h prediction */}
                <div>
                    <div className="text-text-muted text-xs font-data mb-2 uppercase tracking-widest">
                        Congestion Forecast
                    </div>
                    <PredictionBar
                        label="24h"
                        value={port.predicted_congestion_24h}
                        status={port.congestion_status}
                    />
                    <PredictionBar
                        label="48h"
                        value={port.predicted_congestion_48h}
                        status={port.congestion_status}
                    />
                    <PredictionBar
                        label="72h"
                        value={port.predicted_congestion_72h}
                        status={port.congestion_status}
                    />
                </div>

                {/* Last calculated */}
                {port.calculated_at && (
                    <div className="text-text-muted text-xs font-data text-center border-t border-glow pt-2">
                        Updated{' '}
                        {new Date(port.calculated_at).toLocaleTimeString('en-GB', {
                            hour12: false,
                            hour: '2-digit',
                            minute: '2-digit',
                        })}{' '}
                        UTC · recalculates every 5 min
                    </div>
                )}
            </div>
        </div>
    );
}
