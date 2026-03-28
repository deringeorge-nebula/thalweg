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
import { useVesselTrack } from '@/hooks/useVesselTrack';
import { TripsLayer } from '@deck.gl/geo-layers';
import { ScatterplotLayer, GeoJsonLayer, GridCellLayer, PolygonLayer, LineLayer } from '@deck.gl/layers';
import { GridLayer } from '@deck.gl/aggregation-layers';
import usePiracyData, { PiracyIncident } from '@/hooks/usePiracyData';
import { useRouteRisk } from '@/hooks/useRouteRisk';
import { RouteRiskPanel } from '../panels/RouteRiskPanel';
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
import { ComparePanel } from './ComparePanel';
import { useWatchList } from '@/hooks/useWatchList';
import WatchListPanel from '@/components/globe/WatchListPanel';

// Natural Earth 110m land polygons — public domain, no API key required
const LAND_DATA_URL =
    'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_land.geojson';

function congestionColor(index: number): [number, number, number, number] {
    if (index <= 25) return [0, 255, 136, 220];  // green  — NORMAL
    if (index <= 50) return [255, 200, 0, 230];  // yellow — ELEVATED
    if (index <= 75) return [255, 140, 0, 240];  // orange — CONGESTED
    return [255, 68, 68, 255];        // red    — SEVERE
}

// Maps SST value (°C) to RGBA colour
// Cold: deep blue (-2°C) → Cool: cyan (10°C) → Warm: yellow (22°C) → Hot: red (32°C)
function sstColor(sst: number): [number, number, number, number] {
    if (sst <= -2) return [0, 0, 139, 180];
    if (sst <= 5) return [0, 105, 200, 170];
    if (sst <= 10) return [0, 200, 220, 160];
    if (sst <= 15) return [0, 230, 180, 150];
    if (sst <= 20) return [80, 220, 100, 140];
    if (sst <= 25) return [255, 200, 0, 140];
    if (sst <= 29) return [255, 120, 0, 150];
    return [220, 30, 30, 160];
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

interface GlobeViewProps {
    embedMode?: boolean;
    initialLat?: number;
    initialLon?: number;
    initialZoom?: number;
    embedFilter?: string | null;
}

export default function GlobeViewComponent({
    embedMode = false,
    initialLat,
    initialLon,
    initialZoom,
    embedFilter,
}: GlobeViewProps = {}) {
    const { vesselMapRef, totalCount, isLoading, dataFreshness, realtimeActiveRef } =
        useVesselStream();

    const [globeData, setGlobeData] = useState<GlobeData>(EMPTY_GLOBE_DATA);
    const { isDemoMode, demoVessels } = useDemoMode(globeData.count);
    const {
        isRouteMode, setIsRouteMode,
        waypoints, addWaypoint,
        clearRoute, threats, isAnalyzing, threatCount
    } = useRouteRisk();
    const [selectedVessel, setSelectedVessel] = useState<VesselRow | null>(null);
    const [comparedVessel, setComparedVessel] = useState<any>(null);
    const [showCompare, setShowCompare] = useState(false);
    const [showWatchList, setShowWatchList] = useState(false);
    const { watchList, isWatched } = useWatchList();
    const { track } = useVesselTrack(
        selectedVessel?.mmsi ? Number(selectedVessel.mmsi) : null
    );
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
    const [layersOpen, setLayersOpen] = useState(false);
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

    // ── Compute dynamic initial view state ───────────────────────────────────
    const initialViewState = {
        longitude: initialLon ?? 75,
        latitude: initialLat ?? 15,
        zoom: initialZoom ?? 1.8,
        pitch: embedMode ? 0 : (typeof window !== 'undefined' && window.innerWidth < 640 ? 20 : 45),
        bearing: 0,
    };

    // ── 500ms batch timer ─────────────────────────────────────────────────────
    // Reads from vesselMapRef (no React dependency), builds Float32Array,
    // triggers exactly ONE setState per 500ms regardless of vessel update volume.
    useEffect(() => {
        const interval = setInterval(() => {
            if ('requestIdleCallback' in window) {
                requestIdleCallback(() => {
                    if (isDemoMode) return;
                    let vessels = Array.from(vesselMapRef.current.values()).filter(
                        (v) => v.lat !== null && v.lon !== null
                    );

                    if (embedMode && embedFilter) {
                        switch (embedFilter) {
                            case 'sanctioned':
                                vessels = vessels.filter(v => v.sanctions_match);
                                break;
                            case 'darkfleet':
                                vessels = vessels.filter(v => (v.dark_fleet_score ?? 0) >= 60);
                                break;
                            case 'tanker':
                                vessels = vessels.filter(v => v.type_category === 'Tanker');
                                break;
                            case 'cargo':
                                vessels = vessels.filter(v => v.type_category === 'Cargo');
                                break;
                        }
                    }

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
                }, { timeout: 2000 });
            } else {
                if (isDemoMode) return;
                let vessels = Array.from(vesselMapRef.current.values()).filter(
                    (v) => v.lat !== null && v.lon !== null
                );

                if (embedMode && embedFilter) {
                    switch (embedFilter) {
                        case 'sanctioned':
                            vessels = vessels.filter(v => v.sanctions_match);
                            break;
                        case 'darkfleet':
                            vessels = vessels.filter(v => (v.dark_fleet_score ?? 0) >= 60);
                            break;
                        case 'tanker':
                            vessels = vessels.filter(v => v.type_category === 'Tanker');
                            break;
                        case 'cargo':
                            vessels = vessels.filter(v => v.type_category === 'Cargo');
                            break;
                    }
                }

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
            }
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
            const g = v.sanctions_match ? 68 : v.is_anomaly ? 184 : 152;
            const b = v.sanctions_match ? 68 : v.is_anomaly ? 0 : 219;

            colors[i * 4] = r;
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
            [0, 30, 80, 160],   // very sparse  — dark navy
            [0, 70, 120, 180],   // sparse       — dark blue
            [0, 120, 160, 200],   // moderate     — blue
            [0, 170, 200, 220],   // medium       — teal
            [0, 212, 255, 235],   // dense        — accent cyan
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

    // ── Route layers ───────────────────────────────────────────────────────────
    const routeLineLayer = waypoints.length === 2
        ? new LineLayer({
            id: 'route-line',
            data: [{
                source: [waypoints[0].lon, waypoints[0].lat],
                target: [waypoints[1].lon, waypoints[1].lat]
            }],
            getSourcePosition: (d: any) => d.source,
            getTargetPosition: (d: any) => d.target,
            getColor: [0, 212, 255, 200],
            getWidth: 2,
            widthMinPixels: 2,
        })
        : null

    const waypointLayer = waypoints.length > 0
        ? new ScatterplotLayer({
            id: 'route-waypoints',
            data: waypoints,
            getPosition: (d: any) => [d.lon, d.lat],
            getFillColor: [0, 212, 255, 255],
            getLineColor: [255, 255, 255, 200],
            getRadius: 40000,
            radiusMinPixels: 8,
            stroked: true,
            lineWidthMinPixels: 2,
            pickable: false,
        })
        : null

    const trackLayer = track.length > 1
      ? new TripsLayer({
          id: 'vessel-track',
          data: [{
            path: track.map(p => [p.lon, p.lat]),
            timestamps: track.map((_, i) => i),
          }],
          getPath: (d: any) => d.path,
          getTimestamps: (d: any) => d.timestamps,
          getColor: [0, 212, 255],
          opacity: 0.8,
          widthMinPixels: 2,
          trailLength: track.length,
          currentTime: track.length,
          shadowEnabled: false,
        })
      : null

    const watchedMmsiSet = new Set(watchList.map(v => v.mmsi));
    const watchedVesselLayer = new ScatterplotLayer({
        id: 'watched-vessels',
        data: globeData.vessels.filter((v: any) => watchedMmsiSet.has(v.mmsi)),
        getPosition: (d: any) => [d.lon, d.lat],
        getRadius: 900,
        getFillColor: [0, 212, 255, 180],
        getLineColor: [0, 212, 255, 255],
        stroked: true,
        lineWidthMinPixels: 2,
        pickable: false,
        radiusMinPixels: 6,
        radiusMaxPixels: 20,
    });

    // ── deck.gl layers ─────────────────────────────────────────────────────────
    const layers = showHeatmap
        ? [heatmapLayer, ...(trackLayer ? [trackLayer] : []), routeLineLayer, waypointLayer].filter(Boolean)
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
                    if (s >= 80) return [255, 30, 30, 255]; // EXTREME — bright red
                    if (s >= 70) return [255, 100, 0, 255]; // HIGH    — orange-red
                    return [255, 165, 0, 240]; // MEDIUM  — orange
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
                        setShowWatchList(false)
                        setSelectedPort(null)
                        setSelectedPiracy(null)
                        setSpillResult(null)
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
                        setShowWatchList(false)
                        setSelectedVessel(null)
                        setSelectedPiracy(null)
                        setSpillResult(null)
                        setSelectedPort(object)
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
                        case 'HIJACKED': return [255, 68, 68, 220]   // alert-critical red
                        case 'FIRED_UPON': return [255, 140, 0, 200]   // alert-warning orange
                        case 'BOARDED': return [255, 200, 0, 180]   // yellow
                        default: return [100, 180, 255, 160]  // blue for approached/suspicious
                    }
                },
                radiusMinPixels: 4,
                radiusMaxPixels: 18,
                stroked: true,
                getLineColor: [255, 255, 255, 120],
                lineWidthMinPixels: 1,
                pickable: true,
                onClick: ({ object }: { object: any }) => {
                    if (object) {
                        setShowWatchList(false)
                        setSelectedVessel(null)
                        setSelectedPort(null)
                        setSpillResult(null)
                        setSelectedPiracy(object as PiracyIncident)
                    }
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
                        setShowWatchList(false)
                        setSelectedPort(null)
                        setSelectedPiracy(null)
                        setSpillResult(null)
                        if (selectedVessel &&
                            selectedVessel.mmsi !== v.mmsi &&
                            !showCompare) {
                            // Second vessel clicked — trigger comparison
                            setComparedVessel(v)
                            setShowCompare(true)
                        } else {
                            // First click or same vessel — normal selection
                            setSelectedVessel(v)
                            setShowCompare(false)
                            setComparedVessel(null)
                        }
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
            ...(watchList.length > 0 ? [watchedVesselLayer] : []),
            ...(trackLayer ? [trackLayer] : []),
            ...(routeLineLayer ? [routeLineLayer] : []),
            ...(waypointLayer ? [waypointLayer] : []),
        ];

    return (
        <div className="relative w-full h-screen bg-ocean-base overflow-hidden">
            {/* ── Globe ──────────────────────────────────────────────────────────── */}
            <DeckGL
                views={new GlobeView()}
                initialViewState={initialViewState}
                controller
                layers={layers}
                style={{ background: '#0A1628' }}
                getCursor={({ isHovering }: any) => (isHovering ? 'crosshair' : 'grab')}
                onError={(error: any) => console.error('[DeckGL]', error)}
                onClick={({ coordinate }: any, event: any) => {
                    if (isRouteMode && coordinate && event?.srcEvent?.shiftKey) {
                        addWaypoint({ lat: coordinate[1], lon: coordinate[0] })
                    }
                }}
            />

            {/* ── Top status bar ─────────────────────────────────────────────────── */}
            {!embedMode && (
            <>
            <div className="fixed top-0 left-0 right-0 z-20 bg-[#0a0f1e]/95 backdrop-blur-sm border-b border-[#1a2744] px-3 sm:px-4 py-2 flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="font-heading text-white font-bold text-lg tracking-wide">
                        THALWEG
                    </span>
                    <span className="text-text-muted text-xs font-data hidden sm:block">
                        MARITIME INTELLIGENCE
                    </span>
                </div>

                <div className="relative w-32 sm:w-auto flex-shrink-0">
                    <VesselSearchBar
                        vessels={globeData.vessels}
                        onVesselSelect={(vessel) => {
                            setShowWatchList(false)
                            setSelectedPort(null)
                            setSelectedPiracy(null)
                            setSpillResult(null)
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

                {/* Vessel count + REALTIME */}
                <div className="flex items-center gap-4 text-xs font-data hidden md:flex flex-shrink-0">
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
                </div>

                {/* DESKTOP ONLY toggle buttons */}
                <div className="hidden sm:flex items-center gap-2 md:gap-2 ml-auto">
                    <button
                        onClick={() => setIsRouteMode(!isRouteMode)}
                        className={`
                            font-data min-h-[36px] sm:min-h-0 rounded border transition-colors touch-manipulation px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs whitespace-nowrap flex-shrink-0
                            ${isRouteMode
                                ? 'border-[#00d4ff] bg-[#00d4ff]/20 text-[#00d4ff]'
                                : 'border-text-muted text-text-muted hover:border-[#00d4ff] hover:text-[#00d4ff]'
                            }
                        `}
                    >
                        {isRouteMode
                            ? (waypoints.length === 0 ? <><span className="hidden sm:inline">⇧ CLICK </span>ORIGIN</>
                                : waypoints.length === 1 ? <><span className="hidden sm:inline">⇧ CLICK </span>DEST</>
                                    : `${threatCount} THREATS`)
                            : 'ROUTE'
                        }
                    </button>

                    <button
                        onClick={() => setSstVisible((v) => !v)}
                        className={`font-data min-h-[36px] sm:min-h-0 rounded border transition-colors touch-manipulation px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs whitespace-nowrap flex-shrink-0 ${sstVisible
                            ? 'border-accent-cyan text-accent-cyan'
                            : 'border-text-muted text-text-muted'
                            }`}
                    >
                        SST
                    </button>
                    <button
                        onClick={() => setDarkFleetVisible((v) => !v)}
                        className={`font-data min-h-[36px] sm:min-h-0 rounded border transition-colors touch-manipulation px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs whitespace-nowrap flex-shrink-0 ${darkFleetVisible
                            ? 'border-alert-critical text-alert-critical'
                            : 'border-text-muted text-text-muted'
                            }`}
                    >
                        DARK FLEET
                    </button>
                    {/* PIRACY button */}
                    <button
                        onClick={() => setShowPiracy(p => !p)}
                        className={`font-data font-medium border transition-all touch-manipulation min-h-[36px] sm:min-h-0 rounded px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs whitespace-nowrap flex-shrink-0 ${showPiracy
                            ? 'bg-red-900/40 border-red-500 text-red-400'
                            : 'bg-navy-950/40 border-gray-600 text-gray-400 hover:border-gray-400'
                            }`}
                    >
                        PIRACY
                    </button>
                    {/* DENSITY button */}
                    <button
                        onClick={() => setShowHeatmap(!showHeatmap)}
                        className={`font-data font-medium border transition-all touch-manipulation min-h-[36px] sm:min-h-0 rounded px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs whitespace-nowrap flex-shrink-0 ${showHeatmap
                            ? 'bg-[#8b5cf6]/20 border-[#8b5cf6] text-[#8b5cf6]'
                            : 'bg-navy-950/40 border-gray-600 text-gray-400 hover:border-gray-400'
                            }`}
                    >
                        DENSITY
                    </button>
                    <button
                        onClick={() => setShowWatchList(prev => {
                            if (!prev) {
                                // closing selected vessel if watchlist opens
                                setSelectedVessel(null)
                            }
                            return !prev
                        })}
                        className={`font-mono tracking-widest text-[10px] px-3 py-1.5 transition-colors touch-manipulation border flex-shrink-0 ${showWatchList
                            ? 'bg-[#00d4ff] text-[#0a0f1e] border-[#00d4ff]/30 hover:border-[#00d4ff]'
                            : 'bg-transparent text-slate-400 hover:text-[#00d4ff] border-[#00d4ff]/30 hover:border-[#00d4ff]'
                            }`}
                    >
                        {watchList.length === 0 ? 'WATCHLIST' : `WATCHLIST [${watchList.length}]`}
                    </button>
                </div>

                {/* MOBILE ONLY layers button */}
                <button
                    onClick={() => setLayersOpen(true)}
                    className="flex sm:hidden items-center gap-1.5 ml-auto px-3 py-1.5 rounded border border-[#1a2744] bg-[#0d1424] hover:border-[#00d4ff] text-slate-300 text-[11px] font-data tracking-widest transition-colors touch-manipulation flex-shrink-0"
                >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0">
                        <rect x="0" y="2" width="14" height="1.5" rx="0.75" fill="currentColor"/>
                        <rect x="0" y="6.25" width="14" height="1.5" rx="0.75" fill="currentColor"/>
                        <rect x="0" y="10.5" width="14" height="1.5" rx="0.75" fill="currentColor"/>
                    </svg>
                    LAYERS
                </button>
            </div>

            {/* MOBILE LAYERS DRAWER */}
            {layersOpen && (
              <>
                {/* Backdrop */}
                <div 
                  className="fixed inset-0 z-40 bg-black/60 sm:hidden"
                  onClick={() => setLayersOpen(false)}
                />
                
                {/* Drawer */}
                <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-[#0a0f1e] border-t-2 border-[#00d4ff] rounded-t-2xl pb-safe">
                  
                  {/* Handle bar */}
                  <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 bg-[#1a2744] rounded-full" />
                  </div>

                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-3 border-b border-[#1a2744]">
                    <span className="text-[#00d4ff] text-xs font-data tracking-widest">
                      MAP LAYERS
                    </span>
                    <button 
                      onClick={() => setLayersOpen(false)}
                      className="text-slate-500 text-xs font-data hover:text-white touch-manipulation px-2 py-1">
                      ✕
                    </button>
                  </div>

                  {/* Layer rows */}
                  <div className="px-4 py-3 space-y-1">

                    {/* ROUTE */}
                    <button
                      onClick={() => setIsRouteMode(!isRouteMode)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors touch-manipulation font-data text-sm tracking-wider ${isRouteMode
                          ? 'border-[#00d4ff] bg-[#00d4ff]/10 text-[#00d4ff]'
                          : 'border-[#1a2744] bg-[#0d1424] text-slate-400'
                        }`}
                    >
                      <span>ROUTE BUILDER</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${isRouteMode 
                          ? 'bg-[#00d4ff]/20 text-[#00d4ff]' 
                          : 'bg-[#1a2744] text-slate-600'}`}>
                        {isRouteMode ? 'ON' : 'OFF'}
                      </span>
                    </button>

                    {/* SST */}
                    <button
                      onClick={() => setSstVisible(!sstVisible)} 
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors touch-manipulation font-data text-sm tracking-wider ${sstVisible
                          ? 'border-[#06b6d4] bg-[#06b6d4]/10 text-[#06b6d4]'
                          : 'border-[#1a2744] bg-[#0d1424] text-slate-400'
                        }`}
                    >
                      <span>SEA SURFACE TEMP</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${sstVisible 
                          ? 'bg-[#06b6d4]/20 text-[#06b6d4]' 
                          : 'bg-[#1a2744] text-slate-600'}`}>
                        {sstVisible ? 'ON' : 'OFF'}
                      </span>
                    </button>

                    {/* DARK FLEET */}
                    <button
                      onClick={() => setDarkFleetVisible(!darkFleetVisible)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors touch-manipulation font-data text-sm tracking-wider ${darkFleetVisible
                          ? 'border-[#ef4444] bg-[#ef4444]/10 text-[#ef4444]'
                          : 'border-[#1a2744] bg-[#0d1424] text-slate-400'
                        }`}
                    >
                      <span>DARK FLEET</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${darkFleetVisible 
                          ? 'bg-[#ef4444]/20 text-[#ef4444]' 
                          : 'bg-[#1a2744] text-slate-600'}`}>
                        {darkFleetVisible ? 'ON' : 'OFF'}
                      </span>
                    </button>

                    {/* PIRACY */}
                    <button
                      onClick={() => setShowPiracy(!showPiracy)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors touch-manipulation font-data text-sm tracking-wider ${showPiracy
                          ? 'border-[#f97316] bg-[#f97316]/10 text-[#f97316]'
                          : 'border-[#1a2744] bg-[#0d1424] text-slate-400'
                        }`}
                    >
                      <span>PIRACY ZONES</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${showPiracy 
                          ? 'bg-[#f97316]/20 text-[#f97316]' 
                          : 'bg-[#1a2744] text-slate-600'}`}>
                        {showPiracy ? 'ON' : 'OFF'}
                      </span>
                    </button>

                    {/* DENSITY */}
                    <button
                      onClick={() => setShowHeatmap(!showHeatmap)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors touch-manipulation font-data text-sm tracking-wider ${showHeatmap
                          ? 'border-[#8b5cf6] bg-[#8b5cf6]/10 text-[#8b5cf6]'
                          : 'border-[#1a2744] bg-[#0d1424] text-slate-400'
                        }`}
                    >
                      <span>VESSEL DENSITY</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${showHeatmap 
                          ? 'bg-[#8b5cf6]/20 text-[#8b5cf6]' 
                          : 'bg-[#1a2744] text-slate-600'}`}>
                        {showHeatmap ? 'ON' : 'OFF'}
                      </span>
                    </button>

                    {/* WATCH LIST */}
                    <button
                      onClick={() => {
                        setShowWatchList(true)
                        setLayersOpen(false)
                        setSelectedVessel(null)
                      }}
                      className="w-full flex items-center justify-between px-4 py-3 border border-[#1a2744] bg-[#0d1424] transition-colors touch-manipulation"
                    >
                      <span className="font-mono tracking-widest text-xs text-slate-400">WATCH LIST</span>
                      {watchList.length > 0 ? (
                        <span className="text-[#00d4ff] font-mono tracking-widest text-xs">
                           {watchList.length} VESSEL{watchList.length !== 1 ? 'S' : ''}
                        </span>
                      ) : (
                        <span className="text-slate-500 font-mono tracking-widest text-xs">EMPTY</span>
                      )}
                    </button>

                  </div>

                  {/* Active count footer */}
                  <div className="px-5 py-3 border-t border-[#1a2744]">
                    <span className="text-slate-600 text-[10px] font-data tracking-widest">
                      {[isRouteMode, sstVisible, darkFleetVisible, showPiracy, showHeatmap].filter(Boolean).length} LAYER(S) ACTIVE
                    </span>
                  </div>

                </div>
              </>
            )}
            </>
            )}

            {/* ── Vessel type legend ─────────────────────────────────────────────── */}
            {!embedMode && (
            <div className="absolute bottom-6 left-4 glass-panel rounded z-10 p-2 sm:p-3 max-w-[140px] sm:max-w-none">
                <div className="text-text-muted text-[10px] sm:text-xs font-data mb-1 sm:mb-2 uppercase tracking-widest">
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
                    <div key={label} className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                        <div
                            className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: color, boxShadow: `0 0 4px ${color}` }}
                        />
                        <span className="text-text-secondary text-[10px] sm:text-xs font-body">{label}</span>
                    </div>
                ))}
                {/* Alert indicators */}
                <div className="border-t border-glow mt-1.5 sm:mt-2 pt-1.5 sm:pt-2">
                    <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                        <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-alert-critical" style={{ boxShadow: '0 0 4px #FF4444' }} />
                        <span className="text-alert-critical text-[10px] sm:text-xs font-body">Sanctions Match</span>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-alert-warning" style={{ boxShadow: '0 0 4px #FFB800' }} />
                        <span className="text-alert-warning text-[10px] sm:text-xs font-body">Anomaly Detected</span>
                    </div>
                </div>
            </div>
            )}

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

            {/* ── RIGHT SIDE PANELS (one at a time) ─────────── */}

            {!embedMode && (
            <>
            {/* Piracy incident detail */}
            {selectedPiracy && (
                <PiracyPanel
                    incident={selectedPiracy}
                    onClose={() => setSelectedPiracy(null)}
                />
            )}

            {/* Vessel detail — RIGHT side */}
            {selectedVessel && (
                <VesselPanel
                    vessel={selectedVessel}
                    onClose={() => { setSelectedVessel(null); setSpillResult(null) }}
                />
            )}

            {/* Watch List panel */}
            {showWatchList && (
                <WatchListPanel
                    onClose={() => setShowWatchList(false)}
                    onSelectVessel={(mmsi: string) => {
                        const vessel = globeData.vessels.find((v: any) => v.mmsi === mmsi)
                        if (vessel) {
                            setSelectedPort(null)
                            setSelectedPiracy(null)
                            setSpillResult(null)
                            setSelectedVessel(vessel)
                            setShowWatchList(false)
                        }
                    }}
                />
            )}

            {/* Port detail — RIGHT side */}
            {selectedPort && (
                <PortPanel
                    port={selectedPort}
                    onClose={() => setSelectedPort(null)}
                />
            )}

            {/* Route risk panel — RIGHT side, only when no vessel/port */}
            {!selectedVessel && !selectedPort && (
                <RouteRiskPanel
                    waypoints={waypoints}
                    threats={threats}
                    isAnalyzing={isAnalyzing}
                    onClear={clearRoute}
                />
            )}

            {/* ── LEFT SIDE PANELS ────────────────────────────── */}

            {/* Spill prediction — LEFT side, independent of vessel panel */}
            {selectedVessel && (
                <div className="absolute left-3 sm:left-4 top-16 w-[calc(100vw-24px)] sm:w-96 max-w-[calc(50vw-32px)] pointer-events-auto z-10">
                    <SpillPanel
                        vesselLat={selectedVessel.lat}
                        vesselLon={selectedVessel.lon}
                        mmsi={selectedVessel.mmsi}
                        vesselType={selectedVessel.type_category ?? null}
                        onSpillResult={setSpillResult}
                    />
                </div>
            )}

            {showCompare && selectedVessel && comparedVessel && (
                <ComparePanel
                    vesselA={{ ...selectedVessel, mmsi: Number(selectedVessel.mmsi) } as any}
                    vesselB={{ ...comparedVessel, mmsi: Number(comparedVessel.mmsi) } as any}
                    onClose={() => {
                        setShowCompare(false)
                        setComparedVessel(null)
                    }}
                />
            )}
            </>
            )}
        </div>
    );
}
