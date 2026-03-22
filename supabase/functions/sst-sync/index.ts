// supabase/functions/sst-sync/index.ts
// Downloads global SST grid from NOAA ERDDAP (no API key required).
// Converts to a lightweight JSON tile and writes to Supabase Storage.
// Runs daily at 06:00 UTC — NOAA updates SST analysis daily.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY =
    Deno.env.get("MY_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
});

// NOAA ERDDAP — OISST v2.1 daily SST analysis
// Resolution: 0.25° × 0.25° global grid
// We subsample to 1° resolution for a ~64KB JSON output (acceptable for globe rendering)
const ERDDAP_URL =
    "https://coastwatch.pfeg.noaa.gov/erddap/griddap/ncdcOisst21Agg_LonPM180.json" +
    "?sst[(last)][(0.0)][(-90):4:(90)][(-180):4:(180)]";
// [time=last][depth=0m][lat: -90 to 90, stride 4][lon: -180 to 180, stride 4]
// stride 4 on 0.25° grid = 1° effective resolution = 181×361 = ~65k points

interface ERDDAPResponse {
    table: {
        columnNames: string[];
        columnTypes: string[];
        rows: (number | string | null)[][];
    };
}

interface SSTPoint {
    lat: number;
    lon: number;
    sst: number;
}

interface SSTTile {
    generated_at: string;
    data_date: string;
    min_sst: number;
    max_sst: number;
    point_count: number;
    points: SSTPoint[];
}

Deno.serve(async (_req: Request) => {
    const startTime = Date.now();

    try {
        console.log("[sst-sync] Fetching SST grid from NOAA ERDDAP...");

        // 1. Fetch SST data from NOAA
        const response = await fetch(ERDDAP_URL, {
            headers: { "Accept": "application/json" },
            signal: AbortSignal.timeout(25000), // 25s timeout — ERDDAP can be slow
        });

        if (!response.ok) {
            throw new Error(`ERDDAP error: ${response.status} ${response.statusText}`);
        }

        const raw: ERDDAPResponse = await response.json();
        const rows = raw.table.rows;
        const cols = raw.table.columnNames;

        // Column indices
        const timeIdx = cols.indexOf("time");
        const latIdx = cols.indexOf("latitude");
        const lonIdx = cols.indexOf("longitude");
        const sstIdx = cols.indexOf("sst");

        console.log(`[sst-sync] Raw rows: ${rows.length}`);

        // 2. Filter out null SST values (land pixels, sea ice)
        const points: SSTPoint[] = [];
        let minSST = 999;
        let maxSST = -999;
        let dataDate = "";

        for (const row of rows) {
            const sstVal = row[sstIdx];
            if (sstVal === null || typeof sstVal !== "number") continue;

            const lat = row[latIdx] as number;
            const lon = row[lonIdx] as number;
            const sst = Math.round(sstVal * 10) / 10; // 1 decimal place — saves ~30% JSON size

            if (!dataDate && row[timeIdx]) {
                dataDate = String(row[timeIdx]).split("T")[0];
            }

            if (sst < minSST) minSST = sst;
            if (sst > maxSST) maxSST = sst;

            points.push({ lat, lon, sst });
        }

        console.log(`[sst-sync] Valid SST points: ${points.length}, range: ${minSST}°C → ${maxSST}°C`);

        // 3. Build tile JSON
        const tile: SSTTile = {
            generated_at: new Date().toISOString(),
            data_date: dataDate,
            min_sst: minSST,
            max_sst: maxSST,
            point_count: points.length,
            points,
        };

        const tileJson = JSON.stringify(tile);
        const tileBytes = new TextEncoder().encode(tileJson);

        console.log(`[sst-sync] Tile size: ${(tileBytes.byteLength / 1024).toFixed(1)}KB`);

        // 4. Upload to Supabase Storage
        const { error: uploadErr } = await supabase.storage
            .from("ocean-data")
            .upload("sst/global-latest.json", tileBytes, {
                contentType: "application/json",
                upsert: true, // overwrite previous day's file
                cacheControl: "3600", // CDN cache 1 hour
            });

        if (uploadErr) throw new Error(`Storage upload error: ${uploadErr.message}`);

        console.log("[sst-sync] Uploaded sst/global-latest.json to Supabase Storage");

        // 5. Heartbeat
        await supabase.from("system_jobs").upsert({
            job_name: "sst-sync",
            last_run_at: new Date().toISOString(),
            last_success_at: new Date().toISOString(),
            status: "running",
            records_processed: points.length,
            consecutive_failures: 0,
        }, { onConflict: "job_name" });

        const duration = Date.now() - startTime;

        return new Response(
            JSON.stringify({
                status: "ok",
                data_date: dataDate,
                points: points.length,
                min_sst: minSST,
                max_sst: maxSST,
                tile_size_kb: Math.round(tileBytes.byteLength / 1024),
                duration_ms: duration,
            }),
            { headers: { "Content-Type": "application/json" } }
        );

    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[sst-sync]", msg);

        await supabase.from("system_jobs").upsert({
            job_name: "sst-sync",
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
