import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WatchedVessel {
  id: string
  mmsi: string
  vessel_name: string | null
  email: string
  last_alerted_at: string | null
}

interface VesselStatus {
  mmsi: string
  vessel_name: string | null
  flag_state: string | null
  lat: number | null
  lon: number | null
  sog: number | null
  nav_status: string | null
  is_anomaly: boolean
  sanctions_match: boolean
  dark_fleet_score: number | null
  last_update: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''

  try {
    // Get all active watched vessels
    const { data: watched, error: watchErr } = await supabase
      .from('watched_vessels')
      .select('id, mmsi, vessel_name, email, last_alerted_at')
      .eq('is_active', true)

    if (watchErr) throw watchErr
    if (!watched || watched.length === 0) {
      return new Response(JSON.stringify({ message: 'No watched vessels' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const mmsiList = [...new Set(watched.map((w: WatchedVessel) => w.mmsi))]

    // Fetch current status for all watched MMSIs
    const { data: vessels, error: vesselErr } = await supabase
      .from('vessels')
      .select('mmsi, vessel_name, flag_state, lat, lon, sog, nav_status, is_anomaly, sanctions_match, dark_fleet_score, last_update')
      .in('mmsi', mmsiList)

    if (vesselErr) throw vesselErr

    const vesselMap = new Map<string, VesselStatus>()
    for (const v of (vessels ?? [])) {
      vesselMap.set(v.mmsi, v)
    }

    let alertsSent = 0
    const now = new Date()

    for (const watch of (watched as WatchedVessel[])) {
      const vessel = vesselMap.get(watch.mmsi)
      if (!vessel) continue

      // Skip if not anomalous or sanctioned
      if (!vessel.is_anomaly && !vessel.sanctions_match) continue

      // Skip if alerted in last 4 hours (prevent spam)
      if (watch.last_alerted_at) {
        const lastAlert = new Date(watch.last_alerted_at)
        const hoursSince = (now.getTime() - lastAlert.getTime()) / (1000 * 60 * 60)
        if (hoursSince < 4) continue
      }

      const vesselName = vessel.vessel_name ?? watch.vessel_name ?? `MMSI ${watch.mmsi}`
      const alertType = vessel.sanctions_match ? 'SANCTIONS MATCH' : 'BEHAVIORAL ANOMALY'
      const alertColor = vessel.sanctions_match ? '#ef4444' : '#f97316'

      const positionStr = vessel.lat && vessel.lon
        ? `${vessel.lat.toFixed(4)}° N, ${vessel.lon.toFixed(4)}° E`
        : 'Position unknown'

      const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#0a1628;color:#ffffff;font-family:monospace;padding:32px;margin:0;">
  <div style="max-width:560px;margin:0 auto;">
    <div style="border-bottom:1px solid #1e3a5f;padding-bottom:16px;margin-bottom:24px;">
      <span style="color:#00d4ff;font-size:18px;font-weight:bold;letter-spacing:2px;">THALWEG</span>
      <span style="color:#4a6a8a;font-size:12px;margin-left:12px;">MARITIME INTELLIGENCE</span>
    </div>
    <div style="background:${alertColor}22;border:1px solid ${alertColor};border-radius:4px;padding:12px 16px;margin-bottom:24px;">
      <span style="color:${alertColor};font-size:11px;font-weight:bold;letter-spacing:2px;">⚠ ${alertType} DETECTED</span>
    </div>
    <h2 style="color:#ffffff;font-size:20px;margin:0 0 4px 0;letter-spacing:1px;">${vesselName}</h2>
    <p style="color:#4a6a8a;font-size:12px;margin:0 0 24px 0;">MMSI: ${watch.mmsi}</p>
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="color:#4a6a8a;font-size:11px;padding:8px 0;border-bottom:1px solid #1e3a5f;">FLAG STATE</td>
        <td style="color:#ffffff;font-size:11px;padding:8px 0;border-bottom:1px solid #1e3a5f;text-align:right;">${vessel.flag_state ?? 'Unknown'}</td>
      </tr>
      <tr>
        <td style="color:#4a6a8a;font-size:11px;padding:8px 0;border-bottom:1px solid #1e3a5f;">POSITION</td>
        <td style="color:#ffffff;font-size:11px;padding:8px 0;border-bottom:1px solid #1e3a5f;text-align:right;">${positionStr}</td>
      </tr>
      <tr>
        <td style="color:#4a6a8a;font-size:11px;padding:8px 0;border-bottom:1px solid #1e3a5f;">SPEED</td>
        <td style="color:#ffffff;font-size:11px;padding:8px 0;border-bottom:1px solid #1e3a5f;text-align:right;">${vessel.sog ?? 0} kn</td>
      </tr>
      <tr>
        <td style="color:#4a6a8a;font-size:11px;padding:8px 0;border-bottom:1px solid #1e3a5f;">DARK FLEET SCORE</td>
        <td style="color:${(vessel.dark_fleet_score ?? 0) > 60 ? '#ef4444' : '#ffffff'};font-size:11px;padding:8px 0;border-bottom:1px solid #1e3a5f;text-align:right;">${vessel.dark_fleet_score ?? 0}/100</td>
      </tr>
      <tr>
        <td style="color:#4a6a8a;font-size:11px;padding:8px 0;">LAST UPDATE</td>
        <td style="color:#ffffff;font-size:11px;padding:8px 0;text-align:right;">${vessel.last_update ? new Date(vessel.last_update).toUTCString() : 'Unknown'}</td>
      </tr>
    </table>
    <div style="margin-top:32px;">
      <a href="https://thalweg.vercel.app" style="background:#00d4ff;color:#0a1628;padding:10px 20px;text-decoration:none;font-weight:bold;font-size:12px;letter-spacing:1px;border-radius:2px;">VIEW ON THALWEG →</a>
    </div>
    <p style="color:#2a4a6a;font-size:10px;margin-top:32px;line-height:1.6;">
      You are receiving this alert because you are watching MMSI ${watch.mmsi} on Thalweg.<br>
      This is an automated alert. Not for emergency response use.<br>
      Alerts are throttled to once per 4 hours per vessel.
    </p>
  </div>
</body>
</html>`

      // Send email via Resend
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Thalweg Alerts <onboarding@resend.dev>',
          to: [watch.email],
          subject: `⚠ ${alertType}: ${vesselName} — THALWEG ALERT`,
          html: emailHtml,
        })
      })

      if (resendRes.ok) {
        // Update last_alerted_at and increment alert_count
        const { data: currentWatch } = await supabase
          .from('watched_vessels')
          .select('alert_count')
          .eq('id', watch.id)
          .single()

        await supabase
          .from('watched_vessels')
          .update({
            last_alerted_at: now.toISOString(),
            alert_count: (currentWatch?.alert_count ?? 0) + 1
          })
          .eq('id', watch.id)

        alertsSent++
      }
    }

    return new Response(
      JSON.stringify({ message: `Alerts sent: ${alertsSent}`, checked: watched.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
