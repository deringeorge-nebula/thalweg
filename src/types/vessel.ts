// src/types/vessel.ts

export interface VesselRow {
    mmsi: string;
    imo_number: string | null;
    vessel_name: string | null;
    call_sign: string | null;
    flag_state: string | null;
    ship_type: number | null;
    type_category: string | null;
    type_color: string | null;
    lat: number;
    lon: number;
    sog: number | null;
    cog: number | null;
    true_heading: number | null;
    nav_status: number | null;
    destination: string | null;
    is_active: boolean;
    is_anomaly: boolean;
    sanctions_match: boolean;
    dark_fleet_score: number | null;
    last_update: string | null;
}

export interface GlobeData {
    positions: Float32Array;    // [lon, lat, lon, lat, ...] — deck.gl lon-first
    colors: Uint8Array;         // [r, g, b, a, r, g, b, a, ...]
    vessels: VesselRow[];       // parallel array for picking lookup
    count: number;
}

export const NAV_STATUS_LABELS: Record<number, string> = {
    0: 'Under Way (Engine)',
    1: 'At Anchor',
    2: 'Not Under Command',
    3: 'Restricted Maneuverability',
    4: 'Constrained by Draft',
    5: 'Moored',
    6: 'Aground',
    7: 'Engaged in Fishing',
    8: 'Under Way (Sailing)',
    15: 'Undefined',
};

// Parse "#RRGGBB" → [r, g, b]
export function hexToRgb(hex: string): [number, number, number] {
    const clean = hex.replace('#', '');
    return [
        parseInt(clean.substring(0, 2), 16),
        parseInt(clean.substring(2, 4), 16),
        parseInt(clean.substring(4, 6), 16),
    ];
}
