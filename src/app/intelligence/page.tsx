import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

export const revalidate = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.MY_SERVICE_ROLE_KEY!
);

const INTEL_FEEDS = [
  'AISStream.io WebSocket',
  'OpenSanctions Database',
  'Global Fishing Watch',
  'CMEMS Sea Surface Temperature',
  'Ocean current data',
  'Anomaly Detection Engine',
  'Dark Fleet Scorer',
  'Alert Dispatcher',
];

export default async function IntelligencePage() {
  const [
    { data: fleetStats },
    { data: sanctionsByFlag },
    { data: darkFleetByRegion },
    { data: anomalyStats },
    { data: totals },
    { count: positionCount },
  ] = await Promise.all([
    supabase
      .from('vessels')
      .select('type_category, is_active')
      .eq('is_active', true)
      .not('type_category', 'is', null),

    supabase
      .from('vessels')
      .select('flag_state')
      .eq('sanctions_match', true)
      .eq('is_active', true)
      .not('flag_state', 'is', null),

    supabase
      .from('vessels')
      .select('nav_status, dark_fleet_score')
      .gte('dark_fleet_score', 60)
      .eq('is_active', true),

    supabase
      .from('vessels')
      .select('anomaly_type')
      .eq('is_anomaly', true)
      .eq('is_active', true)
      .not('anomaly_type', 'is', null),

    supabase
      .from('vessels')
      .select('mmsi, sanctions_match, is_anomaly, dark_fleet_score')
      .eq('is_active', true),

    supabase
      .from('vessel_positions')
      .select('id, recorded_at', { count: 'exact', head: true }),
  ]);

  // Fleet breakdown
  const fleetBreakdown = (fleetStats ?? []).reduce((acc, v) => {
    const cat = v.type_category ?? 'Unknown';
    acc[cat] = (acc[cat] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const fleetEntries = Object.entries(fleetBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  // Sanctions by flag
  const sanctionFlags = (sanctionsByFlag ?? []).reduce((acc, v) => {
    const f = v.flag_state ?? 'Unknown';
    acc[f] = (acc[f] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const topSanctionFlags = Object.entries(sanctionFlags)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  // Anomaly types
  const anomalyBreakdown = (anomalyStats ?? []).reduce((acc, v) => {
    const t = v.anomaly_type ?? 'Unknown';
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const anomalyEntries = Object.entries(anomalyBreakdown)
    .sort((a, b) => b[1] - a[1]);

  // Totals
  const totalActive = totals?.length ?? 0;
  const totalSanctions = totals?.filter(v => v.sanctions_match).length ?? 0;
  const totalAnomalies = totals?.filter(v => v.is_anomaly).length ?? 0;
  const totalDarkFleet = totals?.filter(v => (v.dark_fleet_score ?? 0) >= 60).length ?? 0;

  // Dark fleet avg score
  const darkFleetAvg = darkFleetByRegion && darkFleetByRegion.length > 0
    ? Math.round(
        darkFleetByRegion.reduce((s, v) => s + (v.dark_fleet_score ?? 0), 0)
        / darkFleetByRegion.length
      )
    : 0;

  const darkFleetHigh = totals?.filter(v => (v.dark_fleet_score ?? 0) >= 80).length ?? 0;
  const darkFleetCritical = totals?.filter(v => (v.dark_fleet_score ?? 0) >= 90).length ?? 0;

  return (
    <div className="bg-[#0a0f1e] min-h-screen font-body text-slate-300 pb-16">
      {/* HEADER */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-[#0a0f1e]/95 backdrop-blur border-b border-[#1a2744] z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <span className="font-heading text-white font-bold text-lg tracking-wide">
            THALWEG
          </span>
          <span className="text-slate-400 text-xs font-data">
            MARITIME INTELLIGENCE
          </span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/" className="text-[#00d4ff] text-xs font-data hover:underline cursor-pointer">
            ← LIVE GLOBE
          </Link>
          <Link href="/api-docs" className="text-slate-400 text-xs font-data hover:text-[#00d4ff]">
            API DOCS
          </Link>
          <Link href="/intelligence" className="text-slate-400 text-xs font-data hover:text-[#00d4ff]">
            INTELLIGENCE
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section className="pt-32 pb-8 max-w-6xl mx-auto px-6">
        <div className="flex items-center justify-between">
          <h1 className="font-data text-4xl font-bold text-white tracking-widest">
            FLEET INTELLIGENCE
          </h1>
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full bg-[#eab308]"
              style={{ boxShadow: '0 0 6px #eab308', animation: 'pulse 2s infinite' }}
            />
            <div className="text-right">
              <div className="text-[#eab308] text-xs font-data tracking-widest">LIVE DATA</div>
              <div className="text-slate-500 text-xs font-data">
                Updated: {new Date().toUTCString().slice(0, 25)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STATS ROW */}
      <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-6xl mx-auto px-6">
        <div className="bg-[#0d1424] border border-[#1a2744] rounded-xl p-6 text-center">
          <div className="text-white text-4xl font-bold font-data">{totalActive.toLocaleString()}</div>
          <div className="text-slate-500 text-xs font-data tracking-widest mt-2">ACTIVE VESSELS</div>
        </div>
        <div className="bg-[#0d1424] border border-[#1a2744] rounded-xl p-6 text-center">
          <div className="text-[#ef4444] text-4xl font-bold font-data">{totalSanctions.toLocaleString()}</div>
          <div className="text-slate-500 text-xs font-data tracking-widest mt-2">SANCTIONS MATCHES</div>
        </div>
        <div className="bg-[#0d1424] border border-[#1a2744] rounded-xl p-6 text-center">
          <div className="text-[#f97316] text-4xl font-bold font-data">{totalAnomalies.toLocaleString()}</div>
          <div className="text-slate-500 text-xs font-data tracking-widest mt-2">AIS ANOMALIES</div>
        </div>
        <div className="bg-[#0d1424] border border-[#1a2744] rounded-xl p-6 text-center">
          <div className="text-[#eab308] text-4xl font-bold font-data">{totalDarkFleet.toLocaleString()}</div>
          <div className="text-slate-500 text-xs font-data tracking-widest mt-2">DARK FLEET (score ≥60)</div>
        </div>
      </div>

      {/* MAIN GRID */}
      <div className="mt-12 max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

        {/* PANEL 1: FLEET COMPOSITION */}
        <div className="bg-[#0d1424] border border-[#1a2744] rounded-xl p-6">
          <h2 className="text-slate-500 text-xs font-data tracking-widest mb-4">FLEET COMPOSITION</h2>
          {fleetEntries.length === 0 ? (
            <p className="text-slate-600 text-xs font-data">No data available</p>
          ) : (
            <div>
              {fleetEntries.map(([type, count]) => {
                const pct = (count / fleetEntries[0][1]) * 100;
                return (
                  <div key={type} className="flex justify-between items-center py-2 border-b border-[#1a2744] last:border-b-0">
                    <span className="text-slate-300 text-sm font-data truncate mr-3 flex-1">{type}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[#00d4ff] text-sm font-data font-bold">{count.toLocaleString()}</span>
                      <div className="relative bg-[#1a2744] rounded-full h-1.5 w-24">
                        <div
                          className="bg-[#00d4ff] rounded-full h-1.5"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* PANEL 2: SANCTIONS BY FLAG STATE */}
        <div className="bg-[#0d1424] border border-[#1a2744] rounded-xl p-6">
          <h2 className="text-slate-500 text-xs font-data tracking-widest">SANCTIONS BY FLAG STATE</h2>
          <p className="text-slate-500 text-xs font-data mb-4 mt-1">
            {topSanctionFlags.length} flag states with sanctioned vessels
          </p>
          {topSanctionFlags.length === 0 ? (
            <p className="text-slate-600 text-xs font-data">No data available</p>
          ) : (
            <div>
              {topSanctionFlags.map(([flag, count]) => {
                const pct = (count / topSanctionFlags[0][1]) * 100;
                return (
                  <div key={flag} className="flex justify-between items-center py-2 border-b border-[#1a2744] last:border-b-0">
                    <span className="text-slate-300 text-sm font-data mr-3">{flag}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[#ef4444] text-sm font-data font-bold">{count}</span>
                      <div className="relative bg-[#1a2744] rounded-full h-1.5 w-24">
                        <div
                          className="bg-[#ef4444] rounded-full h-1.5"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* PANEL 3: ANOMALY BREAKDOWN */}
        <div className="bg-[#0d1424] border border-[#1a2744] rounded-xl p-6">
          <h2 className="text-slate-500 text-xs font-data tracking-widest mb-4">ANOMALY TYPES</h2>
          {anomalyEntries.length === 0 ? (
            <p className="text-slate-600 text-xs font-data">No anomalies detected</p>
          ) : (
            <div>
              {anomalyEntries.map(([type, count]) => {
                const pct = (count / anomalyEntries[0][1]) * 100;
                return (
                  <div key={type} className="flex justify-between items-center py-2 border-b border-[#1a2744] last:border-b-0">
                    <span className="text-slate-300 text-sm font-data truncate mr-3 flex-1">{type}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[#f97316] text-sm font-data font-bold">{count}</span>
                      <div className="relative bg-[#1a2744] rounded-full h-1.5 w-24">
                        <div
                          className="bg-[#f97316] rounded-full h-1.5"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* PANEL 4: DARK FLEET STATS */}
        <div className="bg-[#0d1424] border border-[#1a2744] rounded-xl p-6">
          <h2 className="text-slate-500 text-xs font-data tracking-widest mb-4">DARK FLEET INTELLIGENCE</h2>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div className="bg-[#060c18] rounded-lg p-3 text-center">
              <div className="text-[#eab308] text-2xl font-bold font-data">{totalDarkFleet}</div>
              <div className="text-slate-500 text-[10px] font-data mt-1">Total (score≥60)</div>
            </div>
            <div className="bg-[#060c18] rounded-lg p-3 text-center">
              <div className="text-[#eab308] text-2xl font-bold font-data">{darkFleetAvg}</div>
              <div className="text-slate-500 text-[10px] font-data mt-1">Avg dark score</div>
            </div>
            <div className="bg-[#060c18] rounded-lg p-3 text-center">
              <div className="text-[#eab308] text-2xl font-bold font-data">{darkFleetHigh}</div>
              <div className="text-slate-500 text-[10px] font-data mt-1">High risk (≥80)</div>
            </div>
            <div className="bg-[#060c18] rounded-lg p-3 text-center">
              <div className="text-[#eab308] text-2xl font-bold font-data">{darkFleetCritical}</div>
              <div className="text-slate-500 text-[10px] font-data mt-1">Critical (≥90)</div>
            </div>
          </div>
        </div>

        {/* PANEL 5: POSITION HISTORY STATS */}
        <div className="bg-[#0d1424] border border-[#1a2744] rounded-xl p-6">
          <h2 className="text-slate-500 text-xs font-data tracking-widest mb-4">POSITION HISTORY</h2>
          <div className="text-center py-4">
            <div className="text-[#00d4ff] text-4xl font-bold font-data">
              {(positionCount ?? 0).toLocaleString()}
            </div>
            <div className="text-slate-500 text-xs font-data mt-2">Total positions recorded</div>
            <div className="text-slate-500 text-xs font-data mt-2">
              24h rolling window · 15min resolution
            </div>
          </div>
        </div>

        {/* PANEL 6: INTELLIGENCE FEEDS */}
        <div className="bg-[#0d1424] border border-[#1a2744] rounded-xl p-6">
          <h2 className="text-slate-500 text-xs font-data tracking-widest mb-4">ACTIVE INTELLIGENCE FEEDS</h2>
          <div>
            {INTEL_FEEDS.map((feed) => (
              <div key={feed} className="flex items-center gap-3 py-2 border-b border-[#1a2744] last:border-b-0">
                <div
                  className="w-2 h-2 rounded-full bg-[#00ff88] flex-shrink-0"
                  style={{ boxShadow: '0 0 4px #00ff88' }}
                />
                <span className="text-slate-300 text-xs font-data">{feed}</span>
                <span className="text-[#00ff88] text-[10px] font-data ml-auto">LIVE</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* BOTTOM CTA */}
      <div className="mt-16 text-center pb-16">
        <p className="text-slate-500 text-sm">
          This intelligence is updated in real-time from live AIS feeds.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-[#00d4ff] font-data text-sm hover:underline"
        >
          ← OPEN LIVE GLOBE
        </Link>
      </div>
    </div>
  );
}
