// supabase/functions/sts-detection/index.ts
// Detects ship-to-ship transfers using spatial grid binning.
// Algorithm: O(n) grid assignment → O(k²) per cell (k ≈ 2-5 vessels avg)
// vs naive O(n²) which would be 800M comparisons on 28k vessels.
// Runs every 15 minutes via pg_cron.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY =
    Deno.env.get("MY_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
});

// ─── STS Detection Parameters ─────────────────────────────────────────────────
const STS_RADIUS_NM = 0.5;   // 0.5nm — vessels must be within 926m
const MAX_SOG_FOR_STS = 3.0;   // Both vessels must be moving < 3 knots
const GRID_CELL_DEG = 0.15;  // 0.15° ≈ 9nm — grid cell size for binning
const MIN_VESSEL_LEN = 50;    // Ignore vessels < 50m (too small for STS)
// ─────────────────────────────────────────────────────────────────────────────

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

// Approximate vessel length from AIS dimension fields
function vesselLengthM(
    dimA: number | null, dimB: number | null
): number {
    if (dimA && dimB) return dimA + dimB;
    if (dimA) return dimA * 1.8; // bow-only estimate
    return 0;
}

// Open ocean check — exclude port zones (within 50nm of a major port)
// Using bounding box shortcut rather than loading all 50 ports
function isLikelyInPort(lat: number, lon: number): boolean {
  // Exclude major ocean ports (large radius)
  const majorPorts = [
    { lat: 51.9,  lon: 4.5,   r: 1.2  },  // Rotterdam + Rhine delta
    { lat: 51.2,  lon: 4.4,   r: 0.8  },  // Antwerp
    { lat: 53.5,  lon: 10.0,  r: 0.8  },  // Hamburg
    { lat: 31.2,  lon: 121.5, r: 1.2  },  // Shanghai
    { lat: 1.3,   lon: 103.8, r: 0.8  },  // Singapore
    { lat: 22.3,  lon: 114.1, r: 0.7  },  // Hong Kong
    { lat: 24.9,  lon: 55.0,  r: 0.7  },  // Jebel Ali
    { lat: 33.7,  lon: -118.3,r: 0.8  },  // LA/Long Beach
    { lat: 40.7,  lon: -74.1, r: 0.7  },  // New York
    { lat: 35.1,  lon: 129.1, r: 0.7  },  // Busan
    { lat: 17.7,  lon: 83.2,  r: 0.5  },  // Visakhapatnam
    { lat: 51.9,  lon: 1.3,   r: 0.5  },  // Felixstowe
    { lat: 49.5,  lon: 0.1,   r: 0.5  },  // Le Havre
  ];
  if (majorPorts.some((p) =>
    Math.abs(lat - p.lat) < p.r && Math.abs(lon - p.lon) < p.r
  )) return true;

  // Exclude ALL inland waterway regions entirely
  // Netherlands/Belgium/Germany inland (IJsselmeer, Rhine, Meuse, Elbe)
  if (lat > 51.0 && lat < 54.0 && lon > 3.0 && lon < 10.5) return true;
  // UK coastal and estuaries
  if (lat > 50.0 && lat < 58.0 && lon > -5.0 && lon < 2.0) return true;
  // Baltic Sea coastal waters (too dense with port traffic)
  if (lat > 53.5 && lat < 66.0 && lon > 9.0 && lon < 30.0) return true;
  // Mediterranean coastal (high legitimate anchorage density)
  if (lat > 35.0 && lat < 46.0 && lon > -6.0 && lon < 36.0) return true;
  // US East Coast coastal zone
  if (lat > 25.0 && lat < 45.0 && lon > -82.0 && lon < -65.0) return true;
  // Persian Gulf (legitimate anchorage zone — too many false positives)
  if (lat > 23.0 && lat < 30.0 && lon > 48.0 && lon < 57.0) return true;
  // Southeast Asia coastal (extremely dense legitimate traffic)
  if (lat > -5.0 && lat < 15.0 && lon > 95.0 && lon < 120.0) return true;

  return false;
}

// Risk scoring: 0-100
function computeRiskScore(
    v1: VesselRow,
    v2: VesselRow,
    separationNm: number
): { score: number; factors: string[] } {
    let score = 20; // baseline — any two vessels meeting in open ocean
    const factors: string[] = [];

    if (v1.sanctions_match && v2.sanctions_match) {
        score += 80; factors.push("BOTH_SANCTIONED");
    } else if (v1.sanctions_match || v2.sanctions_match) {
        score += 50; factors.push("ONE_SANCTIONED");
    }

    const df1 = v1.dark_fleet_score ?? 0;
    const df2 = v2.dark_fleet_score ?? 0;
    if (df1 >= 60 || df2 >= 60) {
        score += 20; factors.push("DARK_FLEET_INVOLVED");
    }

    if (separationNm < 0.1) {
        score += 10; factors.push("EXTREMELY_CLOSE_PROXIMITY");
    }

    // Both slow — strong STS indicator
    const sog1 = v1.sog ?? 0;
    const sog2 = v2.sog ?? 0;
    if (sog1 < 1.0 && sog2 < 1.0) {
        score += 5; factors.push("BOTH_STATIONARY");
    }

    // Tanker + tanker or tanker + cargo = highest risk for oil transfer
    const types = [v1.type_category ?? "", v2.type_category ?? ""];
    const hasTanker = types.some((t) => t.toLowerCase().includes("tanker"));
    const hasCargo = types.some((t) => t.toLowerCase().includes("cargo"));
    if (hasTanker) {
        score += 5; factors.push("TANKER_INVOLVED");
    }
    if (hasTanker && hasCargo) {
        score += 5; factors.push("TANKER_CARGO_PAIR");
    }

    return { score: Math.min(100, score), factors };
}

interface VesselRow {
    mmsi: string;
    vessel_name: string | null;
    lat: number;
    lon: number;
    sog: number | null;
    type_category: string | null;
    dim_a: number | null;
    dim_b: number | null;
    sanctions_match: boolean;
    dark_fleet_score: number | null;
    last_update: string;
}

Deno.serve(async (_req: Request) => {
    const startTime = Date.now();
    let stsDetected = 0;
    let pairsChecked = 0;

    try {
        // 1. Fetch only vessels that could participate in an STS:
        //    - Slow-moving (SOG < 3 knots) or stationary
        //    - Active recently (last 2 hours)
        //    - Not clearly in a major port
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

        const { data: vessels, error } = await supabase
            .from("vessels")
            .select("mmsi, vessel_name, lat, lon, sog, type_category, dim_a, dim_b, sanctions_match, dark_fleet_score, last_update")
            .gte("last_update", twoHoursAgo)
            .lt("sog", MAX_SOG_FOR_STS)
            .not("lat", "is", null)
            .not("lon", "is", null)
            .limit(5000);

        if (error) throw new Error(error.message);
        if (!vessels || vessels.length === 0) {
            return new Response(
                JSON.stringify({ status: "ok", message: "No slow vessels found", sts_detected: 0 }),
                { headers: { "Content-Type": "application/json" } }
            );
        }

        console.log(`[sts-detection] Slow vessels to check: ${vessels.length}`);

        // 2. Filter out vessels in port zones
        const openOceanVessels = (vessels as VesselRow[]).filter((v) => {
            // Sanctioned or dark fleet vessels are ALWAYS checked
            // regardless of location — they are the priority target
            const isHighRisk =
                v.sanctions_match === true ||
                (v.dark_fleet_score ?? 0) >= 60;
            if (isHighRisk) return true;
            return !isLikelyInPort(v.lat, v.lon);
        });

        console.log(`[sts-detection] After port filter: ${openOceanVessels.length}`);

        // 3. Spatial grid binning — assign each vessel to a 0.15° cell
        const grid = new Map<string, VesselRow[]>();

        for (const vessel of openOceanVessels) {
            const cellLat = Math.floor(vessel.lat / GRID_CELL_DEG);
            const cellLon = Math.floor(vessel.lon / GRID_CELL_DEG);
            const cellKey = `${cellLat}:${cellLon}`;

            if (!grid.has(cellKey)) grid.set(cellKey, []);
            grid.get(cellKey)!.push(vessel);
        }

        console.log(`[sts-detection] Grid cells occupied: ${grid.size}`);

        // 4. For each cell (and adjacent cells), check all pairs
        const newStsEvents: Record<string, unknown>[] = [];
        const checkedPairs = new Set<string>();

        for (const [cellKey, cellVessels] of grid) {
            if (cellVessels.length < 2) continue; // Need at least 2 vessels

            // Compare all pairs within this cell
            for (let i = 0; i < cellVessels.length; i++) {
                for (let j = i + 1; j < cellVessels.length; j++) {
                    const v1 = cellVessels[i];
                    const v2 = cellVessels[j];

                    // Dedup — skip if already checked this pair
                    const pairKey = [v1.mmsi, v2.mmsi].sort().join("::");
                    if (checkedPairs.has(pairKey)) continue;
                    checkedPairs.add(pairKey);
                    pairsChecked++;

                    // Skip if same vessel (shouldn't happen but guard anyway)
                    if (v1.mmsi === v2.mmsi) continue;

                    // Skip if vessel confirmed too small for STS
                    // If dimensions unknown, allow through (benefit of doubt)
                    // If dimensions known and vessel < 50m, skip
                    const len1 = vesselLengthM(v1.dim_a, v1.dim_b);
                    const len2 = vesselLengthM(v2.dim_a, v2.dim_b);
                    if (len1 >= 10 && len1 < MIN_VESSEL_LEN) continue;
                    if (len2 >= 10 && len2 < MIN_VESSEL_LEN) continue;

                    // Calculate actual distance
                    const distNm = haversineNM(v1.lat, v1.lon, v2.lat, v2.lon);

                    if (distNm > STS_RADIUS_NM) continue;

                    // STS candidate found
                    const midLat = (v1.lat + v2.lat) / 2;
                    const midLon = (v1.lon + v2.lon) / 2;

                    const { score, factors } = computeRiskScore(v1, v2, distNm);

                    // Only record events with risk score > 20 (more than baseline noise)
                    if (score < 40) continue;

                    newStsEvents.push({
                        mmsi1: v1.mmsi,
                        mmsi2: v2.mmsi,
                        vessel1_name: v1.vessel_name,
                        vessel2_name: v2.vessel_name,
                        lat: midLat,
                        lon: midLon,
                        separation_nm: Math.round(distNm * 1000) / 1000,
                        vessel1_sog: v1.sog,
                        vessel2_sog: v2.sog,
                        risk_score: score,
                        risk_factors: factors,
                        first_detected_at: new Date().toISOString(),
                        last_confirmed_at: new Date().toISOString(),
                        is_active: true,
                    });

                    stsDetected++;
                }
            }
        }

        // 5. Upsert STS events
        // On conflict (same active pair), update last_confirmed_at and risk_score
        if (newStsEvents.length > 0) {
            const { error: upsertErr } = await supabase
                .from("sts_events")
                .insert(newStsEvents);

            if (upsertErr) {
                console.error("[sts-detection] Upsert error:", upsertErr.message);
                // Fallback: insert individually to avoid total loss
                for (const event of newStsEvents) {
                    await supabase.from("sts_events").insert(event).then(
                        ({ error: e }) => e && console.error("[sts-detection] Insert fallback error:", e.message)
                    );
                }
            }
        }

        // 6. Write CRITICAL anomaly for high-risk STS events
        const highRiskSts = newStsEvents.filter((e) => (e.risk_score as number) >= 70);
        if (highRiskSts.length > 0) {
            const anomalies = highRiskSts.map((e) => ({
                anomaly_type: "STS_TRANSFER",
                severity: (e.risk_score as number) >= 90 ? "CRITICAL" : "HIGH",
                mmsi: e.mmsi1 as string,
                mmsi2: e.mmsi2 as string,
                lat: e.lat as number,
                lon: e.lon as number,
                title: `STS Transfer: ${e.vessel1_name || e.mmsi1} ↔ ${e.vessel2_name || e.mmsi2}`,
                description:
                    `Suspected ship-to-ship transfer detected. Separation: ${e.separation_nm}nm. ` +
                    `Risk score: ${e.risk_score}/100. Factors: ${(e.risk_factors as string[]).join(", ")}.`,
                data_payload: e,
                confidence: (e.risk_score as number) / 100,
                detected_at: new Date().toISOString(),
            }));

            await supabase.from("anomalies").insert(anomalies);
        }

        // 7. Auto-resolve stale STS events (vessels moved apart)
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        await supabase
            .from("sts_events")
            .update({ is_active: false, resolved_at: new Date().toISOString() })
            .eq("is_active", true)
            .lt("last_confirmed_at", oneHourAgo);

        // 8. Heartbeat
        await supabase.from("system_jobs").upsert({
            job_name: "sts-detection",
            last_run_at: new Date().toISOString(),
            last_success_at: new Date().toISOString(),
            status: "running",
            records_processed: stsDetected,
            consecutive_failures: 0,
        }, { onConflict: "job_name" });

        const duration = Date.now() - startTime;
        console.log(
            `[sts-detection] Done. Pairs checked: ${pairsChecked}, ` +
            `STS events: ${stsDetected}, Duration: ${duration}ms`
        );

        return new Response(
            JSON.stringify({
                status: "ok",
                slow_vessels_found: vessels.length,
                after_port_filter: openOceanVessels.length,
                grid_cells: grid.size,
                pairs_checked: pairsChecked,
                sts_events_detected: stsDetected,
                high_risk_sts: highRiskSts.length,
                duration_ms: duration,
            }),
            { headers: { "Content-Type": "application/json" } }
        );

    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[sts-detection]", msg);

        await supabase.from("system_jobs").upsert({
            job_name: "sts-detection",
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
