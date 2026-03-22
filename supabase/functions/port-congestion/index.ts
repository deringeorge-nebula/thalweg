// supabase/functions/port-congestion/index.ts
// Runs every 5 minutes via pg_cron HTTP trigger.
// Calculates congestion index for all 50 ports from live vessel positions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY =
    Deno.env.get("MY_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
});

// Berth space consumption weights per vessel category
const BERTH_WEIGHTS: Record<string, number> = {
    "Cargo": 1.5,
    "Cargo - General": 1.5,
    "Cargo - Hazmat A": 1.6,
    "Cargo - Hazmat B": 1.6,
    "Tanker": 2.0,
    "Tanker - Crude": 2.2,
    "Tanker - Chemical": 2.0,
    "Tanker - LNG": 2.5,
    "Tanker - LPG": 2.3,
    "Passenger": 1.8,
    "Passenger - Cruise": 2.5,
    "Bulk": 1.8,
    "High Speed Craft": 0.8,
    "Fishing": 0.5,
    "Unknown": 1.0,
};

// Haversine distance in nautical miles
function haversineNM(
    lat1: number, lon1: number,
    lat2: number, lon2: number
): number {
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

// Normalize raw weighted count to 0-100 congestion index
// Historical avg of 5 vessels = index 30 (NORMAL baseline)
function computeCongestionIndex(weightedCount: number, historicalAvg: number): number {
    if (historicalAvg <= 0) return Math.min(100, weightedCount * 6);
    const rawIndex = weightedCount / historicalAvg;
    return Math.min(100, Math.round(rawIndex * 33.33));
}

function getCongestionStatus(index: number): string {
    if (index <= 25) return "NORMAL";
    if (index <= 50) return "ELEVATED";
    if (index <= 75) return "CONGESTED";
    return "SEVERE";
}

Deno.serve(async (_req: Request) => {
    const startTime = Date.now();
    let portsProcessed = 0;

    try {
        // 1. Fetch all ports
        const { data: ports, error: portsErr } = await supabase
            .from("ports")
            .select("id, name, lat, lon, un_locode");

        if (portsErr || !ports) throw new Error(portsErr?.message ?? "No ports");

        // 2. Fetch all active vessels with position and type
        const { data: vessels, error: vesselErr } = await supabase
            .from("vessels")
            .select("mmsi, lat, lon, sog, cog, type_category, destination, last_update")
            .eq("is_active", true)
            .not("lat", "is", null)
            .not("lon", "is", null);

        if (vesselErr || !vessels) throw new Error(vesselErr?.message ?? "No vessels");

        const PORT_RADIUS_NM = 50; // 50nm radius defines port zone

        const congestionUpdates = [];

        for (const port of ports) {
            // 3. Find vessels currently INSIDE port zone (within 50nm)
            const portVessels = vessels.filter((v) => {
                const dist = haversineNM(port.lat, port.lon, v.lat, v.lon);
                return dist <= PORT_RADIUS_NM;
            });

            // 4. Count anchored/slow vessels (nav_status=1 or SOG < 1kn) — actually waiting
            const waitingVessels = portVessels.filter((v) => {
                const sog = v.sog ?? 0;
                return sog < 1.0; // Effectively stopped — at anchor or mooring
            });

            // 5. Compute weighted count using berth consumption weights
            const weightedCount = waitingVessels.reduce((sum, v) => {
                const weight = BERTH_WEIGHTS[v.type_category ?? "Unknown"] ?? 1.0;
                return sum + weight;
            }, 0);

            // 6. Fetch historical average for this port (30-day rolling)
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const { data: history } = await supabase
                .from("port_congestion")
                .select("weighted_vessel_count")
                .eq("port_id", port.id)
                .gte("calculated_at", thirtyDaysAgo)
                .order("calculated_at", { ascending: false })
                .limit(288); // 288 = 5-min intervals over 24h × 12 days

            const historicalAvg =
                history && history.length > 0
                    ? history.reduce((s, h) => s + (h.weighted_vessel_count ?? 0), 0) / history.length
                    : 5.0; // Bootstrap default

            // 7. Compute congestion index
            const congestionIndex = computeCongestionIndex(weightedCount, historicalAvg);
            const congestionStatus = getCongestionStatus(congestionIndex);

            // 8. Count inbound vessels (destination fuzzy matches port name, not yet in zone)
            const portNameLower = port.name.toLowerCase();
            const unLocode = port.un_locode?.toLowerCase() ?? "";

            const inboundVessels = vessels.filter((v) => {
                if (!v.destination) return false;
                const dest = v.destination.toLowerCase().trim();
                // Not already in port zone
                const dist = haversineNM(port.lat, port.lon, v.lat, v.lon);
                if (dist <= PORT_RADIUS_NM) return false;
                // Fuzzy match on destination
                return (
                    dest.includes(portNameLower.substring(0, 5)) ||
                    (unLocode.length >= 4 && dest.includes(unLocode.substring(2)))
                );
            });

            // 9. Predictive congestion (simplified — add inbound to current)
            const h24Count = inboundVessels.filter((v) => {
                if (!v.sog || v.sog < 0.5) return false;
                const dist = haversineNM(port.lat, port.lon, v.lat, v.lon);
                return dist / v.sog <= 24;
            }).length;

            const h48Count = inboundVessels.filter((v) => {
                if (!v.sog || v.sog < 0.5) return false;
                const dist = haversineNM(port.lat, port.lon, v.lat, v.lon);
                return dist / v.sog <= 48;
            }).length;

            const h72Count = inboundVessels.filter((v) => {
                if (!v.sog || v.sog < 0.5) return false;
                const dist = haversineNM(port.lat, port.lon, v.lat, v.lon);
                return dist / v.sog <= 72;
            }).length;

            const predicted24 = computeCongestionIndex(weightedCount + h24Count, historicalAvg);
            const predicted48 = computeCongestionIndex(weightedCount + h48Count, historicalAvg);
            const predicted72 = computeCongestionIndex(weightedCount + h72Count, historicalAvg);

            congestionUpdates.push({
                port_id: port.id,
                congestion_index: congestionIndex,
                congestion_status: congestionStatus,
                active_vessel_count: portVessels.length,
                inbound_vessel_count: inboundVessels.length,
                weighted_vessel_count: weightedCount,
                historical_avg: historicalAvg,
                predicted_congestion_24h: predicted24,
                predicted_congestion_48h: predicted48,
                predicted_congestion_72h: predicted72,
                calculated_at: new Date().toISOString(),
            });

            portsProcessed++;
        }

        // 10. Bulk upsert all port congestion records
        const { error: upsertErr } = await supabase
            .from("port_congestion")
            .upsert(congestionUpdates, { onConflict: "port_id" });

        if (upsertErr) throw new Error(upsertErr.message);

        // 11. Heartbeat
        await supabase.from("system_jobs").upsert({
            job_name: "port-congestion",
            last_run_at: new Date().toISOString(),
            last_success_at: new Date().toISOString(),
            status: "running",
            records_processed: portsProcessed,
            consecutive_failures: 0,
        }, { onConflict: "job_name" });

        const duration = Date.now() - startTime;

        return new Response(
            JSON.stringify({
                status: "ok",
                ports_processed: portsProcessed,
                duration_ms: duration,
            }),
            { headers: { "Content-Type": "application/json" } }
        );
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[port-congestion]", msg);

        await supabase.from("system_jobs").upsert({
            job_name: "port-congestion",
            last_run_at: new Date().toISOString(),
            status: "failing",
            last_error: msg,
        }, { onConflict: "job_name" });

        return new Response(JSON.stringify({ status: "error", message: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
});
