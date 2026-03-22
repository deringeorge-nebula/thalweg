// supabase/functions/anomaly-detection/index.ts
// Runs every 10 minutes via pg_cron.
// Detects: dark vessel silence, position spoofing, speed anomalies.
// Writes to anomalies table. Flags vessels with is_anomaly = true.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY =
    Deno.env.get("MY_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
});

// ─── Dark vessel silence thresholds (minutes) ────────────────────────────────
const DARK_THRESHOLDS: Record<string, number> = {
    "Tanker": 60,
    "Tanker - Crude": 60,
    "Tanker - LNG": 60,
    "Tanker - LPG": 60,
    "Tanker - Chemical": 60,
    "Cargo": 90,
    "Cargo - General": 90,
    "Passenger": 30,
    "Passenger - Cruise": 30,
    "Fishing": 120,
    "Unknown": 120,
};

// ─── Max physical speeds per category (knots) ────────────────────────────────
const MAX_SPEEDS: Record<string, number> = {
    "Cargo": 22,
    "Tanker": 18,
    "Passenger": 28,
    "Passenger - Cruise": 22,
    "High Speed Craft": 45,
    "Fishing": 15,
    "Unknown": 30,
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

// Sanctioned state EEZ approximate bounding boxes
// Russia, Iran, North Korea, Venezuela — vessels going dark near these are high risk
const SANCTIONED_EEZ_ZONES = [
    { name: "Iran EEZ", latMin: 22, latMax: 31, lonMin: 48, lonMax: 63 },
    { name: "Russia Arctic", latMin: 65, latMax: 90, lonMin: 30, lonMax: 180 },
    { name: "Russia Baltic", latMin: 54, latMax: 66, lonMin: 20, lonMax: 35 },
    { name: "North Korea EEZ", latMin: 35, latMax: 43, lonMin: 124, lonMax: 132 },
    { name: "Venezuela EEZ", latMin: 8, latMax: 16, lonMin: -73, lonMax: -59 },
];

function isNearSanctionedEEZ(lat: number, lon: number): string | null {
    for (const zone of SANCTIONED_EEZ_ZONES) {
        if (
            lat >= zone.latMin && lat <= zone.latMax &&
            lon >= zone.lonMin && lon <= zone.lonMax
        ) {
            return zone.name;
        }
    }
    return null;
}

Deno.serve(async (_req: Request) => {
    const startTime = Date.now();
    let darkVesselCount = 0;
    let spoofingCount = 0;
    let speedAnomalyCount = 0;
    const newAnomalies: Record<string, unknown>[] = [];
    const mmsiToFlag = new Set<string>();

    try {
        // ── Fetch all active vessels ──────────────────────────────────────────────
        // Query 1: Only vessels silent for 30+ minutes (dark vessel candidates)
        const silenceCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data: darkCandidates, error: darkErr } = await supabase
            .from("vessels")
            .select("mmsi, vessel_name, lat, lon, sog, cog, type_category, last_update, sanctions_match, is_anomaly")
            .eq("is_active", true)
            .not("lat", "is", null)
            .not("lon", "is", null)
            .lt("last_update", silenceCutoff)
            .limit(2000);

        if (darkErr) throw new Error(darkErr.message);

        // Query 2: Only vessels with implausibly high speeds
        const { data: speedCandidates, error: speedErr } = await supabase
            .from("vessels")
            .select("mmsi, vessel_name, lat, lon, sog, cog, type_category, last_update, sanctions_match, is_anomaly")
            .eq("is_active", true)
            .not("lat", "is", null)
            .not("lon", "is", null)
            .gt("sog", 20)
            .lt("sog", 102)
            .limit(500);

        if (speedErr) throw new Error(speedErr.message);

        // Combined vessel list for auto-resolve step
        const vessels = [...(darkCandidates ?? []), ...(speedCandidates ?? [])];

        console.log(`[anomaly-detection] Dark candidates: ${darkCandidates?.length ?? 0}, Speed candidates: ${speedCandidates?.length ?? 0}`);

        const now = Date.now();

        for (const vessel of (darkCandidates ?? [])) {
            const lastUpdate = new Date(vessel.last_update).getTime();
            const silenceMinutes = (now - lastUpdate) / 60000;
            const category = vessel.type_category ?? "Unknown";

            // ── ALGORITHM 1: Dark Vessel Detection ─────────────────────────────────
            const threshold = DARK_THRESHOLDS[category] ?? 120;

            if (silenceMinutes > threshold && silenceMinutes < 7 * 24 * 60) {
                // Only flag vessels silent between threshold and 7 days
                // (>7 days = probably decommissioned, not dark fleet)
                const sanctionedZone = isNearSanctionedEEZ(vessel.lat, vessel.lon);

                const severity =
                    vessel.sanctions_match ? "CRITICAL"
                        : sanctionedZone ? "HIGH"
                            : silenceMinutes > threshold * 2 ? "HIGH"
                                : "MEDIUM";

                const description =
                    `${vessel.vessel_name || vessel.mmsi} has been silent for ` +
                    `${Math.round(silenceMinutes)} minutes (threshold: ${threshold} min).` +
                    (sanctionedZone ? ` Last known position near ${sanctionedZone}.` : "");

                newAnomalies.push({
                    anomaly_type: "DARK_VESSEL",
                    severity,
                    mmsi: vessel.mmsi,
                    lat: vessel.lat,
                    lon: vessel.lon,
                    title: `Dark vessel: ${vessel.vessel_name || vessel.mmsi}`,
                    description,
                    data_payload: {
                        silence_minutes: Math.round(silenceMinutes),
                        threshold_minutes: threshold,
                        near_sanctioned_eez: sanctionedZone,
                        sanctions_match: vessel.sanctions_match,
                        last_known_sog: vessel.sog,
                        last_known_cog: vessel.cog,
                    },
                    confidence: sanctionedZone ? 0.85 : 0.70,
                    detected_at: new Date().toISOString(),
                });

                mmsiToFlag.add(vessel.mmsi);
                darkVesselCount++;
            }
        }

        for (const vessel of (speedCandidates ?? [])) {
            const category = vessel.type_category ?? "Unknown";

            // ── ALGORITHM 2: Speed Anomaly Detection ───────────────────────────────
            // Vessels reporting implausible speeds for their type
            const maxSpeed = MAX_SPEEDS[category] ?? 30;
            const sog = vessel.sog ?? 0;

            if (sog > maxSpeed * 1.3 && sog < 102) {
                // sog > 102 is the AIS "data unavailable" sentinel — exclude it
                const severity = sog > maxSpeed * 2 ? "HIGH" : "MEDIUM";

                newAnomalies.push({
                    anomaly_type: "SPEED_ANOMALY",
                    severity,
                    mmsi: vessel.mmsi,
                    lat: vessel.lat,
                    lon: vessel.lon,
                    title: `Speed anomaly: ${vessel.vessel_name || vessel.mmsi}`,
                    description:
                        `${vessel.vessel_name || vessel.mmsi} reporting ${sog.toFixed(1)} knots. ` +
                        `Maximum physical speed for ${category}: ${maxSpeed} knots. ` +
                        `Possible AIS data manipulation or sensor error.`,
                    data_payload: {
                        reported_sog: sog,
                        max_physical_speed: maxSpeed,
                        category,
                        speed_ratio: sog / maxSpeed,
                    },
                    confidence: 0.75,
                    detected_at: new Date().toISOString(),
                });

                mmsiToFlag.add(vessel.mmsi);
                spoofingCount++;
            }
        }

        console.log(`[anomaly-detection] Dark: ${darkVesselCount}, Speed: ${spoofingCount}`);

        // ── Deduplicate: only insert anomalies not already active ────────────────
        // Check for existing unresolved anomalies for the same MMSI + type
        // to avoid flooding the table on every 10-min run
        const cutoff = new Date(now - 60 * 60 * 1000).toISOString(); // 1 hour window

        // Single bulk query — fetch all active anomaly keys in the last hour
        const candidateMmsis = [...new Set(newAnomalies.map((a) => a.mmsi as string))];

        const { data: existingAnomalies } = await supabase
            .from("anomalies")
            .select("mmsi, anomaly_type")
            .in("mmsi", candidateMmsis)
            .eq("resolved", false)
            .gte("detected_at", cutoff);

        // Build in-memory dedup set — zero additional DB queries
        const existingKeys = new Set(
            (existingAnomalies ?? []).map((e: any) => `${e.mmsi}::${e.anomaly_type}`)
        );

        // Filter to only truly new anomalies
        const toInsert = newAnomalies.filter(
            (a) => !existingKeys.has(`${a.mmsi as string}::${a.anomaly_type as string}`)
        );

        // Single bulk insert for all new anomalies
        if (toInsert.length > 0) {
            const { error: insertErr } = await supabase
                .from("anomalies")
                .insert(toInsert);
            if (insertErr) console.error("[anomaly-detection] Insert error:", insertErr.message);
        }

        // ── Flag vessels as anomalous ─────────────────────────────────────────────
        if (mmsiToFlag.size > 0) {
            await supabase
                .from("vessels")
                .update({ is_anomaly: true })
                .in("mmsi", Array.from(mmsiToFlag));
        }

        // ── Auto-resolve stale anomalies (vessel came back online) ───────────────
        // If a vessel has a recent update AND has an open anomaly, resolve it
        const recentVessels = vessels
            .filter((v) => (now - new Date(v.last_update).getTime()) < 30 * 60 * 1000)
            .map((v) => v.mmsi);

        if (recentVessels.length > 0) {
            await supabase
                .from("anomalies")
                .update({ resolved: true, resolved_at: new Date().toISOString() })
                .in("mmsi", recentVessels)
                .eq("anomaly_type", "DARK_VESSEL")
                .eq("resolved", false);

            // Clear anomaly flag on vessels that are back online
            await supabase
                .from("vessels")
                .update({ is_anomaly: false })
                .in("mmsi", recentVessels)
                .eq("is_anomaly", true)
                .eq("sanctions_match", false); // Never clear anomaly on sanctioned vessels
        }

        // ── Heartbeat ────────────────────────────────────────────────────────────
        await supabase.from("system_jobs").upsert({
            job_name: "anomaly-detection",
            last_run_at: new Date().toISOString(),
            last_success_at: new Date().toISOString(),
            status: "running",
            records_processed: newAnomalies.length,
            consecutive_failures: 0,
        }, { onConflict: "job_name" });

        const duration = Date.now() - startTime;
        console.log(`[anomaly-detection] Done in ${duration}ms. New anomalies: ${newAnomalies.length}`);

        return new Response(
            JSON.stringify({
                status: "ok",
                dark_candidates_scanned: darkCandidates?.length ?? 0,
                speed_candidates_scanned: speedCandidates?.length ?? 0,
                dark_vessel_alerts: darkVesselCount,
                speed_anomaly_alerts: spoofingCount,
                new_anomalies_written: newAnomalies.length,
                duration_ms: duration,
            }),
            { headers: { "Content-Type": "application/json" } }
        );

    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[anomaly-detection]", msg);

        await supabase.from("system_jobs").upsert({
            job_name: "anomaly-detection",
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
