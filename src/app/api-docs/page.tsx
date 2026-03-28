'use client'

import { useState, useEffect } from 'react'

interface EndpointCardProps {
  id: string
  method: string
  path: string
  description: string
  params?: { name: string; type: string; required: string; description: string }[]
  responseType: string
  exampleResponse: string
  notes?: string
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={handleCopy}
      className="text-xs font-mono bg-[#1e3a5f] hover:bg-[#1a3a5c] text-[#e2e8f0] px-2 py-1 rounded transition-colors"
    >
      {copied ? 'COPIED' : 'COPY'}
    </button>
  )
}

function SyntaxHighlight({ code }: { code: string }) {
  // Simple syntax highlighting for JSON
  const highlighted = code
    .replace(/"([^"]+)":/g, '<span style="color:#94a3b8">"$1"</span>:')
    .replace(/: "([^"]*)"/g, ': <span style="color:#22d3ee">"$1"</span>')
    .replace(/: (-?\d+\.?\d*)/g, ': <span style="color:#f97316">$1</span>')
    .replace(/: (true|false)/g, ': <span style="color:#10b981">$1</span>')

  return (
    <pre className="bg-[#060d14] p-4 rounded-lg overflow-x-auto text-sm text-[#e2e8f0] font-mono border border-[#1e3a5f]">
      <code dangerouslySetInnerHTML={{ __html: highlighted }} />
    </pre>
  )
}

function EndpointCard({ id, method, path, description, params, responseType, exampleResponse, notes }: EndpointCardProps) {
  const fullUrl = `https://thalweg.vercel.app${path}`
  return (
    <section id={id} className="scroll-mt-8 mb-16">
      <div className="bg-[#0d1520] hover:bg-[#111c2a] border border-[#1e3a5f] rounded-xl overflow-hidden transition-colors">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e3a5f] bg-[#0a0f14]">
          <div className="flex items-center gap-3">
            <span className="bg-[#22d3ee] text-[#0a0f14] px-2 py-1 rounded text-xs font-mono font-bold">
              {method}
            </span>
            <span className="text-[#e2e8f0] font-mono font-medium">{path}</span>
          </div>
          <CopyButton text={fullUrl} />
        </div>
        
        <div className="p-6 space-y-6">
          <p className="text-[#e2e8f0] font-sans leading-relaxed">{description}</p>

          {params && params.length > 0 && (
            <div>
              <h4 className="text-[#64748b] text-xs font-bold tracking-wider mb-3 uppercase">PARAMETERS</h4>
              <div className="overflow-x-auto border border-[#1e3a5f] rounded-lg">
                <table className="w-full text-left font-sans text-sm">
                  <thead className="bg-[#1e3a5f] text-[#e2e8f0]">
                    <tr>
                      <th className="px-4 py-2 font-medium">NAME</th>
                      <th className="px-4 py-2 font-medium">TYPE</th>
                      <th className="px-4 py-2 font-medium">REQUIRED</th>
                      <th className="px-4 py-2 font-medium">DESCRIPTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e3a5f]">
                    {params.map((p, i) => (
                      <tr key={i} className="bg-[#0d1520]">
                        <td className="px-4 py-2 text-[#e2e8f0] font-mono">{p.name}</td>
                        <td className="px-4 py-2 text-[#475569] font-mono">{p.type}</td>
                        <td className="px-4 py-2 text-xs">
                          {p.required === 'required' ? (
                            <span className="text-[#ef4444] uppercase">REQUIRED</span>
                          ) : (
                            <span className="text-[#64748b] uppercase">OPTIONAL</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-[#64748b]">{p.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[#64748b] text-xs font-bold tracking-wider uppercase">RESPONSE</h4>
              <span className="text-[#475569] text-xs font-mono">{responseType}</span>
            </div>
            <SyntaxHighlight code={exampleResponse} />
          </div>

          <div className="pt-4 border-t border-[#1e3a5f]/50">
            <p className="text-[#475569] text-xs font-mono">
              Cache: s-maxage=60, stale-while-revalidate=30
            </p>
            {notes && <p className="text-[#475569] text-xs font-mono mt-1">{notes}</p>}
          </div>
        </div>
      </div>
    </section>
  )
}

export default function ApiDocsPage() {
  const [activeSection, setActiveSection] = useState('')

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id)
          }
        })
      },
      { rootMargin: '-20% 0px -70% 0px' }
    )

    document.querySelectorAll('section[id]').forEach((section) => {
      observer.observe(section)
    })

    return () => observer.disconnect()
  }, [])

  const navLinks = [
    { id: 'authentication', label: 'AUTHENTICATION' },
    { id: 'response-format', label: 'RESPONSE FORMAT' },
    { id: 'dark-fleet', label: '/api/darkfleet', method: 'GET' },
    { id: 'anomalies', label: '/api/anomalies', method: 'GET' },
    { id: 'vessel', label: '/api/vessel/[mmsi]', method: 'GET' },
    { id: 'vessel-track', label: '/api/vessel/[mmsi]/track', method: 'GET' },
    { id: 'route-risks', label: '/api/route-risks', method: 'GET' },
    { id: 'port', label: '/api/port/[locode]', method: 'GET' },
    { id: 'port-forecast', label: '/api/port/[locode]/forecast', method: 'GET' },
    { id: 'spill', label: '/api/spill', method: 'GET' },
    { id: 'watch', label: '/api/watch', method: 'GET' },
    { id: 'errors', label: 'ERROR RESPONSES' },
  ]

  return (
    <div className="min-h-screen bg-[#0a0f14] flex">
      {/* SIDEBAR */}
      <aside className="w-[260px] fixed top-0 left-0 h-full border-r border-[#1e3a5f] bg-[#0a0f14] flex flex-col z-10 overflow-y-auto">
        <div className="p-6 border-b border-[#1e3a5f]">
          <div className="flex justify-between items-center">
            <h1 className="text-[#22d3ee] font-mono text-sm tracking-widest font-bold">
              THALWEG API
            </h1>
            <span className="bg-[#1e3a5f] text-[#e2e8f0] text-[10px] px-2 py-0.5 rounded font-mono">
              v1.0
            </span>
          </div>
        </div>
        
        <nav className="flex-1 py-6 px-4 space-y-1">
          {navLinks.map((link) => {
            const isActive = activeSection === link.id
            return (
              <a
                key={link.id}
                href={`#${link.id}`}
                className={`flex gap-3 items-center px-3 py-2 text-sm font-sans rounded transition-colors border-l-2 ${
                  isActive 
                    ? 'border-[#22d3ee] text-[#22d3ee] bg-[#111c2a]' 
                    : 'border-transparent text-[#64748b] hover:text-[#e2e8f0] hover:bg-[#0d1520]'
                }`}
              >
                {link.method && (
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                    isActive ? 'bg-[#22d3ee]/20 text-[#22d3ee]' : 'bg-[#1e3a5f] text-[#e2e8f0]'
                  }`}>
                    {link.method}
                  </span>
                )}
                <span className={link.method ? 'font-mono text-xs' : 'font-semibold uppercase tracking-wider'}>
                  {link.label}
                </span>
              </a>
            )
          })}
        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 ml-[260px] min-h-screen">
        {/* HEADER */}
        <div className="px-8 py-12 border-b border-[#1e3a5f] bg-[#0d1520]">
          <h1 className="text-4xl font-sans font-bold text-[#e2e8f0] mb-4 tracking-tight">
            MARITIME INTELLIGENCE API
          </h1>
          <p className="text-[#64748b] text-lg max-w-2xl font-sans leading-relaxed mb-6">
            Real-time vessel tracking, dark fleet detection, port intelligence, and route risk assessment.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3 bg-[#0a0f14] border border-[#1e3a5f] rounded-lg px-4 py-2">
              <span className="text-[#475569] font-mono text-sm">BASE URL</span>
              <span className="text-[#e2e8f0] font-mono text-sm">https://thalweg.vercel.app/api</span>
              <div className="ml-2">
                <CopyButton text="https://thalweg.vercel.app/api" />
              </div>
            </div>
            <div className="flex gap-2">
              <span className="bg-[#1e3a5f] text-[#e2e8f0] px-3 py-2 rounded-lg text-xs font-mono font-bold">
                9 ENDPOINTS
              </span>
              <span className="bg-[#1e3a5f] text-[#e2e8f0] px-3 py-2 rounded-lg text-xs font-mono font-bold">
                REST · JSON
              </span>
            </div>
          </div>
        </div>

        {/* SCROLLABLE SECTIONS */}
        <div className="px-8 py-12 max-w-5xl">
          
          {/* AUTHENTICATION */}
          <section id="authentication" className="scroll-mt-8 mb-16">
            <h2 className="text-[#e2e8f0] text-xl font-bold font-sans mb-6 uppercase tracking-widest border-b border-[#1e3a5f] pb-2">
              AUTHENTICATION
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#0d1520] border border-[#1e3a5f] rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-2 h-2 rounded-full bg-[#10b981]"></span>
                  <h3 className="text-[#e2e8f0] font-bold font-sans uppercase">PUBLIC ACCESS</h3>
                </div>
                <p className="text-[#64748b] font-sans leading-relaxed">
                  All endpoints are publicly accessible. No API key required for standard usage.
                </p>
              </div>
              <div className="bg-[#0d1520] border border-[#1e3a5f] rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-2 h-2 rounded-full bg-[#eab308]"></span>
                  <h3 className="text-[#e2e8f0] font-bold font-sans uppercase">RATE LIMITING</h3>
                </div>
                <div className="text-[#64748b] font-sans leading-relaxed space-y-1">
                  <p>Standard: 60 requests/minute per IP</p>
                  <p>Burst: 10 requests/second</p>
                  <p className="text-[#475569] text-sm mt-3 border-t border-[#1e3a5f] pt-3">
                    Headers returned: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* RESPONSE FORMAT */}
          <section id="response-format" className="scroll-mt-8 mb-16">
            <h2 className="text-[#e2e8f0] text-xl font-bold font-sans mb-6 uppercase tracking-widest border-b border-[#1e3a5f] pb-2">
              RESPONSE FORMAT
            </h2>
            <div className="bg-[#0d1520] border border-[#1e3a5f] rounded-xl p-6 mb-6">
              <h3 className="text-[#e2e8f0] font-bold font-sans mb-4 uppercase">RiskEvent Type</h3>
              <pre className="bg-[#060d14] p-4 rounded-lg overflow-x-auto text-sm font-mono border border-[#1e3a5f]">
                <code className="text-[#e2e8f0]">
                  <span className="text-[#22d3ee]">interface</span> RiskEvent {'{\n'}
                  {'  id:        '}<span className="text-[#f97316]">string</span>{'                    '}<span className="text-[#475569]">{'// Unique event identifier'}</span>{'\n'}
                  {'  severity:  '}<span className="text-[#f97316]">{"'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'"}</span>{'\n'}
                  {'  category:  '}<span className="text-[#f97316]">{"'DARK FLEET'|'ANOMALY'|'ROUTE RISK'|'SANCTIONS'|'PIRACY'"}</span>{'\n'}
                  {'  title:     '}<span className="text-[#f97316]">string</span>{'                    '}<span className="text-[#475569]">{'// Human-readable event title'}</span>{'\n'}
                  {'  region:    '}<span className="text-[#f97316]">string</span>{'                    '}<span className="text-[#475569]">{'// Geographic region'}</span>{'\n'}
                  {'  detail:    '}<span className="text-[#f97316]">string</span>{'                    '}<span className="text-[#475569]">{'// Extended description'}</span>{'\n'}
                  {'  timestamp: '}<span className="text-[#f97316]">string</span>{'                    '}<span className="text-[#475569]">{'// ISO 8601'}</span>{'\n'}
                  {'  mmsi?:     '}<span className="text-[#f97316]">string</span>{'                    '}<span className="text-[#475569]">{'// Vessel MMSI if applicable'}</span>{'\n'}
                  {'  lat?:      '}<span className="text-[#f97316]">number</span>{'                    '}<span className="text-[#475569]">{'// Last known latitude'}</span>{'\n'}
                  {'  lon?:      '}<span className="text-[#f97316]">number</span>{'                    '}<span className="text-[#475569]">{'// Last known longitude'}</span>{'\n'}
                  {'}'}
                </code>
              </pre>
            </div>
            <div className="bg-[#0d1520] border border-[#1e3a5f] rounded-xl p-6">
              <h3 className="text-[#e2e8f0] font-bold font-sans mb-4 uppercase">Severity Levels</h3>
              <div className="flex flex-wrap gap-3">
                <span className="bg-[#ef4444]/20 border border-[#ef4444]/50 text-[#ef4444] px-3 py-1 rounded text-xs font-mono font-bold">CRITICAL</span>
                <span className="bg-[#f97316]/20 border border-[#f97316]/50 text-[#f97316] px-3 py-1 rounded text-xs font-mono font-bold">HIGH</span>
                <span className="bg-[#eab308]/20 border border-[#eab308]/50 text-[#eab308] px-3 py-1 rounded text-xs font-mono font-bold">MEDIUM</span>
                <span className="bg-[#10b981]/20 border border-[#10b981]/50 text-[#10b981] px-3 py-1 rounded text-xs font-mono font-bold">LOW</span>
              </div>
            </div>
          </section>

          <h2 className="text-[#e2e8f0] text-xl font-bold font-sans mb-6 mt-12 uppercase tracking-widest border-b border-[#1e3a5f] pb-2">
            ENDPOINTS
          </h2>

          <EndpointCard
            id="dark-fleet"
            method="GET"
            path="/api/darkfleet"
            description="Returns active dark fleet vessel detections scored HIGH or CRITICAL. Vessels are identified via AIS silence patterns, sanctioned EEZ proximity, and multi-signal risk scoring."
            responseType="RiskEvent[]"
            exampleResponse={`[
  {
    "id": "darkfleet-54634226-b173-4856-bd0f-963f7a40974c",
    "severity": "HIGH",
    "category": "DARK FLEET",
    "title": "Dark fleet candidate: GEFEST",
    "region": "GLOBAL",
    "detail": "Vessel scored 73/100 on dark fleet risk assessment. Active signals: SANCTIONS_MATCH, AIS_DARK_241MIN, NEAR_SANCTIONED_EEZ, UNKNOWN_TYPE.",
    "timestamp": "2026-03-28T07:30:03.334+00:00",
    "mmsi": "273272850",
    "lat": 60.0564,
    "lon": 27.0688
  }
]`}
          />

          <EndpointCard
            id="anomalies"
            method="GET"
            path="/api/anomalies"
            description="Returns vessel anomaly detections scored MEDIUM or LOW. Includes AIS silence events below high-risk threshold and lower-confidence dark fleet candidates."
            responseType="RiskEvent[]"
            exampleResponse={`[
  {
    "id": "anomaly-a428896b-2559-4fd1-9e8a-b54b3ecc59fc",
    "severity": "MEDIUM",
    "category": "ANOMALY",
    "title": "Dark fleet candidate: PROSPERITY",
    "region": "MEDITERRANEAN",
    "detail": "Vessel scored 63/100 on dark fleet risk assessment. Active signals: SANCTIONS_MATCH, AIS_DARK_914MIN, UNKNOWN_TYPE.",
    "timestamp": "2026-03-28T07:30:05.183+00:00",
    "mmsi": "273266690",
    "lat": 41.286,
    "lon": 29.554
  }
]`}
          />

          <EndpointCard
            id="vessel"
            method="GET"
            path="/api/vessel/[mmsi]"
            description="Returns full vessel profile for a given MMSI including position, flag state, vessel type, and navigation status."
            params={[
              { name: 'mmsi', type: 'string', required: 'required', description: '9-digit Maritime Mobile Service Identity number' }
            ]}
            responseType="VesselProfile"
            exampleResponse={`{
  "mmsi": "273272850",
  "name": "GEFEST",
  "lat": 60.0564,
  "lon": 27.0688,
  "sog": 0.01,
  "cog": 26.75,
  "flag": "RU",
  "vessel_type": 0,
  "nav_status": 1,
  "updated_at": "2026-03-28T05:38:51.557+00:00"
}`}
          />

          <EndpointCard
            id="vessel-track"
            method="GET"
            path="/api/vessel/[mmsi]/track"
            description="Returns historical position track for a vessel. Useful for pattern-of-life analysis and route reconstruction."
            params={[
              { name: 'mmsi', type: 'string', required: 'required', description: '9-digit MMSI' },
              { name: 'limit', type: 'number', required: 'optional', description: 'Max positions (default 100, max 500)' }
            ]}
            responseType="VesselPosition[]"
            exampleResponse={`[
  {
    "mmsi": "273272850",
    "lat": 60.0564,
    "lon": 27.0688,
    "sog": 0.01,
    "cog": 26.75,
    "timestamp": "2026-03-28T05:38:51.557+00:00"
  }
]`}
          />

          <EndpointCard
            id="route-risks"
            method="GET"
            path="/api/route-risks"
            description="Returns active route risk assessments for major shipping corridors. Covers piracy, conflict zones, weather disruptions, and sanctions-related chokepoints."
            responseType="RouteRisk[]"
            exampleResponse={`[
  {
    "id": "route-001",
    "route": "Red Sea / Bab-el-Mandeb",
    "severity": "CRITICAL",
    "risk_type": "CONFLICT",
    "description": "Houthi interdiction activity ongoing.",
    "updated_at": "2026-03-28T00:00:00.000+00:00"
  }
]`}
          />

          <EndpointCard
            id="port"
            method="GET"
            path="/api/port/[locode]"
            description="Returns port data, current congestion level, and vessel count for a UN/LOCODE port identifier."
            params={[
              { name: 'locode', type: 'string', required: 'required', description: '5-character UN/LOCODE (e.g. SGSIN, AEDXB, USLAX)' }
            ]}
            responseType="PortProfile"
            exampleResponse={`{
  "locode": "SGSIN",
  "name": "Singapore",
  "country": "SG",
  "lat": 1.2897,
  "lon": 103.8501,
  "congestion_level": "HIGH",
  "vessel_count": 842,
  "updated_at": "2026-03-28T06:00:00.000+00:00"
}`}
          />

          <EndpointCard
            id="port-forecast"
            method="GET"
            path="/api/port/[locode]/forecast"
            description="Returns 7-day congestion forecast for a port derived from vessel arrival patterns and historical throughput data."
            params={[
              { name: 'locode', type: 'string', required: 'required', description: '5-character UN/LOCODE' }
            ]}
            responseType="PortForecast"
            exampleResponse={`{
  "locode": "SGSIN",
  "forecast": [
    { "date": "2026-03-29", "level": "HIGH", "confidence": 0.82 },
    { "date": "2026-03-30", "level": "MEDIUM", "confidence": 0.74 }
  ]
}`}
          />

          <EndpointCard
            id="spill"
            method="GET"
            path="/api/spill"
            description="Returns active marine pollution and spill incidents derived from vessel anomaly data and environmental monitoring feeds."
            responseType="SpillEvent[]"
            exampleResponse={`[
  {
    "id": "spill-001",
    "severity": "HIGH",
    "lat": 25.1886,
    "lon": 55.1972,
    "region": "PERSIAN GULF",
    "description": "Suspected bunker fuel discharge.",
    "detected_at": "2026-03-27T14:00:00.000+00:00"
  }
]`}
          />

          <EndpointCard
            id="watch"
            method="GET"
            path="/api/watch"
            description="Returns and manages the authenticated user's vessel watchlist. Supports GET to retrieve watched vessels."
            responseType="WatchedVessel[]"
            exampleResponse={`[
  {
    "mmsi": "273272850",
    "name": "GEFEST",
    "added_at": "2026-03-27T10:00:00.000+00:00",
    "last_seen": "2026-03-28T05:38:51.557+00:00"
  }
]`}
          />

          {/* ERROR RESPONSES */}
          <section id="errors" className="scroll-mt-8 mb-16">
            <h2 className="text-[#e2e8f0] text-xl font-bold font-sans mb-6 uppercase tracking-widest border-b border-[#1e3a5f] pb-2">
              ERROR RESPONSES
            </h2>
            <div className="bg-[#0d1520] border border-[#1e3a5f] rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left font-sans text-sm">
                  <thead className="bg-[#1e3a5f] text-[#e2e8f0]">
                    <tr>
                      <th className="px-6 py-4 font-medium uppercase tracking-wider">CODE</th>
                      <th className="px-6 py-4 font-medium uppercase tracking-wider">MEANING</th>
                      <th className="px-6 py-4 font-medium uppercase tracking-wider">BODY</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e3a5f] bg-[#0a0f14]">
                    <tr>
                      <td className="px-6 py-4 text-[#10b981] font-mono font-bold">200</td>
                      <td className="px-6 py-4 text-[#e2e8f0]">Success</td>
                      <td className="px-6 py-4 text-[#475569] font-mono">Array or object</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 text-[#f97316] font-mono font-bold">400</td>
                      <td className="px-6 py-4 text-[#e2e8f0]">Bad Request</td>
                      <td className="px-6 py-4 text-[#475569] font-mono">{'{ "error": "...", "message": "..." }'}</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 text-[#eab308] font-mono font-bold">429</td>
                      <td className="px-6 py-4 text-[#e2e8f0]">Rate Limited</td>
                      <td className="px-6 py-4 text-[#475569] font-mono">{'{ "error": "Rate limit exceeded..." }'}</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 text-[#ef4444] font-mono font-bold">500</td>
                      <td className="px-6 py-4 text-[#e2e8f0]">Server Error</td>
                      <td className="px-6 py-4 text-[#475569] font-mono">{'{ "error": "Internal server error" }'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="px-6 py-4 bg-[#0d1520] border-t border-[#1e3a5f]">
                <p className="text-[#64748b] text-sm leading-relaxed">
                  <strong className="text-[#e2e8f0] font-sans pr-2 uppercase">Note:</strong> 
                  All endpoints return HTTP 200 with an empty array [] on database errors to prevent client-side failures.
                </p>
              </div>
            </div>
          </section>

        </div>
      </main>
    </div>
  )
}
