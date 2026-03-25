import { track } from '@vercel/analytics'

export function trackVesselClick(
  mmsi: string,
  vesselName: string,
  isAnomaly: boolean,
  isSanctions: boolean,
  darkFleetScore: number
): void {
  try {
    track('vessel_click', {
      mmsi,
      vessel_name: vesselName,
      is_anomaly: isAnomaly,
      is_sanctions: isSanctions,
      dark_fleet_score: darkFleetScore,
    })
  } catch {}
}

export function trackSpillPrediction(
  mmsi: string,
  vesselName: string,
  riskLevel: string
): void {
  try {
    track('spill_prediction', {
      mmsi,
      vessel_name: vesselName,
      risk_level: riskLevel,
    })
  } catch {}
}

export function trackWatchSubscription(
  mmsi: string,
  vesselName: string
): void {
  try {
    track('watch_subscription', {
      mmsi,
      vessel_name: vesselName,
    })
  } catch {}
}

export function trackIntelBrief(
  mmsi: string,
  vesselName: string
): void {
  try {
    track('intel_brief_generated', {
      mmsi,
      vessel_name: vesselName,
    })
  } catch {}
}

export function trackPdfExport(
  mmsi: string,
  riskLevel: string
): void {
  try {
    track('pdf_export', {
      mmsi,
      risk_level: riskLevel,
    })
  } catch {}
}
