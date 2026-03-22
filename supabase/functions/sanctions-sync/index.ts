// supabase/functions/sanctions-sync/index.ts
// Downloads the full OpenSanctions vessel list daily.
// Cross-references against vessels table by MMSI and IMO.
// Runs once per day via pg_cron — costs 1 API call per run.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY =
    Deno.env.get("MY_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENSANCTIONS_API_KEY = Deno.env.get("OPENSANCTIONS_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
});

interface SanctionsEntity {
    id: string;
    schema: string;
    properties: {
        mmsi?: string[];
        imoNumber?: string[];
        name?: string[];
        flag?: string[];
        callSign?: string[];
        type?: string[];
    };
    datasets: string[];
    first_seen: string;
    last_seen: string;
}

Deno.serve(async (_req: Request) => {
    const startTime = Date.now();

    try {
        console.log("[sanctions-sync] Starting daily sanctions sync...");

        // 1. Download full vessel entities from OpenSanctions
        // Using the entities API filtered to Vessel schema
        const response = await fetch(
            "https://api.opensanctions.org/search/default?q=&schema=Vessel&limit=500",
            {
                headers: {
                    "Authorization": `ApiKey ${OPENSANCTIONS_API_KEY}`,
                    "Accept": "application/json",
                },
            }
        );

        if (!response.ok) {
            throw new Error(`OpenSanctions API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const entities: SanctionsEntity[] = data.results ?? [];

        console.log(`[sanctions-sync] Retrieved ${entities.length} sanctioned vessel entities`);

        // 2. Build lookup maps: MMSI → sanctions info, IMO → sanctions info
        const mmsiMap = new Map<string, { datasets: string[]; entityId: string; vesselName: string }>();
        const imoMap = new Map<string, { datasets: string[]; entityId: string; vesselName: string }>();

        for (const entity of entities) {
            const props = entity.properties;
            const info = {
                datasets: entity.datasets,
                entityId: entity.id,
                vesselName: props.name?.[0] ?? "Unknown",
            };

            props.mmsi?.forEach((mmsi) => {
                const clean = mmsi.trim().replace(/\D/g, '');
                if (clean.length >= 5) mmsiMap.set(clean, info);
            });

            props.imoNumber?.forEach((imo) => {
                const clean = imo.trim().replace(/\D/g, '');
                if (clean.length >= 5) imoMap.set(clean, info);
            });
        }

        console.log(`[sanctions-sync] MMSI entries: ${mmsiMap.size}, IMO entries: ${imoMap.size}`);

        // 3. Fetch all vessels from our database in batches
        let offset = 0;
        const batchSize = 5000;
        let totalMatches = 0;
        let totalCleared = 0;

        while (true) {
            const { data: vessels, error } = await supabase
                .from("vessels")
                .select("mmsi, imo_number, sanctions_match")
                .range(offset, offset + batchSize - 1);

            if (error) throw new Error(error.message);
            if (!vessels || vessels.length === 0) break;

            const toFlag: string[] = [];  // MMSIs to mark as sanctions_match = true
            const toClear: string[] = [];  // MMSIs to mark as sanctions_match = false

            for (const vessel of vessels) {
                const mmsiHit = mmsiMap.has(vessel.mmsi);
                const imoHit = vessel.imo_number
                    ? imoMap.has(vessel.imo_number.replace(/\D/g, ''))
                    : false;

                const shouldFlag = mmsiHit || imoHit;

                if (shouldFlag && !vessel.sanctions_match) {
                    toFlag.push(vessel.mmsi);
                } else if (!shouldFlag && vessel.sanctions_match) {
                    toClear.push(vessel.mmsi);
                }
            }

            // Bulk update flagged vessels
            if (toFlag.length > 0) {
                const { error: flagErr } = await supabase
                    .from("vessels")
                    .update({ sanctions_match: true })
                    .in("mmsi", toFlag);
                if (flagErr) console.error("[sanctions-sync] Flag error:", flagErr.message);
                else {
                    totalMatches += toFlag.length;
                    console.log(`[sanctions-sync] Flagged ${toFlag.length} vessels in batch`);
                }
            }

            // Bulk update cleared vessels (previously flagged, now off the list)
            if (toClear.length > 0) {
                const { error: clearErr } = await supabase
                    .from("vessels")
                    .update({ sanctions_match: false })
                    .in("mmsi", toClear);
                if (clearErr) console.error("[sanctions-sync] Clear error:", clearErr.message);
                else totalCleared += toClear.length;
            }

            offset += batchSize;
            if (vessels.length < batchSize) break;
        }

        // 4. Upsert into sanctioned_vessels reference table
        const sanctionedRows = entities.map((e) => ({
            entity_id: e.id,
            vessel_name: e.properties.name?.[0] ?? null,
            mmsi: e.properties.mmsi?.[0] ?? null,
            imo_number: e.properties.imoNumber?.[0] ?? null,
            flag_state: e.properties.flag?.[0] ?? null,
            call_sign: e.properties.callSign?.[0] ?? null,
            sanctions_lists: e.datasets,
            first_listed: e.first_seen ?? null,
            last_updated: e.last_seen ?? null,
        }));

        if (sanctionedRows.length > 0) {
            const { error: upsertErr } = await supabase
                .from("sanctioned_vessels")
                .upsert(sanctionedRows, { onConflict: "entity_id" });
            if (upsertErr) console.error("[sanctions-sync] Upsert error:", upsertErr.message);
        }

        // 5. Heartbeat
        await supabase.from("system_jobs").upsert({
            job_name: "sanctions-sync",
            last_run_at: new Date().toISOString(),
            last_success_at: new Date().toISOString(),
            status: "running",
            records_processed: totalMatches,
            consecutive_failures: 0,
        }, { onConflict: "job_name" });

        const duration = Date.now() - startTime;

        return new Response(
            JSON.stringify({
                status: "ok",
                entities_retrieved: entities.length,
                vessels_flagged: totalMatches,
                vessels_cleared: totalCleared,
                duration_ms: duration,
            }),
            { headers: { "Content-Type": "application/json" } }
        );

    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[sanctions-sync]", msg);

        await supabase.from("system_jobs").upsert({
            job_name: "sanctions-sync",
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
