// src/components/globe/GlobeView.tsx
// The entire product lives here. Read before touching.
// CRITICAL: useRef + 500ms timer + Float32Array = 60fps at 50k vessels.
// DO NOT replace setInterval with useEffect on vesselMapRef.
// DO NOT replace Float32Array with object arrays.
// DO NOT add React state updates inside Realtime callbacks.
'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { _GlobeView as GlobeView } from '@deck.gl/core';
import { ScatterplotLayer, GeoJsonLayer, GridCellLayer, PolygonLayer } from '@deck.gl/layers';
import { GridLayer } from '@deck.gl/aggregation-layers';
import usePiracyData, { PiracyIncident } from '@/hooks/usePiracyData';
import { SpillResult } from '@/hooks/useSpillPredictor';
import SpillPanel from '../panels/SpillPanel';
import PiracyPanel from '../panels/PiracyPanel';
import { useVesselStream } from '@/hooks/useVesselStream';
import { useDemoMode } from '@/hooks/useDemoMode';
import { VesselSearchBar } from './VesselSearchBar';
import { hexToRgb, type VesselRow, type GlobeData, NAV_STATUS_LABELS } from '@/types/vessel';
import VesselPanel from './VesselPanel';
import { usePortCongestion } from '@/hooks/usePortCongestion';
import type { PortWithCongestion } from '@/hooks/usePortCongestion';
import PortPanel from './PortPanel';
import { trackVesselClick } from '@/lib/analytics';

// Natural Earth 110m land polygons — public domain, no API key required
const LAND_DATA_URL =
    'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_land.geojson';

function congestionColor(index: number): [number, number, number, number] {
    if (index <= 25)  return [0,   255, 136, 220];  // green  — NORMAL
    if (index <= 50)  return [255, 200, 0,   230];  // yellow — ELEVATED
    if (index <= 75)  return [255, 140, 0,   240];  // orange — CONGESTED
    return              [255, 68,  68,  255];        // red    — SEVERE
}

// Maps SST value (°C) to RGBA colour
// Cold: deep blue (-2°C) → Cool: cyan (10°C) → Warm: yellow (22°C) → Hot: red (32°C)
function sstColor(sst: number): [number, number, number, number] {
    if (sst <= -2)  return [0,   0,   139, 180];
    if (sst <= 5)   return [0,   105, 200, 170];
    if (sst <= 10)  return [0,   200, 220, 160];
    if (sst <= 15)  return [0,   230, 180, 150];
    if (sst <= 20)  return [80,  220, 100, 140];
    if (sst <= 25)  return [255, 200, 0,   140];
    if (sst <= 29)  return [255, 120, 0,   150];
    return                 [220, 30,  30,  160];
}

const INITIAL_VIEW_STATE = {
    longitude: 75,
    latitude: 15,
    zoom: 1.8,
};

const EMPTY_GLOBE_DATA: GlobeData = {
    positions: new Float32Array(0),
    colors: new Uint8Array(0),
    vessels: [],
    count: 0,
};

export default function GlobeViewComponent() {
    const { vesselMapRef, totalCount, isLoading, dataFreshness, realtimeActiveRef } =
        useVesselStream();

    const [globeData, setGlobeData] = useState<GlobeData>(EMPTY_GLOBE_DATA);
    const { isDemoMode, demoVessels } = useDemoMode(globeData.count);
    const [selectedVessel, setSelectedVessel] = useState<VesselRow | null>(null);
    const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; vessel: VesselRow } | null>(null);
    const { ports } = usePortCongestion();
    const [selectedPort, setSelectedPort] = useState<PortWithCongestion | null>(null);

    const [sstData, setSstData] = useState<
        { lat: number; lon: number; sst: number }[]
    >([]);
    const [sstVisible, setSstVisible] = useState(true);
    const [darkFleetVisible, setDarkFleetVisible] = useState(true);
    const [showPiracy, setShowPiracy] = useState(true);
    const [selectedPiracy, setSelectedPiracy] = useState<PiracyIncident | null>(null);
    const [spillResult, setSpillResult] = useState<SpillResult | null>(null);
    const [showHeatmap, setShowHeatmap] = useState(false);
    const { incidents: piracyIncidents, riskZones } = usePiracyData();

    const darkFleetVessels = useMemo(
        () => globeData.vessels.filter((v: any) => (v.darkFleetScore ?? v.dark_fleet_score ?? 0) >= 60),
        [globeData.vessels]
    );

    useEffect(() => {
        const SST_URL = process.env.NEXT_PUBLIC_SUPABASE_URL +
            '/storage/v1/object/public/ocean-data/sst/global-latest.json';
        fetch(SST_URL)
            .then((r) => r.json())
            .then((tile) => {
                if (tile?.points) setSstData(tile.points);
            })
            .catch((e) => console.warn('[SST] Failed to load:', e));
    }, []);

    // ── 500ms batch timer ─────────────────────────────────────────────────────
    // Reads from vesselMapRef (no React dependency), builds Float32Array,
    // triggers exactly ONE setState per 500ms regardless of vessel update volume.
    useEffect(() => {
        const interval = setInterval(() => {
            if (isDemoMode) return;
            const vessels = Array.from(vesselMapRef.current.values()).filter(
                (v) => v.lat !== null && v.lon !== null
            );

            if (vessels.length === 0) return;

            const count = vessels.length;
            const positions = new Float32Array(count * 2);
            const colors = new Uint8Array(count * 4);

            for (let i = 0; i < count; i++) {
                const v = vessels[i];
                // deck.gl is ALWAYS [longitude, latitude] — not lat/lon
                positions[i * 2] = v.lon;
                positions[i * 2 + 1] = v.lat;

                const rgb = hexToRgb(v.type_color || '#7F8C8D');
                // Sanctions = red override; anomaly = yellow override
                const r = v.sanctions_match ? 255 : v.is_anomaly ? 255 : rgb[0];
                const g = v.sanctions_match ? 68 : v.is_anomaly ? 184 : rgb[1];
                const b = v.sanctions_match ? 68 : v.is_anomaly ? 0 : rgb[2];

                colors[i * 4] = r;
                colors[i * 4 + 1] = g;
                colors[i * 4 + 2] = b;
                colors[i * 4 + 3] = v.is_anomaly || v.sanctions_match ? 255 : 210;
            }

            setGlobeData({ positions, colors, vessels, count });
        }, 500);

        return () => clearInterval(interval);
    }, [vesselMapRef, isDemoMode]);

    useEffect(() => {
        if (!isDemoMode) return;
        const count = demoVessels.length;
        const positions = new Float32Array(count * 2);
        const colors = new Uint8Array(count * 4);
        
        for (let i = 0; i < count; i++) {
            const v = demoVessels[i];
            positions[i * 2] = v.lon ?? 0;
            positions[i * 2 + 1] = v.lat ?? 0;
            
            const r = v.sanctions_match ? 255 : v.is_anomaly ? 255 : 52;
            const g = v.sanctions_match ? 68  : v.is_anomaly ? 184 : 152;
            const b = v.sanctions_match ? 68  : v.is_anomaly ? 0   : 219;
            
            colors[i * 4]     = r;
            colors[i * 4 + 1] = g;
            colors[i * 4 + 2] = b;
            colors[i * 4 + 3] = v.is_anomaly || v.sanctions_match ? 255 : 210;
        }
        
        setGlobeData({ 
            positions, 
            colors, 
            vessels: demoVessels as any, 
            count 
        });
    }, [isDemoMode, demoVessels]);

    // ── GridLayer density map (toggled via showHeatmap) ──────────────────
    const heatmapLayer = new GridLayer({
        id: 'vessel-density',
        data: globeData.vessels.filter((d: any) =>
            d.lat != null && d.lon != null &&
            d.lat !== 0 && d.lon !== 0
        ),
        getPosition: (d: any) => [d.lon as number, d.lat as number],
        cellSize: 50000,          // 50km grid cells — visible at global zoom
        extruded: false,          // flat — no 3D columns on globe
        pickable: false,
        opacity: 0.8,
        colorRange: [
            [0,   30,  80,  160],   // very sparse  — dark navy
            [0,   70,  120, 180],   // sparse       — dark blue
            [0,   120, 160, 200],   // moderate     — blue
            [0,   170, 200, 220],   // medium       — teal
            [0,   212, 255, 235],   // dense        — accent cyan
            [255, 255, 255, 255],   // very dense   — white
        ] as [number, number, number, number][],
        elevationScale: 0,
        getColorWeight: (d: any) => {
            if (d.sanctions_match) return 3
            if (d.is_anomaly) return 2
            if ((d.dark_fleet_score ?? 0) > 60) return 1.5
            return 1
        },
        colorAggregation: 'SUM',
        updateTriggers: {
            getPosition: globeData.count,
        },
    })

    // ── deck.gl layers ─────────────────────────────────────────────────────────
    const layers = showHeatmap
        ? [heatmapLayer]
        : [
        new GridCellLayer({
            id: 'sst',
            data: sstData,
            visible: sstVisible,
            getPosition: (d: { lat: number; lon: number; sst: number }) => [d.lon, d.lat],
            getFillColor: (d: { lat: number; lon: number; sst: number }) => sstColor(d.sst),
            cellSize: 110000,     // ~1 degree in meters — matches ERDDAP grid stride
            elevationScale: 0,    // flat — no 3D extrusion on globe
            extruded: false,
            pickable: false,      // SST layer is not interactive — vessels/ports take priority
            opacity: 0.55,
        }),

        new ScatterplotLayer({
            id: 'dark-fleet',
            data: darkFleetVessels,
            visible: darkFleetVisible,
            getPosition: (d: any) => [d.lon, d.lat],
            getFillColor: (d: any) => {
                const s = d.darkFleetScore ?? d.dark_fleet_score ?? 0;
                if (s >= 80) return [255, 30,  30,  255]; // EXTREME — bright red
                if (s >= 70) return [255, 100, 0,   255]; // HIGH    — orange-red
                return              [255, 165, 0,   240]; // MEDIUM  — orange
            },
            getLineColor: [255, 255, 255, 200],
            getRadius: 25000,
            radiusMinPixels: 6,
            radiusMaxPixels: 20,
            stroked: true,
            lineWidthMinPixels: 2,
            pickable: true,
            onClick: ({ object }: { object: any }) => {
                if (object) {
                    setSelectedVessel(object);
                    trackVesselClick(
                        object.mmsi,
                        object.vessel_name ?? 'Unknown',
                        object.is_anomaly ?? false,
                        object.sanctions_match ?? false,
                        object.dark_fleet_score ?? 0
                    );
                }
            },
            updateTriggers: {
                getFillColor: darkFleetVessels.length,
            },
        }),

        new ScatterplotLayer({
            id: 'ports',
            data: ports,
            getPosition: (d: PortWithCongestion) => [d.lon, d.lat],
            getFillColor: (d: PortWithCongestion) => congestionColor(d.congestion_index),
            getLineColor: [255, 255, 255, 180],
            getRadius: 35000,
            radiusMinPixels: 5,
            radiusMaxPixels: 18,
            stroked: true,
            lineWidthMinPixels: 1.5,
            pickable: true,
            onClick: ({ object }: { object: PortWithCongestion }) => {
                if (object) {
                    setSelectedVessel(null);
                    setSelectedPort(object);
                }
            },
        }),

        new GeoJsonLayer({
            id: 'land',
            data: LAND_DATA_URL,
            filled: true,
            stroked: true,
            getFillColor: [15, 28, 50, 255],    // dark blue-grey land
            getLineColor: [0, 212, 255, 40],    // faint cyan coastlines
            lineWidthMinPixels: 0.5,
        }),

        // Piracy Risk Zones
        ...(showPiracy ? [new ScatterplotLayer({
            id: 'piracy-zones',
            data: riskZones,
            getPosition: (d: any) => [d.center_lon, d.center_lat],
            getRadius: (d: any) => d.radius_nm * 1852, // nm to meters
            getFillColor: (d: any) => d.risk_level === 'CRITICAL' ? [255, 68, 68, 30] : [255, 140, 0, 30],
            getLineColor: (d: any) => d.risk_level === 'CRITICAL' ? [255, 68, 68, 150] : [255, 140, 0, 150],
            lineWidthMinPixels: 1,
            stroked: true,
            pickable: false,
        })] : []),

        // Piracy Incidents ScatterplotLayer
        ...(showPiracy ? [new ScatterplotLayer({
          id: 'piracy-incidents',
          data: piracyIncidents,
          getPosition: (d: PiracyIncident) => [d.lon, d.lat],
          getRadius: (d: PiracyIncident) => d.attack_type === 'HIJACKED' ? 45000 : d.attack_type === 'FIRED_UPON' ? 35000 : 25000,
          getFillColor: (d: PiracyIncident) => {
            switch (d.attack_type) {
              case 'HIJACKED':    return [255, 68, 68, 220]   // alert-critical red
              case 'FIRED_UPON':  return [255, 140, 0, 200]   // alert-warning orange
              case 'BOARDED':     return [255, 200, 0, 180]   // yellow
              default:            return [100, 180, 255, 160]  // blue for approached/suspicious
            }
          },
          radiusMinPixels: 4,
          radiusMaxPixels: 18,
          stroked: true,
          getLineColor: [255, 255, 255, 120],
          lineWidthMinPixels: 1,
          pickable: true,
          onClick: ({ object }: { object: any }) => {
            if (object) setSelectedPiracy(object as PiracyIncident)
          },
          updateTriggers: { getFillColor: [], getRadius: [] }
        })] : []),

        // Spill prediction polygon layers
        ...(spillResult ? [
          new PolygonLayer({
            id: 'spill-h72',
            data: [spillResult.footprints.h72],
            getPolygon: (d: any) => d.coordinates[0],
            getFillColor: [220, 38, 38, 40],
            getLineColor: [220, 38, 38, 180],
            lineWidthMinPixels: 1,
            filled: true,
            stroked: true,
          }),
          new PolygonLayer({
            id: 'spill-h48',
            data: [spillResult.footprints.h48],
            getPolygon: (d: any) => d.coordinates[0],
            getFillColor: [251, 146, 60, 55],
            getLineColor: [251, 146, 60, 200],
            lineWidthMinPixels: 1,
            filled: true,
            stroked: true,
          }),
          new PolygonLayer({
            id: 'spill-h24',
            data: [spillResult.footprints.h24],
            getPolygon: (d: any) => d.coordinates[0],
            getFillColor: [250, 204, 21, 70],
            getLineColor: [250, 204, 21, 220],
            lineWidthMinPixels: 2,
            filled: true,
            stroked: true,
          }),
        ] : []),

        new ScatterplotLayer({
            id: 'vessels',
            data: {
                length: globeData.count,
                attributes: {
                    getPosition: { value: globeData.positions, size: 2 },
                    getFillColor: { value: globeData.colors, size: 4, normalized: true },
                },
            },
            getRadius: 5000,           // 5km — visible at global zoom
            radiusMinPixels: 1.5,
            radiusMaxPixels: 10,
            pickable: true,
            opacity: 0.9,
            updateTriggers: {
                getPosition: globeData.count,
                getFillColor: globeData.count,
            },
            onHover: ({ index, x, y }: any) => {
                if (index >= 0 && index < globeData.vessels.length) {
                    setHoverInfo({ x, y, vessel: globeData.vessels[index] });
                } else {
                    setHoverInfo(null);
                }
            },
            onClick: ({ index }: any) => {
                if (index >= 0 && index < globeData.vessels.length) {
                    const v = globeData.vessels[index];
                    setSelectedVessel(v);
                    trackVesselClick(
                        v.mmsi,
                        v.vessel_name ?? 'Unknown',
                        v.is_anomaly ?? false,
                        v.sanctions_match ?? false,
                        v.dark_fleet_score ?? 0
                    );
                }
            },
        }),
    ];

    return (
        <div className="relative w-full h-screen bg-ocean-base overflow-hidden">
            {/* ── Globe ──────────────────────────────────────────────────────────── */}
            <DeckGL
                views={new GlobeView()}
                initialViewState={INITIAL_VIEW_STATE}
                controller
                layers={layers}
                style={{ background: '#0A1628' }}
                getCursor={({ isHovering }: any) => (isHovering ? 'crosshair' : 'grab')}
                onError={(error: any) => console.error('[DeckGL]', error)}
            />

            {/* ── Heatmap / Vessels toggle ──────────────────────────────────────── */}
            <button
                onClick={() => setShowHeatmap(prev => !prev)}
                className={`
                    absolute top-14 right-4 z-20
                    px-3 py-1.5
                    font-data text-xs tracking-widest
                    border rounded
                    transition-colors duration-200
                    ${showHeatmap
                        ? 'bg-[#00d4ff] text-[#0a0f1e] border-[#00d4ff]'
                        : 'bg-transparent text-[#00d4ff] border-[#00d4ff] hover:bg-[#00d4ff]/10'
                    }
                `}
            >
                {showHeatmap ? 'VESSELS' : 'DENSITY'}
            </button>

            {/* ── Top status bar ─────────────────────────────────────────────────── */}

            <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-2 glass-panel border-b border-glow z-10">
                <div className="flex items-center gap-3">
                    <span className="font-heading text-white font-bold text-lg tracking-wide">
                        THALWEG
                    </span>
                    <span className="text-text-muted text-xs font-data">
                        MARITIME INTELLIGENCE
                    </span>
                </div>

                <div className="relative">
                    <VesselSearchBar
                        vessels={globeData.vessels}
                        onVesselSelect={(vessel) => {
                            setSelectedVessel(vessel)
                            trackVesselClick(
                                vessel.mmsi,
                                vessel.vessel_name ?? 'Unknown',
                                vessel.is_anomaly ?? false,
                                vessel.sanctions_match ?? false,
                                vessel.dark_fleet_score ?? 0
                            )
                        }}
                    />
                </div>

                <div className="flex items-center gap-4 text-xs font-data">
                    {/* Live vessel count */}
                    <div className="flex items-center gap-1.5">
                        <div
                            className={`w-2 h-2 rounded-full ${isLoading ? 'bg-alert-warning' : 'bg-alert-ok'}`}
                            style={{ boxShadow: isLoading ? '0 0 6px #FFB800' : '0 0 6px #00FF88' }}
                        />
                        <span className="text-alert-ok font-bold">
                            {globeData.count.toLocaleString()}
                        </span>
                        <span className="text-text-secondary">VESSELS</span>
                    </div>

                    {/* Realtime / polling indicator */}
                    {isDemoMode && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-[#eab308] bg-[#eab308]/10">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#eab308]" style={{ boxShadow: '0 0 4px #eab308' }} />
                            <span className="text-[#eab308] text-xs font-data tracking-widest">
                                DEMO
                            </span>
                        </div>
                    )}
                    <div className="flex items-center gap-1.5">
                        <div
                            className={`w-1.5 h-1.5 rounded-full ${realtimeActiveRef.current ? 'bg-accent-cyan' : 'bg-alert-warning'}`}
                        />
                        <span className="text-text-secondary">
                            {realtimeActiveRef.current ? 'REALTIME' : 'POLLING 30s'}
                        </span>
                    </div>

                    {/* Data freshness */}
                    {dataFreshness && (
                        <span className="text-text-muted">
                            {dataFreshness.toLocaleTimeString('en-GB', { hour12: false })} UTC
                        </span>
                    )}

                    <button
                        onClick={() => setSstVisible((v) => !v)}
                        className={`text-xs font-data px-2 py-0.5 rounded border transition-colors ${
                            sstVisible
                                ? 'border-accent-cyan text-accent-cyan'
                                : 'border-text-muted text-text-muted'
                        }`}
                    >
                        SST
                    </button>
                    <button
                        onClick={() => setDarkFleetVisible((v) => !v)}
                        className={`text-xs font-data px-2 py-0.5 rounded border transition-colors ${
                            darkFleetVisible
                                ? 'border-alert-critical text-alert-critical'
                                : 'border-text-muted text-text-muted'
                        }`}
                    >
                        DARK FLEET
                    </button>
                    {/* PIRACY button */}
                    <button
                        onClick={() => setShowPiracy(p => !p)}
                        className={`px-3 py-1 rounded text-xs font-data font-medium border transition-all ${
                            showPiracy
                                ? 'bg-red-900/40 border-red-500 text-red-400'
                                : 'bg-navy-950/40 border-gray-600 text-gray-400 hover:border-gray-400'
                        }`}
                    >
                        PIRACY
                    </button>
                </div>
            </div>

            {/* ── Vessel type legend ─────────────────────────────────────────────── */}
            <div className="absolute bottom-6 left-4 glass-panel p-3 rounded z-10">
                <div className="text-text-muted text-xs font-data mb-2 uppercase tracking-widest">
                    Vessel Types
                </div>
                {[
                    { label: 'Cargo', color: '#3498DB' },
                    { label: 'Tanker', color: '#E74C3C' },
                    { label: 'Passenger', color: '#9B59B6' },
                    { label: 'Fishing', color: '#27AE60' },
                    { label: 'High Speed', color: '#F39C12' },
                    { label: 'Unknown', color: '#7F8C8D' },
                ].map(({ label, color }) => (
                    <div key={label} className="flex items-center gap-2 mb-1">
                        <div
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: color, boxShadow: `0 0 4px ${color}` }}
                        />
                        <span className="text-text-secondary text-xs font-body">{label}</span>
                    </div>
                ))}
                {/* Alert indicators */}
                <div className="border-t border-glow mt-2 pt-2">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-2.5 h-2.5 rounded-full bg-alert-critical" style={{ boxShadow: '0 0 4px #FF4444' }} />
                        <span className="text-alert-critical text-xs font-body">Sanctions Match</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-alert-warning" style={{ boxShadow: '0 0 4px #FFB800' }} />
                        <span className="text-alert-warning text-xs font-body">Anomaly Detected</span>
                    </div>
                </div>
            </div>

            {/* ── Hover tooltip ──────────────────────────────────────────────────── */}
            {hoverInfo && !selectedVessel && (
                <div
                    className="absolute glass-panel px-3 py-2 pointer-events-none z-20 rounded"
                    style={{ left: hoverInfo.x + 12, top: hoverInfo.y + 12 }}
                >
                    <div className="text-white text-xs font-heading font-semibold">
                        {hoverInfo.vessel.vessel_name || 'Unknown Vessel'}
                    </div>
                    <div className="text-text-secondary text-xs font-data mt-0.5">
                        MMSI: {hoverInfo.vessel.mmsi}
                    </div>
                    <div className="text-text-muted text-xs font-data">
                        {hoverInfo.vessel.type_category || 'Unknown'} ·{' '}
                        {hoverInfo.vessel.sog != null ? `${hoverInfo.vessel.sog.toFixed(1)} kn` : '-'}
                    </div>
                </div>
            )}

            {/* ── Vessel detail panel ────────────────────────────────────────────── */}
            {selectedPiracy && (
                <PiracyPanel
                    incident={selectedPiracy}
                    onClose={() => setSelectedPiracy(null)}
                />
            )}
            {selectedVessel && (
                <VesselPanel
                    vessel={selectedVessel}
                    onClose={() => { setSelectedVessel(null); setSpillResult(null) }}
                />
            )}
            {selectedVessel && (
                <div className="absolute right-4 top-20 w-96 max-w-[calc(100vw-32px)] pointer-events-auto z-10 mt-[420px]">
                    <SpillPanel
                        vesselLat={selectedVessel.lat}
                        vesselLon={selectedVessel.lon}
                        mmsi={selectedVessel.mmsi}
                        vesselType={selectedVessel.type_category ?? null}
                        onSpillResult={setSpillResult}
                    />
                </div>
            )}

            {selectedPort && (
                <PortPanel
                    port={selectedPort}
                    onClose={() => setSelectedPort(null)}
                />
            )}
        </div>
    );
}
