// supabase/functions/dark-fleet-scorer/index.ts
// Scores every vessel 0-100 across 9 dark fleet risk signals.
// Score >= 60 → dark fleet candidate → pulsing orange on globe.
// Runs every 30 minutes via pg_cron.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY =
    Deno.env.get("MY_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
});

// ─── The 9 Dark Fleet Signals ─────────────────────────────────────────────────
// Each signal contributes a weighted score.
// Total possible: 100 points.
//
// Signal 1:  Sanctions match (OFAC/EU/UN)      → +40 pts  (hardest signal)
// Signal 2:  AIS silence > 2× type threshold   → +15 pts
// Signal 3:  Operating near sanctioned EEZ      → +10 pts
// Signal 4:  Unknown vessel type (no ship type) → +8  pts
// Signal 5:  Speed anomaly reported             → +8  pts
// Signal 6:  No vessel name transmitted         → +6  pts
// Signal 7:  Speed = 0 in open ocean           → +5  pts  (drifting/waiting)
// Signal 8:  Nav status = moored in open sea   → +5  pts
// Signal 9:  Heading = 511 (unavailable)        → +3  pts
// ─────────────────────────────────────────────────────────────────────────────

const SANCTIONED_EEZ_ZONES = [
    { latMin: 22, latMax: 31, lonMin: 48, lonMax: 63 },  // Iran
    { latMin: 65, latMax: 90, lonMin: 30, lonMax: 180 },  // Russia Arctic
    { latMin: 54, latMax: 66, lonMin: 20, lonMax: 35 },  // Russia Baltic
    { latMin: 35, latMax: 43, lonMin: 124, lonMax: 132 },  // North Korea
    { latMin: 8, latMax: 16, lonMin: -73, lonMax: -59 },  // Venezuela
];

function isNearSanctionedEEZ(lat: number, lon: number): boolean {
    return SANCTIONED_EEZ_ZONES.some(
        (z) => lat >= z.latMin && lat <= z.latMax && lon >= z.lonMin && lon <= z.lonMax
    );
}

// Is this position in open ocean? (rough check: far from coast)
// Simplified: lat/lon not within 50nm of major coast
// We use a bounding box heuristic — good enough for scoring
function isOpenOcean(lat: number, lon: number): boolean {
    // If position is in the middle of any ocean basin, flag as open ocean
    const openOceanZones = [
        { latMin: -60, latMax: 60, lonMin: -180, lonMax: -30 }, // Atlantic
        { latMin: -60, latMax: 60, lonMin: 30, lonMax: 120 }, // Indian Ocean
        { latMin: -60, latMax: 60, lonMin: 120, lonMax: 180 }, // Pacific
    ];
    return openOceanZones.some(
        (z) => lat >= z.latMin && lat <= z.latMax && lon >= z.lonMin && lon <= z.lonMax
    );
}

const DARK_THRESHOLDS: Record<string, number> = {
    "Tanker": 60,
    "Tanker - Crude": 60,
    "Tanker - LNG": 60,
    "Tanker - LPG": 60,
    "Tanker - Chemical": 60,
    "Cargo": 90,
    "Passenger": 30,
    "Fishing": 120,
    "Unknown": 120,
};

const MAX_SPEEDS: Record<string, number> = {
    "Cargo": 22, "Tanker": 18, "Passenger": 28,
    "High Speed Craft": 45, "Fishing": 15, "Unknown": 30,
};

interface VesselRow {
    mmsi: string;
    vessel_name: string | null;
    lat: number;
    lon: number;
    sog: number | null;
    cog: number | null;
    true_heading: number | null;
    nav_status: number | null;
    type_category: string | null;
    last_update: string;
    sanctions_match: boolean;
    dark_fleet_score: number | null;
}

function scoreVessel(vessel: VesselRow, now: number): {
    score: number;
    signals: string[];
} {
    let score = 0;
    const signals: string[] = [];
    const category = vessel.type_category ?? "Unknown";
    const silenceMinutes = (now - new Date(vessel.last_update).getTime()) / 60000;
    const threshold = DARK_THRESHOLDS[category] ?? 120;

    // Signal 1: Sanctions match
    if (vessel.sanctions_match) {
        score += 40;
        signals.push("SANCTIONS_MATCH");
    }

    // Signal 2: AIS silence > 2× type threshold
    if (silenceMinutes > threshold * 2) {
        score += 15;
        signals.push(`AIS_DARK_${Math.round(silenceMinutes)}MIN`);
    }

    // Signal 3: Near sanctioned EEZ
    if (isNearSanctionedEEZ(vessel.lat, vessel.lon)) {
        score += 10;
        signals.push("NEAR_SANCTIONED_EEZ");
    }

    // Signal 4: Unknown vessel type
    if (!vessel.type_category || vessel.type_category === "Unknown") {
        score += 8;
        signals.push("UNKNOWN_TYPE");
    }

    // Signal 5: Speed anomaly
    const maxSpeed = MAX_SPEEDS[category] ?? 30;
    const sog = vessel.sog ?? 0;
    if (sog > maxSpeed * 1.3 && sog < 102) {
        score += 8;
        signals.push(`SPEED_ANOMALY_${sog.toFixed(1)}KN`);
    }

    // Signal 6: No vessel name
    if (!vessel.vessel_name || vessel.vessel_name.trim() === "") {
        score += 6;
        signals.push("NO_VESSEL_NAME");
    }

    // Signal 7: Speed = 0 in open ocean (not anchored — nav_status check)
    if (sog < 0.5 && vessel.nav_status !== 1 && vessel.nav_status !== 5 &&
        isOpenOcean(vessel.lat, vessel.lon)) {
        score += 5;
        signals.push("STATIONARY_OPEN_OCEAN");
    }

    // Signal 8: Moored/anchored nav status in open ocean
    if ((vessel.nav_status === 1 || vessel.nav_status === 5) &&
        isOpenOcean(vessel.lat, vessel.lon)) {
        score += 5;
        signals.push("ANCHORED_OPEN_OCEAN");
    }

    // Signal 9: True heading unavailable
    if (vessel.true_heading === 511 || vessel.true_heading === null) {
        score += 3;
        signals.push("HEADING_UNAVAILABLE");
    }

    return { score: Math.min(100, score), signals };
}

Deno.serve(async (_req: Request) => {
    const startTime = Date.now();
    let darkFleetCount = 0;
    let scored = 0;

    try {
        // Fetch all active vessels in batches
        let offset = 0;
        const batchSize = 3000;
        const darkFleetMmsis: string[] = [];
        const scoreUpdates: { mmsi: string; score: number }[] = [];
        const newDarkFleetAnomalies: Record<string, unknown>[] = [];

        while (true) {
            const { data: vessels, error } = await supabase
                .from("vessels")
                .select("mmsi, vessel_name, lat, lon, sog, cog, true_heading, nav_status, type_category, last_update, sanctions_match, dark_fleet_score")
                .not("lat", "is", null)
                .range(offset, offset + batchSize - 1);

            if (error) throw new Error(error.message);
            if (!vessels || vessels.length === 0) break;

            const now = Date.now();

            for (const vessel of vessels as VesselRow[]) {
                const { score, signals } = scoreVessel(vessel, now);
                scored++;

                // Only update if score changed meaningfully (>5 point delta)
                const prevScore = vessel.dark_fleet_score ?? 0;
                if (Math.abs(score - prevScore) > 5) {
                    scoreUpdates.push({ mmsi: vessel.mmsi, score });
                }

                if (score >= 60) {
                    darkFleetMmsis.push(vessel.mmsi);
                    darkFleetCount++;

                    if (prevScore < 60 && score >= 60) {
                        newDarkFleetAnomalies.push({
                            anomaly_type: "DARK_VESSEL",
                            severity: score >= 80 ? "CRITICAL" : score >= 70 ? "HIGH" : "MEDIUM",
                            mmsi: vessel.mmsi,
                            lat: vessel.lat,
                            lon: vessel.lon,
                            title: `Dark fleet candidate: ${vessel.vessel_name || vessel.mmsi}`,
                            description:
                                `Vessel scored ${score}/100 on dark fleet risk assessment. ` +
                                `Active signals: ${signals.join(", ")}.`,
                            data_payload: { dark_fleet_score: score, signals },
                            confidence: score / 100,
                            detected_at: new Date().toISOString(),
                        });
                    }
                }
            }

            offset += batchSize;
            if (vessels.length < batchSize) break;
        }

        // Single bulk insert for all new dark fleet anomalies
        if (newDarkFleetAnomalies.length > 0) {
            const { error: anomalyErr } = await supabase
                .from("anomalies")
                .insert(newDarkFleetAnomalies);
            if (anomalyErr) console.error("[dark-fleet-scorer] Anomaly insert error:", anomalyErr.message);
        }

        // Chunk the RPC calls so we don't crash the database with a 30,000-item JSON array
        if (scoreUpdates.length > 0) {
            const CHUNK_SIZE = 2000;
            for (let i = 0; i < scoreUpdates.length; i += CHUNK_SIZE) {
                const chunk = scoreUpdates.slice(i, i + CHUNK_SIZE);
                const rpcPayload = chunk.map(({ mmsi, score }) => ({ mmsi, score }));
                
                const { error: rpcErr } = await supabase.rpc("bulk_update_dark_fleet_scores", { updates: rpcPayload });
                if (rpcErr) console.error(`[dark-fleet-scorer] RPC error on chunk ${i}:`, rpcErr.message);
            }
            console.log(`[dark-fleet-scorer] Scores written via chunked RPC: ${scoreUpdates.length}`);
        }

        // Mark dark fleet vessels as anomalies
        if (darkFleetMmsis.length > 0) {
            // Process in chunks of 500 (Supabase .in() limit)
            for (let i = 0; i < darkFleetMmsis.length; i += 500) {
                const chunk = darkFleetMmsis.slice(i, i + 500);
                await supabase
                    .from("vessels")
                    .update({ is_anomaly: true })
                    .in("mmsi", chunk);
            }
        }

        // Heartbeat
        await supabase.from("system_jobs").upsert({
            job_name: "dark-fleet-scorer",
            last_run_at: new Date().toISOString(),
            last_success_at: new Date().toISOString(),
            status: "running",
            records_processed: scored,
            consecutive_failures: 0,
        }, { onConflict: "job_name" });

        const duration = Date.now() - startTime;

        return new Response(
            JSON.stringify({
                status: "ok",
                vessels_scored: scored,
                dark_fleet_candidates: darkFleetCount,
                score_updates_written: scoreUpdates.length,
                duration_ms: duration,
            }),
            { headers: { "Content-Type": "application/json" } }
        );

    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[dark-fleet-scorer]", msg);

        await supabase.from("system_jobs").upsert({
            job_name: "dark-fleet-scorer",
            last_run_at: new Date().toISOString(),
            status: "failing",
            last_error: msg,
        }, { onConflict: "job_name" });

        return new Response(
            JSON.stringify({ status: "error", message: msg }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
});
