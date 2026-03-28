import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { adminLogin } from './actions'

export default async function AdminPage() {
  const cookieStore = await cookies()
  const isAuthed = cookieStore.get('thalweg-admin')?.value === 'authenticated'

  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center p-4">
        <div className="bg-[#0d1424] border border-[#1a2744] rounded-lg p-8 w-full max-w-sm">
          <div className="mb-8">
            <div className="text-[#00d4ff] font-data text-xl tracking-widest">
              THALWEG
            </div>
            <div className="text-slate-400 text-xs tracking-widest mt-1">
              COMMAND CENTER
            </div>
          </div>

          <form action={adminLogin}>
            <label className="block text-slate-400 text-xs font-data tracking-widest mb-1">
              ACCESS CODE
            </label>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              className="w-full bg-[#0a0f1e] border border-[#1a2744] rounded px-3 py-2
                         text-white font-data text-sm focus:outline-none
                         focus:border-[#00d4ff] mb-4"
            />
            <button
              type="submit"
              className="w-full bg-[#00d4ff] text-[#0a0f1e] font-data font-bold
                         py-2 rounded hover:bg-cyan-300 tracking-widest text-sm
                         transition-colors"
            >
              AUTHENTICATE
            </button>
          </form>
        </div>
      </div>
    )
  }

  // --- Authed: fetch dashboard data ---
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.MY_SERVICE_ROLE_KEY!
  )

  const [
    { count: vesselCount },
    { count: activeVesselCount },
    { count: anomalyCount },
    { count: darkFleetCount },
    { count: sanctionsCount },
    { count: stsCount },
    { count: piracyCount },
    { count: activeZoneCount },
  ] = await Promise.all([
    supabase
      .from('vessels')
      .select('*', { count: 'exact', head: true }),
    supabase
      .from('vessels')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .not('lat', 'is', null),
    supabase
      .from('vessels')
      .select('*', { count: 'exact', head: true })
      .eq('is_anomaly', true),
    supabase
      .from('vessels')
      .select('*', { count: 'exact', head: true })
      .gte('dark_fleet_score', 60),
    supabase
      .from('vessels')
      .select('*', { count: 'exact', head: true })
      .eq('sanctions_match', true),
    supabase
      .from('sts_events')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true),
    supabase
      .from('piracy_incidents')
      .select('*', { count: 'exact', head: true }),
    supabase
      .from('piracy_risk_zones')
      .select('*', { count: 'exact', head: true })
      .eq('active', true),
  ])

  const stats: { label: string; value: string | number; accent: string }[] = [
    { label: 'TOTAL VESSELS',     value: vesselCount        ?? 0, accent: '#00d4ff' },
    { label: 'ACTIVE W/ POSITION',value: activeVesselCount  ?? 0, accent: '#10b981' },
    { label: 'ANOMALIES',         value: anomalyCount        ?? 0, accent: '#f97316' },
    { label: 'DARK FLEET ≥60',    value: darkFleetCount      ?? 0, accent: '#eab308' },
    { label: 'SANCTIONS MATCH',   value: sanctionsCount      ?? 0, accent: '#ef4444' },
    { label: 'ACTIVE STS',        value: stsCount            ?? 0, accent: '#8b5cf6' },
    { label: 'PIRACY INCIDENTS',  value: piracyCount         ?? 0, accent: '#f97316' },
    { label: 'RISK ZONES ACTIVE', value: activeZoneCount     ?? 0, accent: '#ef4444' },
  ]

  const statusRows: { label: string; status: string }[] = [
    { label: 'AIS RELAY',          status: 'OPERATIONAL'      },
    { label: 'ANOMALY DETECTION',  status: 'OPERATIONAL'      },
    { label: 'ALERT DISPATCHER',   status: 'OPERATIONAL'      },
    { label: 'DATA RETENTION',     status: '6H WINDOW ACTIVE' },
  ]

  const dashboardLinks: { href: string; label: string }[] = [
    {
      href: 'https://vercel.com/deringeorge-nebula/thalweg/analytics',
      label: 'VERCEL ANALYTICS ↗',
    },
    {
      href: 'https://supabase.com/dashboard/project/sicutrxeipyqvluzpuvb',
      label: 'SUPABASE DASHBOARD ↗',
    },
  ]

  return (
    <div className="min-h-screen bg-[#0a0f1e] p-8">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[#00d4ff] font-data text-xl tracking-widest">THALWEG</span>
        <span className="text-slate-400 text-xs font-data tracking-widest">COMMAND CENTER</span>
      </div>
      <div className="text-slate-500 text-xs font-data mt-1 mb-8">
        {new Date().toUTCString()}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, accent }) => (
          <div
            key={label}
            className="bg-[#0d1424] border border-[#1a2744] rounded-lg p-4"
          >
            <div
              className="text-xs font-data uppercase tracking-widest mb-1"
              style={{ color: accent }}
            >
              {label}
            </div>
            <div className="text-white font-data text-2xl font-bold">
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* External dashboards */}
      <div className="mb-8">
        <div className="text-slate-400 text-xs font-data tracking-widest mb-3">
          DASHBOARDS
        </div>
        <div className="flex gap-3 flex-wrap">
          {dashboardLinks.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-[#00d4ff] text-[#00d4ff] font-data text-xs
                         px-4 py-2 rounded hover:bg-[#00d4ff]/10 transition-colors"
            >
              {label}
            </a>
          ))}
        </div>
      </div>

      {/* System status */}
      <div>
        <div className="text-slate-400 text-xs font-data tracking-widest mb-3">
          SYSTEM
        </div>
        <div className="bg-[#0d1424] border border-[#1a2744] rounded-lg divide-y divide-[#1a2744]">
          {statusRows.map(({ label, status }) => (
            <div
              key={label}
              className="flex items-center justify-between px-4 py-3"
            >
              <span className="text-slate-400 font-data text-xs">{label}</span>
              <span className="flex items-center gap-2 font-data text-xs text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                {status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* API Routes */}
      <div className="mt-8">
        <div className="text-slate-400 text-xs font-data tracking-widest mb-3">
          API ROUTES
        </div>
        <div className="bg-[#0d1424] border border-[#1a2744] rounded-lg divide-y divide-[#1a2744]">
          {[
            { path: '/api/darkfleet',             method: 'GET', status: 'LIVE' },
            { path: '/api/anomalies',             method: 'GET', status: 'LIVE' },
            { path: '/api/piracy',                method: 'GET', status: 'LIVE' },
            { path: '/api/sts',                   method: 'GET', status: 'LIVE' },
            { path: '/api/risk-zones',            method: 'GET', status: 'LIVE' },
            { path: '/api/route-risks',           method: 'GET', status: 'LIVE' },
            { path: '/api/vessel/[mmsi]',         method: 'GET', status: 'LIVE' },
            { path: '/api/vessel/[mmsi]/track',   method: 'GET', status: 'LIVE' },
            { path: '/api/port/[locode]',         method: 'GET', status: 'LIVE' },
            { path: '/api/port/[locode]/forecast',method: 'GET', status: 'LIVE' },
            { path: '/api/spill',                 method: 'GET', status: 'LIVE' },
            { path: '/api/watch',                 method: 'GET', status: 'LIVE' },
          ].map(({ path, method, status }) => (
            <div
              key={path}
              className="flex items-center justify-between px-4 py-2.5"
            >
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-data bg-[#00d4ff]/10 text-[#00d4ff] 
                                 border border-[#00d4ff]/30 px-1.5 py-0.5 rounded">
                  {method}
                </span>
                <span className="text-slate-300 font-data text-xs">{path}</span>
              </div>
              <span className="flex items-center gap-1.5 font-data text-xs text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                {status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
