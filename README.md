# Thalweg — Maritime Intelligence Platform

> Real-time global maritime intelligence. 24,000+ live vessels.
> Port congestion. Sanctions detection. IUU fishing. Ocean temperature.
> Free. Open source. Built in 48 hours.

![Globe](public/screenshot.png)

## Live Features
- **24,391 live vessels** from global AIS network, updating in real-time
- **Port Congestion Engine** — 50 global ports, 0–100 index, 72-hour prediction
- **Sanctions Layer** — 43 sanctioned vessels flagged from OpenSanctions (OFAC/EU/UK/UN)
- **IUU Fishing Detection** — Global Fishing Watch events cross-referenced against 30 MPAs
- **SST Overlay** — NOAA sea surface temperature grid, toggleable

## Stack
- **Frontend**: Next.js 14, TypeScript, deck.gl 8.9.35 (WebGL2)
- **Database**: Supabase PostgreSQL + PostGIS
- **Edge Functions**: Deno (Supabase Edge Runtime)
- **Automation**: pg_cron + pg_net
- **Data Sources**: AISStream.io, OpenSanctions, Global Fishing Watch, NOAA ERDDAP

## Architecture
AISStream.io WebSocket → Supabase Edge Function → PostgreSQL
↓
Port Congestion Engine (5 min)
Sanctions Sync (daily 07:00 UTC)
GFW Fishing Sync (daily 08:00 UTC)
SST Sync (daily 06:00 UTC)
↓
Next.js → deck.gl Globe → Float32Array GPU buffers

text

## Data Sources
All free, all open:
- [AISStream.io](https://aisstream.io) — Real-time AIS
- [OpenSanctions](https://opensanctions.org) — Sanctions lists
- [Global Fishing Watch](https://globalfishingwatch.org) — Fishing events
- [NOAA ERDDAP](https://coastwatch.pfeg.noaa.gov/erddap) — Sea surface temperature

## License
AGPL-3.0