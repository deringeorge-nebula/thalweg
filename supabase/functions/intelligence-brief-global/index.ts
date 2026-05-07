import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// â”€â”€â”€ Interfaces â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface AlertItem {
  id: string;
  severity: "CRITICAL" | "HIGH" | "MODERATE" | "LOW";
  category:
    | "SANCTIONS"
    | "DARK_FLEET"
    | "STS_TRANSFER"
    | "PORT_CONGESTION"
    | "PIRACY"
    | "SPILL_RISK"
    | "ANOMALY";
  title: string;
  summary: string;
  mmsi?: string;
  location?: string;
  timestamp: string;
}

interface RegionalStatus {
  region:
    | "NORTH_ATLANTIC"
    | "MEDITERRANEAN"
    | "RED_SEA_GULF"
    | "INDIAN_OCEAN"
    | "SOUTHEAST_ASIA"
    | "PACIFIC";
  summary: string;
  dominant_risk: string;
  vessel_count: number;
}

interface TrendSignal {
  signal: string;
  direction: "INCREASING" | "DECREASING" | "STABLE";
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

interface GlobalIntelligenceBrief {
  id?: string; date?: string;
  generated_at: string;
  classification: string;
  executive_summary: string;
  threat_level: "LOW" | "MODERATE" | "ELEVATED" | "HIGH";
  top_alerts: AlertItem[];
  regional_status: RegionalStatus[];
  trend_signals: TrendSignal[];
  data_quality_note: string;
  generated_by: string;
  sources: string[];
  anomaly_count: number;
  critical_anomaly_count: number;
  congested_port_count: number;
  new_piracy_incidents: number;
}

// â”€â”€â”€ Vessel Stats RPC Result â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface VesselStats {
  total: number;
  dark_fleet_count: number;
  sanctioned_count: number;
  anchored_count: number;
}

// â”€â”€â”€ Raw DB Row Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface AnomalyRow {
  anomaly_type: string;
  severity: string;
  mmsi: string;
  title: string;
  lat: number;
  lon: number;
  description: string;
  detected_at: string;
}

interface StsEventRow {
  mmsi1: string;
  mmsi2: string;
  vessel1_name: string;
  vessel2_name: string;
  lat: number;
  lon: number;
  risk_score: number;
  first_detected_at: string;
}

interface PortCongestionRow {
  port_id: string;
  congestion_index: number;
  vessel_count: number;
  congestion_status: string;
  calculated_at: string;
}

interface SanctionedVesselRow {
  mmsi: string;
  vessel_name: string;
  type_category: string;
  flag_state: string;
  lat: number;
  lon: number;
  last_update: string;
}

interface DarkFleetRow {
  mmsi: string;
  vessel_name: string;
  type_category: string;
  flag_state: string;
  dark_fleet_score: number;
  lat: number;
  lon: number;
  last_update: string;
}

// â”€â”€â”€ Intelligence Context (sent to Groq) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface IntelligenceContext {
  report_date: string;
  data_freshness: string;
  vessel_stats: VesselStats | null;
  anomalies: AnomalyRow[];
  sts_events: StsEventRow[];
  port_congestion: PortCongestionRow[];
  sanctioned_active: SanctionedVesselRow[];
  dark_fleet_top: DarkFleetRow[];
}

// â”€â”€â”€ CORS Headers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

// ── MID → Flag State lookup ──────────────────────────────────────────────────
const MID_TO_FLAG: Record<number, string> = {
  201: "Albania", 202: "Andorra", 203: "Austria", 204: "Azores", 205: "Belgium",
  206: "Belarus", 207: "Bulgaria", 208: "Vatican", 209: "Cyprus", 210: "Cyprus",
  211: "Germany", 212: "Cyprus", 213: "Georgia", 214: "Moldova", 215: "Malta",
  216: "Armenia", 218: "Germany", 219: "Denmark", 220: "Denmark", 224: "Spain",
  225: "Spain", 226: "France", 227: "France", 228: "France", 229: "Malta",
  230: "Finland", 231: "Faroe Islands", 232: "United Kingdom", 233: "United Kingdom",
  234: "United Kingdom", 235: "United Kingdom", 236: "Gibraltar", 237: "Greece",
  238: "Croatia", 239: "Greece", 240: "Greece", 241: "Greece", 242: "Morocco",
  243: "Hungary", 244: "Netherlands", 245: "Netherlands", 246: "Netherlands",
  247: "Italy", 248: "Malta", 249: "Malta", 250: "Ireland", 251: "Iceland",
  252: "Liechtenstein", 253: "Luxembourg", 254: "Monaco", 255: "Madeira",
  256: "Malta", 257: "Norway", 258: "Norway", 259: "Norway", 261: "Poland",
  262: "Montenegro", 263: "Portugal", 264: "Romania", 265: "Sweden", 266: "Sweden",
  267: "Slovakia", 268: "San Marino", 269: "Switzerland", 270: "Czech Republic",
  271: "Turkey", 272: "Ukraine", 273: "Russia", 274: "North Macedonia",
  275: "Latvia", 276: "Estonia", 277: "Lithuania", 278: "Slovenia", 279: "Serbia",
  301: "Anguilla", 303: "United States", 304: "Antigua and Barbuda",
  305: "Antigua and Barbuda", 306: "Netherlands Antilles", 307: "Aruba",
  308: "Bahamas", 309: "Bahamas", 310: "Bermuda", 311: "Bahamas",
  312: "Belize", 314: "Barbados", 316: "Canada", 319: "Cayman Islands",
  321: "Costa Rica", 323: "Cuba", 325: "Dominica", 327: "Dominican Republic",
  329: "Guadeloupe", 330: "Grenada", 331: "Greenland", 332: "Guatemala",
  334: "Honduras", 336: "Haiti", 338: "United States", 339: "Jamaica",
  341: "Saint Kitts and Nevis", 343: "Saint Lucia", 345: "Mexico",
  347: "Martinique", 348: "Montserrat", 350: "Nicaragua", 351: "Panama",
  352: "Panama", 353: "Panama", 354: "Panama", 355: "Panama", 356: "Panama",
  357: "Panama", 358: "Puerto Rico", 359: "El Salvador",
  362: "Trinidad and Tobago", 366: "United States", 367: "United States",
  368: "United States", 369: "United States", 370: "Panama", 371: "Panama",
  372: "Panama", 373: "Panama", 374: "Panama",
  375: "Saint Vincent and the Grenadines", 376: "Saint Vincent and the Grenadines",
  377: "Saint Vincent and the Grenadines", 378: "British Virgin Islands",
  379: "United States Virgin Islands",
  401: "Afghanistan", 403: "Saudi Arabia", 405: "Bangladesh", 408: "Bahrain",
  410: "Bhutan", 412: "China", 413: "China", 414: "China", 416: "Taiwan",
  422: "Iran", 423: "Azerbaijan", 425: "Iraq", 428: "Israel", 431: "Japan",
  432: "Japan", 434: "Turkmenistan", 436: "Kazakhstan", 437: "Uzbekistan",
  438: "Jordan", 440: "South Korea", 441: "South Korea", 443: "Palestine",
  445: "North Korea", 447: "Kuwait", 450: "Lebanon", 451: "Kyrgyzstan",
  453: "Macao", 455: "Maldives", 457: "Mongolia", 459: "Nepal",
  461: "China", 462: "China", 463: "China", 466: "Oman", 468: "Pakistan",
  470: "Qatar", 471: "Qatar", 472: "Tajikistan", 473: "Sri Lanka",
  477: "Hong Kong", 478: "China", 480: "Syria", 481: "Macao", 485: "Thailand",
  487: "United Arab Emirates", 489: "Yemen", 492: "Vietnam",
  501: "South Africa", 503: "Angola", 506: "Algeria", 508: "Benin",
  511: "Cameroon", 514: "Central African Republic", 515: "Cape Verde",
  516: "Comoros", 518: "Congo", 520: "DR Congo", 521: "Ivory Coast",
  523: "Djibouti", 525: "Egypt", 529: "Eritrea", 531: "Ethiopia",
  533: "Gabon", 536: "Gambia", 538: "Marshall Islands", 541: "Ghana",
  544: "Guinea", 546: "Guinea-Bissau", 548: "Equatorial Guinea", 550: "Kenya",
  553: "Liberia", 555: "Lesotho", 559: "Libya", 561: "Mauritius",
  563: "Singapore", 564: "Singapore", 565: "Singapore", 566: "Singapore",
  567: "Singapore", 572: "Madagascar", 574: "Mali", 576: "Mauritania",
  578: "Mozambique", 582: "Namibia", 585: "Niger", 587: "Nigeria",
  591: "Papua New Guinea", 594: "Rwanda", 597: "Senegal", 602: "Seychelles",
  604: "Sierra Leone", 605: "Somalia", 606: "Sao Tome and Principe",
  609: "Sudan", 610: "South Sudan", 611: "Tanzania", 612: "Togo",
  613: "Comoros", 615: "Togo", 616: "Tunisia", 617: "Madagascar",
  619: "Uganda", 621: "Zambia", 622: "Zimbabwe", 636: "Liberia",
  657: "Liberia", 667: "Sierra Leone", 669: "Somalia",
  701: "Argentina", 710: "Brazil", 720: "Bolivia", 725: "Chile",
  730: "Colombia", 735: "Ecuador", 740: "Falkland Islands", 745: "Guyana",
  750: "Paraguay", 755: "Peru", 760: "Suriname", 765: "Uruguay",
  770: "Venezuela", 775: "Venezuela",
  800: "India", 419: "India",
};

function mmsiToFlagState(mmsi: string | null | undefined): string | null {
  if (!mmsi || mmsi.length < 3) return null;
  const mid = parseInt(mmsi.slice(0, 3), 10);
  return MID_TO_FLAG[mid] ?? null;
}

// â”€â”€â”€ Zero-data fallback for all 6 regions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SIX_REGIONS_WITH_ZERO_DATA: RegionalStatus[] = [
  {
    region: "NORTH_ATLANTIC",
    summary: "No data available.",
    dominant_risk: "UNKNOWN",
    vessel_count: 0,
  },
  {
    region: "MEDITERRANEAN",
    summary: "No data available.",
    dominant_risk: "UNKNOWN",
    vessel_count: 0,
  },
  {
    region: "RED_SEA_GULF",
    summary: "No data available.",
    dominant_risk: "UNKNOWN",
    vessel_count: 0,
  },
  {
    region: "INDIAN_OCEAN",
    summary: "No data available.",
    dominant_risk: "UNKNOWN",
    vessel_count: 0,
  },
  {
    region: "SOUTHEAST_ASIA",
    summary: "No data available.",
    dominant_risk: "UNKNOWN",
    vessel_count: 0,
  },
  {
    region: "PACIFIC",
    summary: "No data available.",
    dominant_risk: "UNKNOWN",
    vessel_count: 0,
  },
];

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function stripMarkdownFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function validateBrief(parsed: unknown): parsed is GlobalIntelligenceBrief {
  if (typeof parsed !== "object" || parsed === null) return false;
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.executive_summary !== "string" || !obj.executive_summary)
    return false;

  const validThreatLevels = ["LOW", "MODERATE", "ELEVATED", "HIGH"];
  if (!validThreatLevels.includes(obj.threat_level as string)) return false;

  if (!Array.isArray(obj.top_alerts)) return false;
  if (!Array.isArray(obj.regional_status) || obj.regional_status.length < 1) return false;
  if (!Array.isArray(obj.trend_signals)) return false;

  return true;
}

// â”€â”€â”€ Main Handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  const startTime = Date.now();
  console.info("[intelligence-brief-global] Starting execution.");

  try {
    // â”€â”€ Environment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const groqApiKey = Deno.env.get("GROQ_API_KEY");

    if (!supabaseUrl || !serviceRoleKey || !groqApiKey) {
      throw new Error(
        "Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY"
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const today = getTodayIso();
    const dataFreshness = new Date().toISOString();

    // â”€â”€ Parallel Data Pulls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const [
      vesselStatsResult,
      anomaliesResult,
      stsEventsResult,
      portCongestionResult,
      sanctionedActiveResult,
      darkFleetTopResult,
    ] = await Promise.all([
      // 1. Vessel Stats via RPC
      (async (): Promise<VesselStats | null> => {
        try {
          const { data: rpcData, error: rpcError } = await supabase
            .rpc("get_vessel_stats");
          if (rpcError) throw new Error(rpcError.message);
          const stats = rpcData as VesselStats;
          return {
            total: stats.total ?? 0,
            dark_fleet_count: stats.dark_fleet_count ?? 0,
            sanctioned_count: stats.sanctioned_count ?? 0,
            anchored_count: stats.anchored_count ?? 0,
          };
        } catch (e) {
          console.error("[intelligence-brief-global] vessel_stats error:", (e as Error).message);
          return null;
        }
      })(),

      // 2. Anomalies â€” last 24 hours
      (async (): Promise<AnomalyRow[]> => {
        try {
          const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { data, error } = await supabase
            .from("anomalies")
            .select("anomaly_type, severity, mmsi, title, lat, lon, description, detected_at")
            .gt("detected_at", cutoff)
            .order("severity", { ascending: false })
            .order("detected_at", { ascending: false })
            .limit(20);
          if (error) {
            console.error("[intelligence-brief-global] anomalies error:", error.message);
            return [];
          }
          return (data as AnomalyRow[]) ?? [];
        } catch (err) {
          console.error("[intelligence-brief-global] anomalies exception:", (err as Error).message);
          return [];
        }
      })(),

      // 3. STS Events â€” last 48 hours
      (async (): Promise<StsEventRow[]> => {
        try {
          const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
          const { data, error } = await supabase
            .from("sts_events")
            .select("mmsi1, mmsi2, vessel1_name, vessel2_name, lat, lon, risk_score, first_detected_at")
            .filter("first_detected_at", "gt", cutoff)
            .order("risk_score", { ascending: false })
            .limit(10);
          if (error) {
            console.error("[intelligence-brief-global] sts_events error:", error.message);
            return [];
          }
          return (data as StsEventRow[]) ?? [];
        } catch (err) {
          console.error("[intelligence-brief-global] sts_events exception:", (err as Error).message);
          return [];
        }
      })(),

      // 4. Port Congestion â€” top 10
      (async (): Promise<PortCongestionRow[]> => {
        try {
          const { data, error } = await supabase
            .from("port_congestion")
            .select("port_id, congestion_index, vessel_count, congestion_status, calculated_at")
            .order("congestion_index", { ascending: false })
            .limit(10);
          if (error) {
            console.error("[intelligence-brief-global] port_congestion error:", error.message);
            return [];
          }
          return (data as PortCongestionRow[]) ?? [];
        } catch (err) {
          console.error("[intelligence-brief-global] port_congestion exception:", (err as Error).message);
          return [];
        }
      })(),

      // 5. Sanctioned Vessels Active â€” transmitting in last 6 hours
      (async (): Promise<SanctionedVesselRow[]> => {
        try {
          const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
          const { data, error } = await supabase
            .from("vessels")
            .select("mmsi, vessel_name, type_category, flag_state, lat, lon, last_update")
            .eq("sanctions_match", true)
            .gt("last_update", cutoff)
            .limit(15);
          if (error) {
            console.error("[intelligence-brief-global] sanctioned_active error:", error.message);
            return [];
          }
          return (data as SanctionedVesselRow[]) ?? [];
        } catch (err) {
          console.error("[intelligence-brief-global] sanctioned_active exception:", (err as Error).message);
          return [];
        }
      })(),

      // 6. Dark Fleet Top â€” highest score, active in last 6 hours
      (async (): Promise<DarkFleetRow[]> => {
        try {
          const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
          const { data, error } = await supabase
            .from("vessels")
            .select("mmsi, vessel_name, type_category, flag_state, dark_fleet_score, lat, lon, last_update")
            .gt("dark_fleet_score", 70)
            .gt("last_update", cutoff)
            .order("dark_fleet_score", { ascending: false })
            .limit(10);
          if (error) {
            console.error("[intelligence-brief-global] dark_fleet_top error:", error.message);
            return [];
          }
          return (data as DarkFleetRow[]) ?? [];
        } catch (err) {
          console.error("[intelligence-brief-global] dark_fleet_top exception:", (err as Error).message);
          return [];
        }
      })(),
    ]);

    // Enrich flag_state from MMSI where DB has null
    const enrichedSanctioned = sanctionedActiveResult.map((r) => ({
      ...r,
      flag_state: r.flag_state || mmsiToFlagState(r.mmsi),
    }));
    const enrichedDarkFleet = darkFleetTopResult.map((r) => ({
      ...r,
      flag_state: r.flag_state || mmsiToFlagState(r.mmsi),
    }));

    const context: IntelligenceContext = {
      report_date: today,
      data_freshness: dataFreshness,
      vessel_stats: vesselStatsResult,
      anomalies: anomaliesResult,
      sts_events: stsEventsResult,
      port_congestion: portCongestionResult,
      sanctioned_active: enrichedSanctioned,
      dark_fleet_top: enrichedDarkFleet,
    };

    console.info(
      `[intelligence-brief-global] Data pull complete. anomalies=${anomaliesResult.length}, sts=${stsEventsResult.length}, ports=${portCongestionResult.length}, sanctioned=${sanctionedActiveResult.length}, dark_fleet=${darkFleetTopResult.length}`
    );

    // â”€â”€ Groq API Call â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const systemPrompt = `You are the Thalweg Maritime Intelligence Engine. You produce structured, factual, actionable daily intelligence briefs for port authorities, sanctions analysts, and maritime security professionals. You analyze AIS vessel data, anomaly detections, ship-to-ship transfer events, port congestion indices, and sanctions matches to produce a GlobalIntelligenceBrief.

Your output MUST be valid JSON matching the GlobalIntelligenceBrief schema exactly. No markdown. No explanation. No prose outside the JSON. Return only the raw JSON object.

Rules:
- threat_level reflects the most severe confirmed alert in the data
- top_alerts: select the 5 most operationally significant events from the data
- regional_status: cover all 6 defined regions, infer vessel_count from lat/lon ranges in the data
- trend_signals: identify genuine directional patterns, not noise
- executive_summary: 2-3 sentences a harbor master or sanctions analyst would find immediately actionable
- Never fabricate vessel names, MMSIs, or coordinates not present in the data
- classification is always exactly: UNCLASSIFIED - OPEN SOURCE INTELLIGENCE`;

    const userPrompt =
      "Generate the GlobalIntelligenceBrief for this maritime intelligence snapshot:\n\n" +
      JSON.stringify(context);

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(30000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.2,
        max_tokens: 2500,
        stream: false,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      throw new Error(`Groq API error ${groqResponse.status}: ${errText}`);
    }

    const groqData = await groqResponse.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const rawContent = groqData.choices?.[0]?.message?.content ?? "";
    const stripped = stripMarkdownFences(rawContent);

    // â”€â”€ JSON Validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let validatedBrief: GlobalIntelligenceBrief;
    let isFallback = false;

    try {
      const parsed: unknown = JSON.parse(stripped);

      if (!validateBrief(parsed)) {
        throw new Error("Brief failed schema validation.");
      }

      // Ensure required top-level fields that Groq might omit are present
      const brief = parsed as GlobalIntelligenceBrief;
      if (!brief.id) brief.id = crypto.randomUUID();
      if (!brief.date) brief.date = today;
      if (!brief.generated_at) brief.generated_at = new Date().toISOString();
      if (!brief.classification)
        brief.classification = "UNCLASSIFIED - OPEN SOURCE INTELLIGENCE";
      if (!brief.generated_by)
        brief.generated_by =
          "Thalweg Intelligence Engine v1 / llama-3.3-70b-versatile";

      validatedBrief = brief;
      console.info(
        `[intelligence-brief-global] Groq brief validated. threat_level=${validatedBrief.threat_level}`
      );
    } catch (parseErr) {
      console.error(
        "[intelligence-brief-global] Brief validation failed, using fallback:",
        (parseErr as Error).message
      );
      isFallback = true;

      validatedBrief = {
        id: crypto.randomUUID(),
        date: today,
        generated_at: new Date().toISOString(),
        classification: "UNCLASSIFIED - OPEN SOURCE INTELLIGENCE",
        executive_summary:
          "Intelligence brief generation encountered an error. Raw data collection succeeded. Manual review recommended.",
        threat_level: "MODERATE",
        top_alerts: [],
        regional_status: SIX_REGIONS_WITH_ZERO_DATA,
        trend_signals: [],
        data_quality_note:
          "Fallback brief â€” AI synthesis failed. Raw data available.",
        generated_by: "Thalweg Intelligence Engine v1 / fallback",
        sources: ["AIS/AISStream", "Supabase vessel DB"],
        anomaly_count: anomaliesResult.length,
        critical_anomaly_count: 0,
        congested_port_count: portCongestionResult.length,
        new_piracy_incidents: 0,
      };
    }

    // â”€â”€ Upsert to intelligence_briefs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const { error: upsertError } = await supabase
      .from("intelligence_briefs")
      .upsert(
        {
          brief_type: "global",
          date: today,
          region: null,
          port_id: null,
          mmsi: null,
          generated_at: new Date().toISOString(),
          content: validatedBrief,
          model_used: "llama-3.3-70b-versatile",
          input_tokens: groqData.usage?.prompt_tokens ?? 0,
          output_tokens: groqData.usage?.completion_tokens ?? 0,
          is_fallback: isFallback,
        },
        {
          onConflict: "brief_type,date",
          ignoreDuplicates: false,
        }
      );

    if (upsertError) {
      throw new Error(`intelligence_briefs upsert failed: ${upsertError.message}`);
    }

    const durationMs = Date.now() - startTime;
    const tokensUsed =
      (groqData.usage?.prompt_tokens ?? 0) +
      (groqData.usage?.completion_tokens ?? 0);

    console.info(
      `[intelligence-brief-global] Complete. duration=${durationMs}ms, tokens=${tokensUsed}, is_fallback=${isFallback}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        brief_id: validatedBrief.id,
        date: validatedBrief.date,
        threat_level: validatedBrief.threat_level,
        is_fallback: isFallback,
        tokens_used: tokensUsed,
        anomaly_count: validatedBrief.anomaly_count,
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    const durationMs = Date.now() - startTime;
    console.error(
      `[intelligence-brief-global] Fatal error after ${durationMs}ms:`,
      (err as Error).message
    );
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }
});




