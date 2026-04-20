// supabase/functions/ais-relay/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const AISSTREAM_WS_URL = "wss://stream.aisstream.io/v0/stream";
const AISSTREAM_API_KEY = Deno.env.get("AISSTREAM_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("MY_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
});

const VESSEL_TYPE_MAP: Record<number, { category: string; color: string }> = {
    30: { category: "Fishing", color: "#27AE60" },
    36: { category: "Sailing", color: "#BDC3C7" },
    37: { category: "Pleasure Craft", color: "#95A5A6" },
    40: { category: "High Speed Craft", color: "#F39C12" },
    51: { category: "SAR", color: "#E67E22" },
    55: { category: "Law Enforcement", color: "#D35400" },
    60: { category: "Passenger", color: "#9B59B6" },
    69: { category: "Passenger - Cruise", color: "#8E44AD" },
    70: { category: "Cargo", color: "#3498DB" },
    71: { category: "Cargo - Hazmat A", color: "#1ABC9C" },
    72: { category: "Cargo - Hazmat B", color: "#16A085" },
    79: { category: "Cargo - General", color: "#2980B9" },
    80: { category: "Tanker", color: "#E74C3C" },
    81: { category: "Tanker - Chemical", color: "#E74C3C" },
    82: { category: "Tanker - LNG", color: "#FF6B35" },
    83: { category: "Tanker - LPG", color: "#FF8C00" },
    84: { category: "Tanker - Crude", color: "#C0392B" },
};

function classifyVessel(shipType: number): { category: string; color: string } {
    if (VESSEL_TYPE_MAP[shipType]) return VESSEL_TYPE_MAP[shipType];
    if (shipType >= 70 && shipType <= 79) return { category: "Cargo", color: "#3498DB" };
    if (shipType >= 80 && shipType <= 89) return { category: "Tanker", color: "#E74C3C" };
    if (shipType >= 60 && shipType <= 69) return { category: "Passenger", color: "#9B59B6" };
    return { category: "Unknown", color: "#7F8C8D" };
}

const MAX_SPEEDS: Record<string, number> = {
    Cargo: 22, Tanker: 18, Bulk: 16, Passenger: 28,
    "High Speed Craft": 45, Fishing: 15, Tug: 13, Unknown: 30,
};

function haversineNM(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3440.065;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const vesselCache = new Map<string, {
    lat: number; lon: number; timestamp: number; lastPositionWrite: number;
}>();

const lastPositionWrite = new Map<string, number>();
const pendingVessels = new Map<string, Record<string, unknown>>();
let pendingPositions: Record<string, unknown>[] = [];
let batchFlushTimer: number | null = null;

const MAX_CACHE_SIZE = 50_000;
const POSITION_WRITE_INTERVAL_MS = 15 * 60 * 1000;
const BATCH_INTERVAL_MS = 2_000;
const DEDUP_DISTANCE_DEG = 0.001;
const DEDUP_TIME_MS = 30_000;

interface AISMessage {
    MessageType: string;
    MetaData: {
        MMSI: string;
        ShipName: string;
        latitude: number;
        longitude: number;
        time_utc: string;
        MMSI_String: string;
    };
    Message: {
        PositionReport?: {
            Sog: number; Cog: number; TrueHeading: number;
            NavigationalStatus: number; Latitude: number; Longitude: number;
        };
        ShipStaticData?: {
            ImoNumber: number; CallSign: string;
            Dimension: { A: number; B: number; C: number; D: number };
            TypeOfShipAndCargoCode: number; Destination: string;
            Eta: { Month: number; Day: number; Hour: number; Minute: number };
            Name: string;
        };
    };
}

// Returns position update OR null; handles static data separately
function getMmsi(msg: AISMessage): string | null {
    const rawMmsi = msg.MetaData?.MMSI_String || msg.MetaData?.MMSI?.toString();
    if (!rawMmsi) return null;
    const mmsi = String(rawMmsi).trim().substring(0, 9);
    return mmsi.length >= 5 ? mmsi : null;
}

function parsePositionReport(raw: string): {
    mmsi: string; lat: number; lon: number; sog: number; cog: number;
    trueHeading: number; navStatus: number; vesselName: string; timestamp: number;
    type: "position";
} | null {
    let msg: AISMessage;
    try { msg = JSON.parse(raw); } catch { return null; }
    if (!msg?.MetaData || !msg?.Message?.PositionReport) return null;

    const mmsi = getMmsi(msg);
    if (!mmsi) return null;

    const pos = msg.Message.PositionReport;
    const lat = pos.Latitude ?? msg.MetaData.latitude;
    const lon = pos.Longitude ?? msg.MetaData.longitude;

    if (lat === undefined || lon === undefined || (lat === 0 && lon === 0)) return null;
    if (lat > 90 || lat < -90 || lon > 180 || lon < -180) return null;

    const sog = (pos.Sog ?? 0) / 10;
    if (sog > 102.2) return null;

    return {
        type: "position",
        mmsi, lat, lon,
        sog, cog: (pos.Cog ?? 0) / 10,
        trueHeading: pos.TrueHeading ?? 511,
        navStatus: pos.NavigationalStatus ?? 15,
        vesselName: (msg.MetaData.ShipName ?? "").trim(),
        timestamp: new Date(msg.MetaData.time_utc).getTime() || Date.now(),
    };
}

function parseStaticData(raw: string): {
    mmsi: string; imoNumber: string | null; callSign: string | null;
    shipType: number; vesselName: string;
    dimA: number | null; dimB: number | null; dimC: number | null; dimD: number | null;
    destination: string | null; type: "static";
} | null {
    let msg: AISMessage;
    try { msg = JSON.parse(raw); } catch { return null; }
    if (!msg?.Message?.ShipStaticData) return null;

    const mmsi = getMmsi(msg);
    if (!mmsi) return null;

    const s = msg.Message.ShipStaticData;
    const imoRaw = s.ImoNumber;
    const imoNumber = imoRaw && imoRaw > 0 ? String(imoRaw) : null;

    return {
        type: "static",
        mmsi,
        imoNumber,
        callSign: s.CallSign?.trim() || null,
        shipType: s.TypeOfShipAndCargoCode ?? 0,
        vesselName: (s.Name ?? msg.MetaData?.ShipName ?? "").trim(),
        dimA: s.Dimension?.A || null,
        dimB: s.Dimension?.B || null,
        dimC: s.Dimension?.C || null,
        dimD: s.Dimension?.D || null,
        destination: s.Destination?.trim() || null,
    };
}

async function flushBatch() {
    if (pendingVessels.size === 0) return;
    const vesselsArray = Array.from(pendingVessels.values());
    const positionsArray = [...pendingPositions];
    pendingVessels.clear();
    pendingPositions = [];
    batchFlushTimer = null;

    try {
        const { error: vErr } = await supabase
            .from("vessels")
            .upsert(vesselsArray, { onConflict: "mmsi", ignoreDuplicates: false });
        if (vErr) throw new Error(vErr.message);

        if (positionsArray.length > 0) {
            const { error: pErr } = await supabase
                .from("vessel_positions")
                .insert(positionsArray);
            if (pErr) throw new Error(pErr.message);
        }
    } catch (e: unknown) {
        console.error("[ais-relay] Batch flush exception:", (e as Error).message);
    }
}

function scheduleBatchFlush() {
    if (batchFlushTimer !== null) return;
    batchFlushTimer = setTimeout(flushBatch, BATCH_INTERVAL_MS) as unknown as number;
}

let lastHeartbeat = 0;
async function heartbeat() {
    const now = Date.now();
    if (now - lastHeartbeat < 5 * 60 * 1000) return;
    lastHeartbeat = now;
    await supabase.from("system_jobs").upsert({
        job_name: "ais-relay",
        last_run_at: new Date().toISOString(),
        last_success_at: new Date().toISOString(),
        status: "running",
        records_processed: vesselCache.size,
        consecutive_failures: 0,
    }, { onConflict: "job_name" });
}

async function processPositionMessage(parsed: NonNullable<ReturnType<typeof parsePositionReport>>) {
    const { mmsi, lat, lon, sog, cog, trueHeading, navStatus, vesselName, timestamp } = parsed;
    const cached = vesselCache.get(mmsi);

    if (cached) {
        const timeDelta = timestamp - cached.timestamp;
        const latDelta = Math.abs(lat - cached.lat);
        const lonDelta = Math.abs(lon - cached.lon);
        if (latDelta < DEDUP_DISTANCE_DEG && lonDelta < DEDUP_DISTANCE_DEG && timeDelta < DEDUP_TIME_MS) return;

        if (timeDelta > 180_000) {
            const distNM = haversineNM(cached.lat, cached.lon, lat, lon);
            const impliedSpeed = distNM / (timeDelta / 3_600_000);
            if (impliedSpeed > MAX_SPEEDS["Unknown"] * 1.5) {
                console.warn(`[ais-relay] Spoofed position MMSI=${mmsi} implied=${impliedSpeed.toFixed(1)}kn`);
                return;
            }
        }
    }

    if (vesselCache.size >= MAX_CACHE_SIZE && !cached) {
        const firstKey = vesselCache.keys().next().value;
        if (firstKey) vesselCache.delete(firstKey);
    }

    const localLastPosWrite = cached?.lastPositionWrite ?? 0;
    vesselCache.set(mmsi, { lat, lon, timestamp, lastPositionWrite: localLastPosWrite });

    const classification = classifyVessel(0);

    // Merge with existing pending vessel to preserve static data fields
    const existing = pendingVessels.get(mmsi) ?? {};
    pendingVessels.set(mmsi, {
        ...existing,
        mmsi, lat, lon, sog, cog,
        true_heading: trueHeading === 511 ? null : trueHeading,
        nav_status: navStatus,
        vessel_name: vesselName || existing.vessel_name || undefined,
        type_category: existing.type_category || classification.category,
        type_color: existing.type_color || classification.color,
        is_active: true,
        last_update: new Date(timestamp).toISOString(),
    });

    const now = Date.now();
    const lastWrite = lastPositionWrite.get(mmsi) ?? 0;
    if (now - lastWrite >= POSITION_WRITE_INTERVAL_MS) {
        lastPositionWrite.set(mmsi, now);
        pendingPositions.push({
            mmsi, lat, lon, sog, cog, nav_status: navStatus,
            recorded_at: new Date().toISOString(),
        });
    }

    scheduleBatchFlush();
    await heartbeat();
}

async function processStaticMessage(parsed: NonNullable<ReturnType<typeof parseStaticData>>) {
    const { mmsi, imoNumber, callSign, shipType, vesselName, dimA, dimB, dimC, dimD, destination } = parsed;
    const classification = classifyVessel(shipType);

    // Merge with existing pending vessel
    const existing = pendingVessels.get(mmsi) ?? {};
    pendingVessels.set(mmsi, {
        ...existing,
        mmsi,
        ...(imoNumber ? { imo_number: imoNumber } : {}),
        ...(callSign ? { call_sign: callSign } : {}),
        ...(vesselName ? { vessel_name: vesselName } : {}),
        ...(destination ? { destination } : {}),
        ship_type: shipType,
        type_category: classification.category,
        type_color: classification.color,
        ...(dimA ? { dim_a: dimA, dim_b: dimB, length_m: (dimA ?? 0) + (dimB ?? 0) } : {}),
        ...(dimC ? { dim_c: dimC, dim_d: dimD, beam_m: (dimC ?? 0) + (dimD ?? 0) } : {}),
        last_update: new Date().toISOString(),
    });

    scheduleBatchFlush();
}

// Subscribe to BOTH PositionReport AND ShipStaticData
const SUBSCRIPTION_PAYLOAD = JSON.stringify({
    APIKey: AISSTREAM_API_KEY,
    BoundingBoxes: [[[-90, -180], [90, 180]]],
    FilterMessageTypes: ["PositionReport", "ShipStaticData"],
});

async function cleanOldPositions() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from("vessel_positions").delete().lt("recorded_at", cutoff);
    if (error) console.error("[ais-relay] Cleanup error:", error.message);
    else console.log("[ais-relay] Old positions cleaned");
}

setInterval(cleanOldPositions, 60 * 60 * 1000);
cleanOldPositions();

let consecutiveFailures = 0;
const MAX_BACKOFF_MS = 60_000;

async function connect() {
    const backoffMs = Math.min(1000 * Math.pow(2, consecutiveFailures), MAX_BACKOFF_MS);
    if (consecutiveFailures > 0) {
        console.log(`[ais-relay] Reconnecting in ${backoffMs}ms (attempt ${consecutiveFailures + 1})`);
        await new Promise((r) => setTimeout(r, backoffMs));
    }

    console.log("[ais-relay] Connecting to AISStream.io...");

    if (consecutiveFailures >= 5) {
        await supabase.from("system_jobs").upsert({
            job_name: "ais-relay", status: "failing",
            last_error: `${consecutiveFailures} consecutive connection failures`,
            consecutive_failures: consecutiveFailures, last_run_at: new Date().toISOString(),
        }, { onConflict: "job_name" });
    }

    const ws = new WebSocket(AISSTREAM_WS_URL);

    ws.onopen = () => {
        consecutiveFailures = 0;
        console.log("[ais-relay] Connected. Subscribing...");
        ws.send(SUBSCRIPTION_PAYLOAD);
    };

    ws.onmessage = async (event: MessageEvent) => {
        let raw = "";
        if (typeof event.data === "string") raw = event.data;
        else if (event.data instanceof ArrayBuffer) raw = new TextDecoder().decode(event.data);
        else if (event.data instanceof Blob) raw = await event.data.text();
        else raw = String(event.data);

        // Try position first, then static
        const position = parsePositionReport(raw);
        if (position) { await processPositionMessage(position); return; }

        const staticData = parseStaticData(raw);
        if (staticData) { await processStaticMessage(staticData); }
    };

    ws.onclose = (event: CloseEvent) => {
        consecutiveFailures++;
        console.log(`[ais-relay] Closed. Code=${event.code}. Reconnecting...`);
        connect();
    };

    ws.onerror = (event: Event) => {
        console.error("[ais-relay] WebSocket error:", event);
    };
}

Deno.serve(async (_req: Request) => {
    connect();
    await new Promise((resolve) => setTimeout(resolve, 30000));
    return new Response(
        JSON.stringify({ status: "ais-relay started", vessels_cached: vesselCache.size }),
        { headers: { "Content-Type": "application/json" } }
    );
});
