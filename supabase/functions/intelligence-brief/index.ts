// supabase/functions/intelligence-brief/index.ts
// Generates a maritime intelligence brief for any vessel or port
// using Groq's llama-3.3-70b model.
// Called on-demand from the frontend — not scheduled.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY =
    Deno.env.get("MY_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
});

function formatSilenceHours(lastUpdate: string): string {
    const mins = (Date.now() - new Date(lastUpdate).getTime()) / 60000;
    if (mins < 60) return `${Math.round(mins)} minutes`;
    if (mins < 1440) return `${Math.round(mins / 60)} hours`;
    return `${Math.round(mins / 1440)} days`;
}

Deno.serve(async (req: Request) => {
    // CORS for local dev
    if (req.method === "OPTIONS") {
        return new Response(null, {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "authorization, content-type",
            },
        });
    }

    try {
        const body = await req.json();
        const { mmsi, port_id } = body;

        if (!mmsi && !port_id) {
            return new Response(
                JSON.stringify({ error: "Provide either mmsi or port_id" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        let systemPrompt = "";
        let userPrompt = "";

        if (mmsi) {
            // ── VESSEL BRIEF ───────────────────────────────────────────────────────

            // 1. Fetch vessel data
            const { data: vessel } = await supabase
                .from("vessels")
                .select("mmsi, lat, lon, sog, cog, vessel_type, name, flag, nav_status, updated_at")
                .eq("mmsi", mmsi)
                .single();

            if (!vessel) {
                return new Response(
                    JSON.stringify({ error: "Vessel not found" }),
                    { status: 404, headers: { "Content-Type": "application/json" } }
                );
            }

            // 2. Fetch active anomalies for this vessel
            const { data: anomalies } = await supabase
                .from("anomalies")
                .select("anomaly_type, severity, title, description, detected_at")
                .eq("mmsi", mmsi)
                .eq("resolved", false)
                .order("detected_at", { ascending: false })
                .limit(5);

            // 3. Fetch STS events involving this vessel
            const { data: stsEvents } = await supabase
                .from("sts_events")
                .select("vessel1_name, vessel2_name, risk_score, risk_factors, separation_nm, lat, lon, first_detected_at")
                .or(`mmsi1.eq.${mmsi},mmsi2.eq.${mmsi}`)
                .eq("is_active", true)
                .order("risk_score", { ascending: false })
                .limit(3);

            // 4. Fetch sanctions data — try MMSI first, fall back to vessel name
            let sanctions = null;

            const { data: sanctionsByMmsi } = await supabase
                .from("sanctioned_vessels")
                .select("vessel_name, sanctions_lists, flag_state, first_listed, last_updated")
                .eq("mmsi", mmsi)
                .maybeSingle();

            if (sanctionsByMmsi) {
                sanctions = sanctionsByMmsi;
            } else if (vessel.vessel_name) {
                // Fallback: match by vessel name (case-insensitive partial match)
                const { data: sanctionsByName } = await supabase
                    .from("sanctioned_vessels")
                    .select("vessel_name, sanctions_lists, flag_state, first_listed, last_updated")
                    .ilike("vessel_name", `%${vessel.vessel_name.trim()}%`)
                    .limit(1)
                    .maybeSingle();
                if (sanctionsByName) sanctions = sanctionsByName;
            }

            // If vessel is flagged sanctioned but no record found,
            // build a minimal record so Groq knows it IS sanctioned
            if (!sanctions && vessel.sanctions_match) {
                sanctions = {
                    vessel_name: vessel.vessel_name,
                    sanctions_lists: ["OFAC SDN / EU / UN (confirmed match — list detail pending sync)"],
                    flag_state: vessel.flag_state ?? "Unknown",
                    first_listed: null,
                    last_updated: null,
                };
            }

            // 5. Build context object for Groq
            const context = {
                vessel: {
                    mmsi: vessel.mmsi,
                    name: vessel.vessel_name ?? "Unknown",
                    type: vessel.type_category ?? "Unknown",
                    flag: vessel.flag_state ?? "Unknown",
                    lat: vessel.lat,
                    lon: vessel.lon,
                    speed_knots: vessel.sog,
                    course: vessel.cog,
                    destination: vessel.destination ?? "Not declared",
                    last_signal: formatSilenceHours(vessel.last_update),
                    dark_fleet_score: vessel.dark_fleet_score ?? 0,
                    is_sanctioned: vessel.sanctions_match ?? false,
                    is_anomaly: vessel.is_anomaly ?? false,
                },
                sanctions: sanctions ?? null,
                active_anomalies: anomalies ?? [],
                sts_events: stsEvents ?? [],
            };

            systemPrompt = `You are a senior maritime intelligence analyst at a major financial institution's sanctions compliance department. You write concise, factual, actionable intelligence briefs for compliance officers and port authorities. You have deep expertise in:
- International maritime sanctions (OFAC SDN, EU Consolidated List, UK OFSI, UN Security Council)
- AIS signal analysis and dark fleet detection methodology
- Ship-to-ship transfer sanctions evasion tactics
- Russian shadow fleet operations in the North Sea and Baltic
- Iranian oil smuggling via flag-of-convenience vessels

Your briefs are structured, professional, and direct. You cite specific facts from the data. You never speculate beyond the evidence. You assign a clear recommended action at the end.
Format your response in exactly this structure:
1. VESSEL SUMMARY (2 sentences max)
2. CURRENT POSITION & BEHAVIOR (2-3 sentences)
3. INTELLIGENCE FLAGS (bullet points, only what applies)
4. ASSESSMENT (2-3 sentences, confidence level)
5. RECOMMENDED ACTION (1 clear instruction)`;

            userPrompt = `Generate an intelligence brief for the following vessel based on this data:

${JSON.stringify(context, null, 2)}

Be direct and specific. Use the exact vessel name, MMSI, coordinates, and data points provided. If the vessel is sanctioned, name the specific sanctions list(s). If there are anomalies, describe what they mean operationally.`;

        } else {
            // ── PORT BRIEF ────────────────────────────────────────────────────────

            const { data: port } = await supabase
                .from("ports")
                .select("*, port_congestion(*)")
                .eq("id", port_id)
                .single();

            if (!port) {
                return new Response(
                    JSON.stringify({ error: "Port not found" }),
                    { status: 404, headers: { "Content-Type": "application/json" } }
                );
            }

            const congestion = Array.isArray(port.port_congestion)
                ? port.port_congestion[0]
                : port.port_congestion;

            // Count sanctioned vessels in port zone
            const { count: sanctionedCount } = await supabase
                .from("vessels")
                .select("*", { count: "exact", head: true })
                .eq("sanctions_match", true)
                .gte("lat", port.lat - 0.8)
                .lte("lat", port.lat + 0.8)
                .gte("lon", port.lon - 0.8)
                .lte("lon", port.lon + 0.8);

            const context = {
                port: {
                    name: port.name,
                    country: port.country,
                    un_locode: port.un_locode,
                    lat: port.lat,
                    lon: port.lon,
                },
                congestion: {
                    index: congestion?.congestion_index ?? 0,
                    status: congestion?.congestion_status ?? "UNKNOWN",
                    vessels_in_zone: congestion?.active_vessel_count ?? 0,
                    inbound_vessels: congestion?.inbound_vessel_count ?? 0,
                    forecast_24h: congestion?.predicted_congestion_24h ?? 0,
                    forecast_48h: congestion?.predicted_congestion_48h ?? 0,
                    forecast_72h: congestion?.predicted_congestion_72h ?? 0,
                },
                sanctioned_vessels_in_zone: sanctionedCount ?? 0,
            };

            systemPrompt = `You are a senior port operations intelligence analyst. You provide concise, actionable operational briefings for harbor masters and port authority officials. Format in exactly this structure:
1. PORT STATUS (1 sentence)
2. CONGESTION ANALYSIS (2 sentences, interpret the index number meaningfully)
3. SECURITY FLAGS (bullet points, only if relevant)
4. 72-HOUR OUTLOOK (1-2 sentences)
5. RECOMMENDED ACTION (1 clear instruction for port operations)`;

            userPrompt = `Generate an operational intelligence brief for ${port.name} port based on this data:

${JSON.stringify(context, null, 2)}`;
        }

        // 6. Call Groq API
        const groqResponse = await fetch(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${GROQ_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt },
                    ],
                    temperature: 0.3,   // Low temp — factual, not creative
                    max_tokens: 600,    // Enough for a complete brief, not a novel
                    stream: false,
                }),
            }
        );

        if (!groqResponse.ok) {
            const errText = await groqResponse.text();
            throw new Error(`Groq API error ${groqResponse.status}: ${errText}`);
        }

        const groqData = await groqResponse.json();
        const brief = groqData.choices?.[0]?.message?.content ?? "Brief generation failed.";
        const tokensUsed = groqData.usage?.total_tokens ?? 0;

        return new Response(
            JSON.stringify({
                status: "ok",
                brief,
                tokens_used: tokensUsed,
                model: "llama-3.3-70b-versatile",
            }),
            {
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            }
        );

    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[intelligence-brief]", msg);
        return new Response(
            JSON.stringify({ status: "error", message: msg }),
            {
                status: 500,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            }
        );
    }
});
