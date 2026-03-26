// src/components/globe/PortPanel.tsx
'use client';

import { useState, useEffect } from 'react';
import { generatePortBrief } from '@/lib/intelligenceBrief';
import { usePortForecast } from '@/hooks/usePortForecast';
import { X, Anchor, Sparkles, Loader2, AlertTriangle } from 'lucide-react';
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
    const [brief, setBrief] = useState<string | null>(null);
    const [briefLoading, setBriefLoading] = useState(false);
    const [briefError, setBriefError] = useState<string | null>(null);
    const portLocode = (port as any).un_locode ?? null;
    const { forecast, isLoading: forecastLoading } = usePortForecast(portLocode);
    const currentCI = (port as any).congestion_index ?? 0
    const inbound = (port as any).inbound_vessel_count ?? 0
    const active = (port as any).active_vessel_count ?? 0

    // Inbound ratio: if many vessels approaching vs active, 
    // congestion will rise. If few, it will decay.
    const inboundPressure = active > 0 ? inbound / active : 0
    const trend = inboundPressure > 0.3 ? 1.15 : 
                  inboundPressure > 0.1 ? 1.05 : 0.88

    const ci24 = Math.min(100, Math.round(currentCI * trend))
    const ci48 = Math.min(100, Math.round(ci24 * (trend > 1 ? trend * 0.95 : trend)))
    const ci72 = Math.min(100, Math.round(ci48 * 0.92))

    const instantForecast = [
        { hour_offset: 0,  vessel_count: active,  congestion_index: currentCI },
        { hour_offset: 24, vessel_count: 0, congestion_index: ci24 },
        { hour_offset: 48, vessel_count: 0, congestion_index: ci48 },
        { hour_offset: 72, vessel_count: 0, congestion_index: ci72 },
    ]


    async function handleGenerateBrief() {
        setBriefLoading(true);
        setBriefError(null);
        setBrief(null);
        try {
            const result = await generatePortBrief(port.id);
            setBrief(result.brief);
        } catch (e) {
            setBriefError(e instanceof Error ? e.message : 'Brief generation failed');
        } finally {
            setBriefLoading(false);
        }
    }

    useEffect(() => {
        setBrief(null);
        setBriefError(null);
        setBriefLoading(false);
    }, [port.id]);

    const statusColor = STATUS_COLORS[port.congestion_status] ?? 'text-white';
    const barColor = BAR_COLORS[port.congestion_status] ?? 'bg-accent-cyan';
    const activeData = forecast.length > 0 ? forecast : instantForecast;

    return (
        <div className="absolute top-16 right-3 sm:right-4 w-[calc(100vw-24px)] sm:w-72 max-w-sm glass-panel rounded z-20 overflow-y-auto max-h-[80vh]">
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

                <div className="mt-4 pt-3 border-t border-[#1a2744]">
                    <div className="text-[#64748b] text-[10px] font-data uppercase tracking-widest mb-2">
                        72H CONGESTION FORECAST
                    </div>

                    {forecastLoading && instantForecast.every(p => p.congestion_index === 0) ? (
                        <div className="text-[#475569] text-xs font-data">
                            Computing...
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1">
                            {/* SVG Sparkline */}
                            <svg width="100%" height="48" viewBox="0 0 260 48" preserveAspectRatio="none" className="w-full">
                                {/* Grid lines */}
                                <line x1="0" y1="24" x2="260" y2="24" stroke="#1a2744" strokeWidth="1" />
                                <line x1="0" y1="8" x2="260" y2="8" stroke="#1a2744" strokeWidth="0.5" />
                                <line x1="0" y1="40" x2="260" y2="40" stroke="#1a2744" strokeWidth="0.5" />

                                {/* Forecast line — map forecast to SVG coords */}
                                {activeData.length > 1 && (() => {
                                    const pts = activeData.map((p, i) => {
                                        const x = (i / (activeData.length - 1)) * 260
                                        const y = 44 - (p.congestion_index / 100) * 40
                                        return `${x},${y}`
                                    }).join(' ')
                                    return (
                                        <polyline
                                            points={pts}
                                            fill="none"
                                            stroke="#00d4ff"
                                            strokeWidth="1.5"
                                            strokeLinejoin="round"
                                            strokeLinecap="round"
                                        />
                                    )
                                })()}

                                {/* Fill area under curve */}
                                {activeData.length > 1 && (() => {
                                    const pts = activeData.map((p, i) => {
                                        const x = (i / (activeData.length - 1)) * 260
                                        const y = 44 - (p.congestion_index / 100) * 40
                                        return `${x},${y}`
                                    })
                                    const pathD = `M ${pts[0]} ` +
                                        pts.slice(1).map(p => `L ${p}`).join(' ') +
                                        ` L 260,48 L 0,48 Z`
                                    return (
                                        <path
                                            d={pathD}
                                            fill="url(#forecastGrad)"
                                            opacity="0.3"
                                        />
                                    )
                                })()}

                                <defs>
                                    <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.6" />
                                        <stop offset="100%" stopColor="#00d4ff" stopOpacity="0" />
                                    </linearGradient>
                                </defs>
                            </svg>

                            {/* Time axis labels */}
                            <div className="flex justify-between text-[9px] font-data text-[#475569] mt-0.5">
                                <span>NOW</span>
                                <span>+24H</span>
                                <span>+48H</span>
                                <span>+72H</span>
                            </div>

                            {/* Peak congestion callout */}
                            {activeData.length > 0 && (() => {
                                const peak = activeData.reduce((a, b) =>
                                    a.congestion_index > b.congestion_index ? a : b
                                )
                                if (peak.congestion_index < 10) return null
                                return (
                                    <div className="text-[10px] font-data text-[#00d4ff] mt-1">
                                        Peak: +{peak.hour_offset}h
                                        ({Math.round(peak.congestion_index)} index)
                                    </div>
                                )
                            })()}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
