// supabase/functions/gfw-sync/index.ts
// Pulls yesterday's fishing events from Global Fishing Watch API.
// Detects fishing inside Marine Protected Areas.
// Runs daily at 08:00 UTC — GFW data is available with ~24h lag.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY =
    Deno.env.get("MY_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GFW_API_TOKEN = Deno.env.get("GFW_API_TOKEN")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
});

// Haversine distance in nautical miles
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

Deno.serve(async (_req: Request) => {
    const startTime = Date.now();

    try {
        // Date range: yesterday (GFW data has 24h lag)
        const yesterday = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const today = new Date();
        const startDate = yesterday.toISOString().split("T")[0];
        const endDate = today.toISOString().split("T")[0];

        console.log(`[gfw-sync] Fetching fishing events ${startDate} → ${endDate}`);

        // 1. Fetch fishing events from GFW API v3
        const gfwResponse = await fetch(
            `https://gateway.api.globalfishingwatch.org/v3/events?` +
            `datasets[0]=public-global-fishing-events:latest` +
            `&start-date=${startDate}` +
            `&end-date=${endDate}` +
            `&limit=1000` +
            `&offset=0`,
            {
                headers: {
                    "Authorization": `Bearer ${GFW_API_TOKEN}`,
                    "Content-Type": "application/json",
                },
            }
        );

        if (!gfwResponse.ok) {
            const errText = await gfwResponse.text();
            throw new Error(`GFW API error ${gfwResponse.status}: ${errText}`);
        }

        const gfwData = await gfwResponse.json();
        const events = gfwData.entries ?? [];

        console.log(`[gfw-sync] Retrieved ${events.length} fishing events`);

        if (events.length === 0) {
            return new Response(
                JSON.stringify({ status: "ok", events_processed: 0, mpa_violations: 0 }),
                { headers: { "Content-Type": "application/json" } }
            );
        }

        // 2. Load MPA list for violation detection
        const { data: mpas } = await supabase
            .from("marine_protected_areas")
            .select("id, name, lat, lon, area_km2, iucn_category");

        // Simple radius lookup: convert area_km2 to approximate radius in NM
        const mpaList = (mpas ?? []).map((m) => ({
            ...m,
            radiusNM: Math.sqrt(m.area_km2 / Math.PI) * 0.539957, // km to NM
        }));

        // 3. Process and insert events
        const rows = [];
        let mpaViolations = 0;

        for (const event of events) {
            const lat = event.position?.lat ?? event.regions?.eez?.[0] ?? null;
            const lon = event.position?.lon ?? null;

            if (lat === null || lon === null) continue;

            // MPA violation check — is this fishing event inside any MPA?
            let mpaViolation = false;
            let mpaId: string | null = null;
            let mpaName: string | null = null;

            for (const mpa of mpaList) {
                const dist = haversineNM(lat, lon, mpa.lat, mpa.lon);
                if (dist <= mpa.radiusNM) {
                    mpaViolation = true;
                    mpaId = mpa.id;
                    mpaName = mpa.name;
                    break;
                }
            }

            if (mpaViolation) mpaViolations++;

            rows.push({
                event_id: event.id,
                mmsi: event.vessel?.ssvid ?? null,
                vessel_name: event.vessel?.name ?? null,
                flag_state: event.vessel?.flag ?? null,
                lat: event.position?.lat ?? null,
                lon: event.position?.lon ?? null,
                fishing_hours: event.fishing?.totalDistanceKm
                    ? event.fishing.totalDistanceKm / 10
                    : null,
                event_start: event.start ?? null,
                event_end: event.end ?? null,
                is_mpa_violation: mpaViolation,
                mpa_id: mpaId,
                mpa_name: mpaName,
                eez_ids: event.regions?.eez ?? [],
                rfmo_ids: event.regions?.rfmo ?? [],
                confidence_score: event.fishing?.averageSpeedKnots
                    ? Math.min(1.0, event.fishing.averageSpeedKnots / 5)
                    : 0.7,
                source: "GFW",
                created_at: new Date().toISOString(),
            });
        }

        // 4. Bulk insert fishing events
        if (rows.length > 0) {
            const { error: insertErr } = await supabase
                .from("fishing_events")
                .upsert(rows, { onConflict: "event_id", ignoreDuplicates: true });

            if (insertErr) throw new Error(insertErr.message);
        }

        // 5. Flag vessels with MPA violations as anomalies in vessels table
        const violatingMmsis = rows
            .filter((r) => r.is_mpa_violation && r.mmsi)
            .map((r) => r.mmsi!);

        if (violatingMmsis.length > 0) {
            await supabase
                .from("vessels")
                .update({ is_anomaly: true })
                .in("mmsi", violatingMmsis);

            console.log(`[gfw-sync] Flagged ${violatingMmsis.length} vessels as anomalies (MPA violations)`);
        }

        // 6. Heartbeat
        await supabase.from("system_jobs").upsert({
            job_name: "gfw-sync",
            last_run_at: new Date().toISOString(),
            last_success_at: new Date().toISOString(),
            status: "running",
            records_processed: rows.length,
            consecutive_failures: 0,
        }, { onConflict: "job_name" });

        const duration = Date.now() - startTime;
        console.log(`[gfw-sync] Done. ${rows.length} events, ${mpaViolations} MPA violations, ${duration}ms`);

        return new Response(
            JSON.stringify({
                status: "ok",
                events_processed: rows.length,
                mpa_violations: mpaViolations,
                duration_ms: duration,
            }),
            { headers: { "Content-Type": "application/json" } }
        );

    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[gfw-sync]", msg);

        await supabase.from("system_jobs").upsert({
            job_name: "gfw-sync",
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
