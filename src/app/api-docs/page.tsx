import Link from 'next/link';

export default function ApiDocsPage() {
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
          <Link 
            href="/" 
            className="text-[#00d4ff] text-xs font-data hover:underline cursor-pointer"
          >
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
      <section className="pt-32 pb-8 max-w-4xl mx-auto px-6">
        <h1 className="font-data text-4xl font-bold text-white tracking-widest">
          API REFERENCE
        </h1>
        <p className="mt-3 text-slate-400">
          REST API for vessel intelligence, port congestion forecasts, and route risk analysis. Base URL: https://thalweg.vercel.app
        </p>

        <div className="mt-4 bg-[#0d1424] border border-[#1a2744] rounded-lg px-4 py-3 inline-flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#eab308]"></div>
          <span className="text-slate-300 text-sm font-data">
            Public endpoints: 60 req/min · Researcher tier: 600 req/min
          </span>
        </div>
      </section>

      {/* CONTENT */}
      <div className="max-w-4xl mx-auto px-6 pb-24 space-y-16">
        
        {/* ENDPOINT 1 */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <span className="bg-[#00d4ff]/20 text-[#00d4ff] text-xs font-data font-bold px-2 py-1 rounded">GET</span>
            <h2 className="text-white font-data text-xl font-bold">/api/vessel/[mmsi]</h2>
          </div>
          <p className="text-slate-400 text-sm mt-1 mb-6">
            Full vessel intelligence record including sanctions status, dark fleet score, and anomaly flags.
          </p>

          <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm font-data text-left">
              <thead>
                <tr className="bg-[#0d1424] text-slate-500 text-xs uppercase">
                  <th className="px-4 py-3 font-normal">Parameter</th>
                  <th className="px-4 py-3 font-normal">Type</th>
                  <th className="px-4 py-3 font-normal">Required</th>
                  <th className="px-4 py-3 font-normal">Description</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[#1a2744] text-slate-300">
                  <td className="px-4 py-3">mmsi</td>
                  <td className="px-4 py-3">string</td>
                  <td className="px-4 py-3 text-[#00d4ff]">required</td>
                  <td className="px-4 py-3 text-slate-500">9-digit Maritime Mobile Service Identity</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="bg-[#060c18] border border-[#1a2744] rounded-lg p-4 overflow-x-auto mb-6">
            <pre><code className="text-[#00d4ff] text-xs font-data">curl https://thalweg.vercel.app/api/vessel/123456789</code></pre>
          </div>

          <div className="bg-[#060c18] border border-[#1a2744] rounded-lg p-4 overflow-x-auto">
            <pre><code className="text-slate-300 text-xs font-data">{`{
  "mmsi": 123456789,
  "vessel_name": "PACIFIC GHOST",
  "flag_state": "CM",
  "ship_type": 80,
  "sanctions_match": true,
  "dark_fleet_score": 87,
  "is_anomaly": true,
  "anomaly_type": "BEHAVIORAL",
  "lat": 1.207,
  "lon": 103.900,
  "sog": 0.0,
  "nav_status": 1
}`}</code></pre>
          </div>
        </section>

        {/* ENDPOINT 2 */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <span className="bg-[#00d4ff]/20 text-[#00d4ff] text-xs font-data font-bold px-2 py-1 rounded">GET</span>
            <h2 className="text-white font-data text-xl font-bold">/api/vessel/[mmsi]/track</h2>
          </div>
          <p className="text-slate-400 text-sm mt-1 mb-6">
            24-hour position history for a vessel. Returns up to 288 position points at 5-minute resolution.
          </p>

          <div className="bg-[#060c18] border border-[#1a2744] rounded-lg p-4 overflow-x-auto">
            <pre><code className="text-slate-300 text-xs font-data">{`{
  "mmsi": "123456789",
  "count": 96,
  "track": [
    { "lat": 1.195, "lon": 103.887, 
      "sog": 4.2, "recorded_at": "2026-03-26T08:00:00Z" },
    ...
  ]
}`}</code></pre>
          </div>
        </section>

        {/* ENDPOINT 3 */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <span className="bg-[#00d4ff]/20 text-[#00d4ff] text-xs font-data font-bold px-2 py-1 rounded">GET</span>
            <h2 className="text-white font-data text-xl font-bold">/api/port/[locode]</h2>
          </div>
          <p className="text-slate-400 text-sm mt-1 mb-6">
            Port congestion intelligence including active vessel count, inbound pipeline, and congestion index.
          </p>

          <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm font-data text-left">
              <thead>
                <tr className="bg-[#0d1424] text-slate-500 text-xs uppercase">
                  <th className="px-4 py-3 font-normal">Parameter</th>
                  <th className="px-4 py-3 font-normal">Type</th>
                  <th className="px-4 py-3 font-normal">Required</th>
                  <th className="px-4 py-3 font-normal">Description</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[#1a2744] text-slate-300">
                  <td className="px-4 py-3">locode</td>
                  <td className="px-4 py-3">string</td>
                  <td className="px-4 py-3 text-[#00d4ff]">required</td>
                  <td className="px-4 py-3 text-slate-500">UN/LOCODE port identifier (e.g. SGSIN, NLRTM)</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="bg-[#060c18] border border-[#1a2744] rounded-lg p-4 overflow-x-auto">
            <pre><code className="text-slate-300 text-xs font-data">{`{
  "locode": "SGSIN",
  "name": "Singapore",
  "congestion_index": 67.3,
  "active_vessel_count": 978,
  "inbound_vessel_count": 134,
  "congestion_status": "HIGH"
}`}</code></pre>
          </div>
        </section>

        {/* ENDPOINT 4 */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <span className="bg-[#00d4ff]/20 text-[#00d4ff] text-xs font-data font-bold px-2 py-1 rounded">GET</span>
            <h2 className="text-white font-data text-xl font-bold">/api/port/[locode]/forecast</h2>
          </div>
          <p className="text-slate-400 text-sm mt-1 mb-6">
            72-hour forward congestion forecast based on inbound vessel pipeline. Returns 13 data points at 6-hour intervals.
          </p>

          <div className="bg-[#060c18] border border-[#1a2744] rounded-lg p-4 overflow-x-auto">
            <pre><code className="text-slate-300 text-xs font-data">{`{
  "locode": "NLRTM",
  "forecast": [
    { "hour_offset": 0,  "vessel_count": 44, "congestion_index": 44.9 },
    { "hour_offset": 6,  "vessel_count": 76, "congestion_index": 77.6 },
    { "hour_offset": 12, "vessel_count": 86, "congestion_index": 87.8 },
    ...
  ]
}`}</code></pre>
          </div>
        </section>

        {/* ENDPOINT 5 */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <span className="bg-[#f97316]/20 text-[#f97316] text-xs font-data font-bold px-2 py-1 rounded">POST</span>
            <h2 className="text-white font-data text-xl font-bold">/api/route-risks</h2>
          </div>
          <p className="text-slate-400 text-sm mt-1 mb-6">
            Analyze all threats within a corridor along a great circle route. Returns sanctioned vessels, dark fleet, and anomalies within 50nm of the route.
          </p>

          <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm font-data text-left">
              <thead>
                <tr className="bg-[#0d1424] text-slate-500 text-xs uppercase">
                  <th className="px-4 py-3 font-normal">Parameter</th>
                  <th className="px-4 py-3 font-normal">Type</th>
                  <th className="px-4 py-3 font-normal">Required</th>
                  <th className="px-4 py-3 font-normal">Description</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[#1a2744] text-slate-300">
                  <td className="px-4 py-3">lat1</td>
                  <td className="px-4 py-3">number</td>
                  <td className="px-4 py-3 text-[#00d4ff]">required</td>
                  <td className="px-4 py-3 text-slate-500">Origin latitude (-90 to 90)</td>
                </tr>
                <tr className="border-b border-[#1a2744] text-slate-300">
                  <td className="px-4 py-3">lon1</td>
                  <td className="px-4 py-3">number</td>
                  <td className="px-4 py-3 text-[#00d4ff]">required</td>
                  <td className="px-4 py-3 text-slate-500">Origin longitude (-180 to 180)</td>
                </tr>
                <tr className="border-b border-[#1a2744] text-slate-300">
                  <td className="px-4 py-3">lat2</td>
                  <td className="px-4 py-3">number</td>
                  <td className="px-4 py-3 text-[#00d4ff]">required</td>
                  <td className="px-4 py-3 text-slate-500">Destination latitude</td>
                </tr>
                <tr className="border-b border-[#1a2744] text-slate-300">
                  <td className="px-4 py-3">lon2</td>
                  <td className="px-4 py-3">number</td>
                  <td className="px-4 py-3 text-[#00d4ff]">required</td>
                  <td className="px-4 py-3 text-slate-500">Destination longitude</td>
                </tr>
                <tr className="border-b border-[#1a2744] text-slate-300">
                  <td className="px-4 py-3">corridorNm</td>
                  <td className="px-4 py-3">number</td>
                  <td className="px-4 py-3 text-slate-500">optional</td>
                  <td className="px-4 py-3 text-slate-500">Corridor width in nautical miles (default: 50)</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="bg-[#060c18] border border-[#1a2744] rounded-lg p-4 overflow-x-auto mb-6">
            <pre><code className="text-[#00d4ff] text-xs font-data">{`curl -X POST https://thalweg.vercel.app/api/route-risks \\
  -H "Content-Type: application/json" \\
  -d '{"lat1":51.92,"lon1":4.48,"lat2":1.30,"lon2":103.80}'`}</code></pre>
          </div>

          <div className="bg-[#060c18] border border-[#1a2744] rounded-lg p-4 overflow-x-auto">
            <pre><code className="text-slate-300 text-xs font-data">{`{
  "count": 5,
  "risks": [
    {
      "threat_type": "VESSEL_SANCTIONS",
      "severity": "CRITICAL",
      "mmsi": 461000219,
      "vessel_name": "AMAZON",
      "lat": 1.207,
      "lon": 103.900,
      "detail": "Sanctioned vessel within 8.2nm of route"
    }
  ]
}`}</code></pre>
          </div>
        </section>

        {/* ENDPOINT 6 */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <span className="bg-[#f97316]/20 text-[#f97316] text-xs font-data font-bold px-2 py-1 rounded">POST</span>
            <h2 className="text-white font-data text-xl font-bold">/api/watch</h2>
          </div>
          <p className="text-slate-400 text-sm mt-1 mb-6">
            Register a vessel MMSI for email alerts. You will be notified when the vessel enters/exits port, changes anomaly status, or goes dark.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm font-data text-left">
              <thead>
                <tr className="bg-[#0d1424] text-slate-500 text-xs uppercase">
                  <th className="px-4 py-3 font-normal">Parameter</th>
                  <th className="px-4 py-3 font-normal">Type</th>
                  <th className="px-4 py-3 font-normal">Required</th>
                  <th className="px-4 py-3 font-normal">Description</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[#1a2744] text-slate-300">
                  <td className="px-4 py-3">mmsi</td>
                  <td className="px-4 py-3">string</td>
                  <td className="px-4 py-3 text-[#00d4ff]">required</td>
                  <td className="px-4 py-3 text-slate-500">9-digit MMSI to watch</td>
                </tr>
                <tr className="border-b border-[#1a2744] text-slate-300">
                  <td className="px-4 py-3">email</td>
                  <td className="px-4 py-3">string</td>
                  <td className="px-4 py-3 text-[#00d4ff]">required</td>
                  <td className="px-4 py-3 text-slate-500">Email address for alerts</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* BOTTOM CTA SECTION */}
        <section className="mt-16 text-center">
          <p className="text-slate-400 text-lg">
            Need higher rate limits or bulk data access?
          </p>
          <div className="flex justify-center gap-4 mt-6">
            <Link 
              href="/demo" 
              className="bg-[#00d4ff] text-[#0a0f1e] px-6 py-3 rounded font-data font-bold text-sm hover:bg-[#00d4ff]/80 transition-colors"
            >
              REQUEST RESEARCHER ACCESS →
            </Link>
            <a 
              href="https://github.com/deringeorge-nebula/thalweg" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="border border-[#1a2744] text-slate-300 px-6 py-3 rounded font-data text-sm hover:border-[#00d4ff] transition-colors"
            >
              VIEW SOURCE ON GITHUB →
            </a>
          </div>
        </section>

      </div>
    </div>
  );
}
