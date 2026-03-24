# THALWEG

**Real-time maritime intelligence. 37,000+ vessels. Live.**

[Live Demo](https://thalweg.vercel.app) · [API Docs](#api) · [Architecture](#architecture)

---

THALWEG is an open-source maritime intelligence platform that tracks
37,000+ vessels in real time, detects anomalous behavior, identifies
dark fleet activity, monitors piracy incidents, and predicts oil spill
drift using particle physics simulation.

Built with Next.js, deck.gl, Supabase, and NOAA oceanographic data.

---

## Features

- **Live AIS Globe** — 37,000+ vessels rendered at 60fps on a 3D globe
  using deck.gl WebGL layers. Realtime updates via Supabase Realtime.
- **Anomaly Detection** — behavioral scoring flags vessels with unusual
  speed, position jumps, or AIS gaps. Anomalies highlighted in amber.
- **Dark Fleet Scoring** — composite risk score based on flag state,
  AIS behavior, and sanctions proximity. Vessels scored 0–100.
- **Sanctions Matching** — live cross-reference against OFAC/EU/UN
  sanctions databases via OpenSanctions API.
- **Piracy Monitoring** — 40+ active incident zones from IMB/UKMTO
  rendered as interactive markers with incident detail panels.
- **SST Layer** — sea surface temperature from NOAA CoRTAD rendered
  as a heatmap overlay on the globe.
- **Oil Spill Predictor** — 200-particle forward advection simulation
  over 72 hours using NOAA NRT ocean currents + GFS wind data.
  Returns GeoJSON contamination polygons and centroid drift.
- **AI Intelligence Briefs** — per-vessel intelligence summaries
  generated on demand using Claude AI.
- **Public REST API** — 4 endpoints for vessel lookup, anomalies,
  port congestion, and spill prediction.

---

## API

Base URL: `https://thalweg.vercel.app`

All endpoints are public. Rate limits apply per IP.

### GET /api/vessel/[mmsi]

Returns enriched vessel data including sanctions status and dark fleet score.

```text
GET /api/vessel/273250630
```

Response:
```json
{
  "mmsi": "273250630",
  "vessel_name": "BRATSK",
  "flag_state": "RU",
  "ship_type": "Tanker",
  "dark_fleet_score": 74,
  "sanctions_match": true,
  "lat": 35.565,
  "lon": 32.299,
  "sog": 0.0
}
```

Rate limit: 60 requests/minute

---

### GET /api/anomalies

Returns vessels currently flagged with behavioral anomalies.

```text
GET /api/anomalies?limit=20
```

Response:
```json
{
  "anomalies": [
    {
      "mmsi": "431253000",
      "vessel_name": "FUKUTOKUMARU NO.38",
      "anomaly_type": "speed_jump",
      "severity": 0.82,
      "detected_at": "2026-03-24T11:00:00Z"
    }
  ],
  "total": 847
}
```

Rate limit: 60 requests/minute

---

### GET /api/port/[locode]

Returns port congestion metrics for a given UN/LOCODE.

```text
GET /api/port/AEJEA
```

Response:
```json
{
  "locode": "AEJEA",
  "port_name": "Jebel Ali",
  "vessel_count": 142,
  "congestion_score": 0.73,
  "avg_wait_hours": 18.4,
  "updated_at": "2026-03-24T12:00:00Z"
}
```

Rate limit: 60 requests/minute

---

### POST /api/spill

Oil spill drift prediction using 200-particle forward advection over 72 hours.
Uses NOAA CoastWatch Blended NRT Currents + NOAA GFS wind (3% Stokes drift).

```text
POST /api/spill
Content-Type: application/json

{
  "lat": 25.276,
  "lon": 55.296,
  "vessel_type": "tanker",
  "spill_tonnes": 5000,
  "mmsi": "123456789"
}
```

Parameters:

| Parameter | Type | Required | Description |
|---|---|---|---|
| lat | number | ✅ | Incident latitude (-90 to 90) |
| lon | number | ✅ | Incident longitude (-180 to 180) |
| vessel_type | string | ❌ | e.g. tanker, cargo, unknown |
| spill_tonnes | number | ❌ | Estimated volume in tonnes (default: 500) |
| mmsi | string | ❌ | Vessel MMSI for context |

Response:
```json
{
  "origin": { "lat": 25.276, "lon": 55.296 },
  "footprints": {
    "h24": { "type": "Polygon", "coordinates": [[...]] },
    "h48": { "type": "Polygon", "coordinates": [[...]] },
    "h72": { "type": "Polygon", "coordinates": [[...]] }
  },
  "centroid_drift": {
    "h24": { "lat": 25.14, "lon": 55.47, "distance_km": 24 },
    "h48": { "lat": 25.07, "lon": 55.60, "distance_km": 38 },
    "h72": { "lat": 25.18, "lon": 55.63, "distance_km": 35 }
  },
  "particle_count": 200,
  "data_sources": {
    "currents": "NOAA CoastWatch Blended NRT - 2026-03-21",
    "wind": "NOAA GFS - 2026-03-31"
  }
}
```

Rate limit: 10 requests/minute

> ⚠️ **Disclaimer:** Simulation only. Not for emergency response use.
> For real incidents contact USCG NRC (+1 800 424 8802) or your national authority.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        THALWEG                                  │
├──────────────────────────┬──────────────────────────────────────┤
│     FRONTEND             │         BACKEND                      │
│  Next.js 14 (App Router) │   Supabase (Postgres + Realtime)     │
│  deck.gl WebGL Globe     │   Supabase Edge Functions (Deno)     │
│  React hooks             │   Next.js API Routes                 │
│  Tailwind CSS            │   Vercel (deployment)                │
└──────────────────────────┴──────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌─────────────────┐          ┌──────────────────────┐
│  AIS DATA       │          │  OCEAN DATA          │
│  aisstream.io   │          │  NOAA CoastWatch NRT  │
│  29k+ vessels   │          │  NOAA GFS Wind        │
│  realtime       │          │  NOAA CoRTAD SST      │
└─────────────────┘          └──────────────────────┘
         │                              │
         ▼                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SUPABASE POSTGRES                            │
│  vessels · vessel_positions · anomalies · sanctions             │
│  piracy_incidents · port_congestion · ocean_tiles (storage)     │
└─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, React 18, TypeScript |
| Globe | deck.gl 9, WebGL2 |
| Database | Supabase Postgres (Nano) |
| Realtime | Supabase Realtime (WebSocket) |
| Edge Functions | Deno (Supabase) |
| Deployment | Vercel |
| Ocean Data | NOAA ERDDAP (CoastWatch, GFS) |
| AIS Data | aisstream.io |
| AI Briefs | Claude (Anthropic) |
| Sanctions | OpenSanctions API |

---

## Local Development

```bash
git clone https://github.com/deringeorge-nebula/thalweg.git
cd thalweg
npm install
cp .env.example .env.local   # fill in your keys
npm run dev
```

Required environment variables (see `.env.example`):

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
MY_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
OPENSANCTIONS_API_KEY=
AISSTREAM_API_KEY=
```

---

## Data Sources

| Source | Data | Update Frequency |
|---|---|---|
| aisstream.io | Vessel positions, AIS messages | Real-time |
| NOAA CoastWatch | Blended NRT ocean currents | Daily |
| NOAA GFS | 10m wind (u/v components) | 6-hourly |
| NOAA CoRTAD | Sea surface temperature | Weekly |
| IMB/UKMTO | Piracy incident reports | Weekly |
| OpenSanctions | OFAC/EU/UN sanctions lists | Daily |

---

## Disclaimer

THALWEG is a research and demonstration platform.

- AIS data may be delayed, spoofed, or incomplete
- Spill drift predictions are simulations — not for emergency response use
- Sanctions matching is approximate — verify through official channels
- Dark fleet scoring is probabilistic — not a legal determination

For maritime emergencies contact MRCC or USCG NRC: **+1 800 424 8802**

---

## License

AGPL-3.0 — free to use and modify. Any deployment must also be open source.
See [LICENSE](./LICENSE) for full terms.
