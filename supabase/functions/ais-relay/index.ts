// supabase/functions/ais-relay/index.ts
// AIS WebSocket Relay — Supabase Edge Function (Deno runtime)
// Connects to AISStream.io server-side, writes to Supabase Postgres.
// NEVER expose AISStream API key to browser.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const AISSTREAM_WS_URL = "wss://stream.aisstream.io/v0/stream";
const AISSTREAM_API_KEY = Deno.env.get("AISSTREAM_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// FIX 1: Service Role Key Bypass
const SERVICE_ROLE_KEY = Deno.env.get("MY_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
});

// ─── Vessel type classification ───────────────────────────────────────────────
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

// ─── Max physical speeds by category (knots) ──────────────────────────────────
const MAX_SPEEDS: Record<string, number> = {
    Cargo: 22, Tanker: 18, Bulk: 16, Passenger: 28,
    "High Speed Craft": 45, Fishing: 15, Tug: 13, Unknown: 30,
};

// ─── Haversine distance (nautical miles) ──────────────────────────────────────
function haversineNM(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3440.065; // Earth radius in nautical miles
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── In-memory state ──────────────────────────────────────────────────────────
const vesselCache = new Map<string, {
    lat: number; lon: number; timestamp: number; lastPositionWrite: number;
}>();

const lastPositionWrite = new Map<string, number>();

// FIX 2: Separate queues to solve the Foreign Key Violation
const pendingVessels = new Map<string, Record<string, unknown>>();
let pendingPositions: Record<string, unknown>[] = [];
let batchFlushTimer: number | null = null;

const MAX_CACHE_SIZE = 50_000;
const POSITION_WRITE_INTERVAL_MS = 15 * 60 * 1000; // 15 min per vessel
const BATCH_INTERVAL_MS = 2_000; // flush every 2 seconds
const DEDUP_DISTANCE_DEG = 0.001; // ~100m
const DEDUP_TIME_MS = 30_000; // 30 seconds

// ─── Message parser + validator ───────────────────────────────────────────────
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
            Sog: number;
            Cog: number;
            TrueHeading: number;
            NavigationalStatus: number;
            Latitude: number;
            Longitude: number;
        };
        ShipStaticData?: {
            ImoNumber: number;
            CallSign: string;
            Dimension: { A: number; B: number; C: number; D: number };
            TypeOfShipAndCargoCode: number;
            Destination: string;
            Eta: { Month: number; Day: number; Hour: number; Minute: number };
        };
    };
}

function parseAndValidate(raw: string): {
    mmsi: string; lat: number; lon: number; sog: number; cog: number;
    trueHeading: number; navStatus: number; shipType: number;
    vesselName: string; timestamp: number;
} | null {
    let msg: AISMessage;
    try {
        msg = JSON.parse(raw);
    } catch {
        return null;
    }

    if (!msg?.MetaData || !msg?.Message?.PositionReport) return null;

    const meta = msg.MetaData;
    const pos = msg.Message.PositionReport;

    // FIX 3: Indestructible MMSI string parser
    const rawMmsi = meta.MMSI_String || meta.MMSI?.toString();
    if (!rawMmsi) return null;
    const mmsi = String(rawMmsi).trim().substring(0, 9);
    if (mmsi.length < 5) return null;

    const lat = pos.Latitude ?? meta.latitude;
    const lon = pos.Longitude ?? meta.longitude;

    if (lat === undefined || lon === undefined || (lat === 0 && lon === 0)) return null;
    if (lat > 90 || lat < -90 || lon > 180 || lon < -180) return null;

    const sog = (pos.Sog ?? 0) / 10;
    if (sog > 102.2) return null;

    const cog = (pos.Cog ?? 0) / 10;
    const trueHeading = pos.TrueHeading ?? 511;
    const navStatus = pos.NavigationalStatus ?? 15;

    return {
        mmsi, lat, lon, sog, cog, trueHeading, navStatus,
        shipType: 0,
        vesselName: (meta.ShipName ?? "").trim(),
        timestamp: new Date(meta.time_utc).getTime() || Date.now(),
    };
}

// ─── Batch flush to Supabase ──────────────────────────────────────────────────
async function flushBatch() {
    if (pendingVessels.size === 0) return;

    // Lock the queues
    const vesselsArray = Array.from(pendingVessels.values());
    const positionsArray = [...pendingPositions];

    pendingVessels.clear();
    pendingPositions = [];
    batchFlushTimer = null;

    try {
        // FIX 2 (cont.): Write vessels FIRST
        const { error: vErr } = await supabase
            .from("vessels")
            .upsert(vesselsArray, { onConflict: "mmsi", ignoreDuplicates: false });

        if (vErr) throw new Error(vErr.message);

        // Then write positions SECOND
        if (positionsArray.length > 0) {
            const { error: pErr } = await supabase
                .from("vessel_positions")
                .insert(positionsArray);

            if (pErr) throw new Error(pErr.message);
        }
    } catch (e: any) {
        console.error("[ais-relay] Batch flush exception:", e.message);
    }
}

function scheduleBatchFlush() {
    if (batchFlushTimer !== null) return;
    batchFlushTimer = setTimeout(flushBatch, BATCH_INTERVAL_MS) as unknown as number;
}

// ─── Update system_jobs heartbeat ────────────────────────────────────────────
let lastHeartbeat = 0;
async function heartbeat() {
    const now = Date.now();
    if (now - lastHeartbeat < 5 * 60 * 1000) return; // every 5 min
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

// ─── Process a single parsed AIS message ─────────────────────────────────────
async function processMessage(parsed: NonNullable<ReturnType<typeof parseAndValidate>>) {
    const { mmsi, lat, lon, sog, cog, trueHeading, navStatus, vesselName, timestamp } = parsed;

    const cached = vesselCache.get(mmsi);

    // ── Deduplication ────────────────────────────────────────────────────────────
    if (cached) {
        const timeDelta = timestamp - cached.timestamp;
        const latDelta = Math.abs(lat - cached.lat);
        const lonDelta = Math.abs(lon - cached.lon);
        const positionUnchanged = latDelta < DEDUP_DISTANCE_DEG && lonDelta < DEDUP_DISTANCE_DEG;
        if (positionUnchanged && timeDelta < DEDUP_TIME_MS) return; // duplicate, skip

        // ── Spoofing check ──────────────────────────────────────────────────────────
        if (timeDelta > 180_000) {
            const distNM = haversineNM(cached.lat, cached.lon, lat, lon);
            const timeHours = timeDelta / 3_600_000;
            const impliedSpeed = distNM / timeHours;
            const maxSpeed = MAX_SPEEDS["Unknown"];
            if (impliedSpeed > maxSpeed * 1.5) {
                console.warn(`[ais-relay] Spoofed position detected MMSI=${mmsi} implied=${impliedSpeed.toFixed(1)}kn`);
                return;
            }
        }
    }

    // ── Manage cache size ────────────────────────────────────────────────────────
    if (vesselCache.size >= MAX_CACHE_SIZE && !cached) {
        const firstKey = vesselCache.keys().next().value;
        if (firstKey) vesselCache.delete(firstKey);
    }

    // ── Update in-memory cache ───────────────────────────────────────────────────
    const localLastPosWrite = cached?.lastPositionWrite ?? 0;
    vesselCache.set(mmsi, { lat, lon, timestamp, lastPositionWrite: localLastPosWrite });

    const classification = classifyVessel(parsed.shipType);

    // ── Queue vessel upsert ───────────────────────────────────────────────────────
    pendingVessels.set(mmsi, {
        mmsi, lat, lon, sog, cog, true_heading: trueHeading === 511 ? null : trueHeading,
        nav_status: navStatus, vessel_name: vesselName || undefined,
        type_category: classification.category, type_color: classification.color,
        is_active: true, last_update: new Date(timestamp).toISOString(),
    });

    // ── Queue position history ────────────────────────────────────────────────────
    const now = Date.now();
    const lastWrite = lastPositionWrite.get(mmsi) ?? 0;
    if (now - lastWrite >= POSITION_WRITE_INTERVAL_MS) {
        lastPositionWrite.set(mmsi, now);
        pendingPositions.push({
            mmsi, lat, lon, sog, cog, nav_status: navStatus, recorded_at: new Date().toISOString(),
        });
    }

    scheduleBatchFlush();
    await heartbeat();
}

const SUBSCRIPTION_PAYLOAD = JSON.stringify({
    APIKey: AISSTREAM_API_KEY,
    BoundingBoxes: [[[-90, -180], [90, 180]]],
    FilterMessageTypes: ["PositionReport"],
});

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
        console.log("[ais-relay] Connected. Subscribing to global AIS stream...");
        ws.send(SUBSCRIPTION_PAYLOAD);
    };

    ws.onmessage = async (event: MessageEvent) => {
        // FIX 4: Indestructible Blob/Buffer decoder
        let raw = "";
        if (typeof event.data === "string") raw = event.data;
        else if (event.data instanceof ArrayBuffer) raw = new TextDecoder().decode(event.data);
        else if (event.data instanceof Blob) raw = await event.data.text();
        else raw = String(event.data);

        const parsed = parseAndValidate(raw);
        if (parsed) await processMessage(parsed);
    };

    ws.onclose = (event: CloseEvent) => {
        consecutiveFailures++;
        console.log(`[ais-relay] Connection closed. Code=${event.code}. Scheduling reconnect...`);
        connect();
    };

    ws.onerror = (event: Event) => {
        console.error("[ais-relay] WebSocket error:", event);
    };
}

// ─── Edge Function entry point ────────────────────────────────────────────────
Deno.serve(async (_req: Request) => {
    connect();
    // FIX 5: 30-Second keep-alive so the cloud doesn't drop the connection
    await new Promise((resolve) => setTimeout(resolve, 30000));
    return new Response(
        JSON.stringify({ status: "ais-relay started", vessels_cached: vesselCache.size }),
        { headers: { "Content-Type": "application/json" } }
    );
});