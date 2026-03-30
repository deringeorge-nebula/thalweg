// src/app/pricing/page.tsx
import React from 'react'
import Link from 'next/link'
import WaitlistForm from '@/components/pricing/WaitlistForm'
import { createClient } from '@supabase/supabase-js'

export const metadata = {
  title: 'Pricing | Thalweg',
  description: 'Maritime intelligence for every operator. Free for researchers and open-source users. Pro and Enterprise tiers for commercial operations.',
}

// Revalidate every 5 minutes — matches congestion cron
export const revalidate = 300

interface PlatformStats {
  vesselCount: number
  darkFleetCount: number
  sanctionsCount: number
  piracyCount: number
  anomalyCount: number
  portCount: number
}

async function getPlatformStats(): Promise<PlatformStats> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.MY_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const [vessels, darkFleet, sanctions, piracy, anomalies, ports] = await Promise.allSettled([
    supabase.from('vessels').select('*', { count: 'exact', head: true }),
    supabase.from('vessels').select('*', { count: 'exact', head: true }).gte('dark_fleet_score', 60),
    supabase.from('vessels').select('*', { count: 'exact', head: true }).eq('sanctions_match', true),
    supabase.from('piracy_incidents').select('*', { count: 'exact', head: true }),
    supabase.from('anomalies').select('*', { count: 'exact', head: true }).eq('resolved', false),
    supabase.from('port_congestion').select('*', { count: 'exact', head: true }),
  ])

  return {
    vesselCount: vessels.status === 'fulfilled' ? (vessels.value.count ?? 0) : 0,
    darkFleetCount: darkFleet.status === 'fulfilled' ? (darkFleet.value.count ?? 0) : 0,
    sanctionsCount: sanctions.status === 'fulfilled' ? (sanctions.value.count ?? 0) : 0,
    piracyCount: piracy.status === 'fulfilled' ? (piracy.value.count ?? 0) : 0,
    anomalyCount: anomalies.status === 'fulfilled' ? (anomalies.value.count ?? 0) : 0,
    portCount: ports.status === 'fulfilled' ? (ports.value.count ?? 0) : 0,
  }
}

export default async function PricingPage() {
  const stats = await getPlatformStats()

  return (
    <div className="bg-[#0a0f1e] min-h-screen px-4 sm:px-8 py-12 sm:py-16">

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <div className="text-center mb-10 sm:mb-12">
        <div className="font-mono tracking-widest text-[#00d4ff] text-[10px] mb-4">
          THALWEG INTELLIGENCE PLATFORM
        </div>
        <h1 className="font-mono tracking-widest text-white text-2xl sm:text-4xl">
          Intelligence Pricing
        </h1>
        <p className="mt-4 max-w-xl mx-auto text-slate-300 font-mono tracking-widest text-xs sm:text-sm leading-relaxed text-center">
          The same intelligence Dryad Global charges $200,000/year for. Free for researchers. Affordable for operators.
        </p>
      </div>

      {/* ── Live Platform Stats Bar ─────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto mb-12 sm:mb-16 border border-[#1a2744] bg-[#0d1424] rounded-none p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse" style={{ boxShadow: '0 0 6px #00ff88' }} />
          <span className="font-mono tracking-widest text-[10px] text-slate-400">LIVE PLATFORM DATA</span>
          <span className="font-mono tracking-widest text-[10px] text-slate-600 ml-auto">refreshes every 5 min</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6">
          <StatBlock
            value={stats.vesselCount.toLocaleString()}
            label="VESSELS TRACKED"
            color="text-[#00d4ff]"
          />
          <StatBlock
            value={stats.darkFleetCount.toLocaleString()}
            label="DARK FLEET ≥60"
            color="text-[#ef4444]"
          />
          <StatBlock
            value={stats.sanctionsCount.toLocaleString()}
            label="SANCTIONS MATCHES"
            color="text-[#f97316]"
          />
          <StatBlock
            value={stats.piracyCount.toLocaleString()}
            label="PIRACY INCIDENTS"
            color="text-[#eab308]"
          />
          <StatBlock
            value={stats.anomalyCount.toLocaleString()}
            label="ACTIVE ANOMALIES"
            color="text-[#a78bfa]"
          />
          <StatBlock
            value={stats.portCount.toLocaleString()}
            label="PORTS MONITORED"
            color="text-[#00ff88]"
          />
        </div>
      </div>

      {/* ── Pricing tiers ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 max-w-5xl mx-auto">

        {/* TIER 1 — FREE */}
        <div className="flex flex-col h-full bg-[#0d1424] border border-[#1a2744] p-6 sm:p-8 rounded-none">
          <div className="pb-6 border-b border-[#1a2744] mb-6">
            <div className="font-mono tracking-widest text-xs text-slate-400">FREE</div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-white font-mono tracking-widest text-3xl">$0</span>
              <span className="text-slate-400 font-mono tracking-widest text-xs">forever</span>
            </div>
            <div className="mt-3 text-slate-300 font-mono tracking-widest text-xs leading-relaxed">
              Full platform access. No account required.
            </div>
          </div>
          <div className="flex-1 space-y-2.5 mb-8">
            <FeatureRow check text={`Live vessel tracking — ${stats.vesselCount > 0 ? stats.vesselCount.toLocaleString() : '50,000+'}  vessels`} accentClass="text-slate-300" />
            <FeatureRow check text={`Port congestion indices — ${stats.portCount > 0 ? stats.portCount : 50} major ports`} accentClass="text-slate-300" />
            <FeatureRow check text="Piracy incident layer (IMB data)" accentClass="text-slate-300" />
            <FeatureRow check text="Dark fleet detection layer" accentClass="text-slate-300" />
            <FeatureRow check text="SST ocean temperature layer" accentClass="text-slate-300" />
            <FeatureRow check text="Vessel sanctions cross-reference" accentClass="text-slate-300" />
            <FeatureRow check text="Embeddable iframe widget" accentClass="text-slate-300" />
            <FeatureRow check text="Public API access (rate limited)" accentClass="text-slate-300" />
            <FeatureRow check={false} text="Watch list sync across devices" accentClass="text-slate-300" />
            <FeatureRow check={false} text="API rate limit increase" accentClass="text-slate-300" />
            <FeatureRow check={false} text="Intelligence brief archive" accentClass="text-slate-300" />
            <FeatureRow check={false} text="Priority data refresh" accentClass="text-slate-300" />
          </div>
          <div className="mt-auto">
            <Link
              href="https://thalweg.vercel.app"
              target="_self"
              className="flex items-center justify-center border border-[#1a2744] text-slate-300 hover:border-[#00d4ff] hover:text-[#00d4ff] transition-colors font-mono tracking-widest text-xs w-full py-3 touch-manipulation rounded-none"
            >
              ACCESS PLATFORM →
            </Link>
          </div>
        </div>

        {/* TIER 2 — PRO */}
        <div className="relative flex flex-col h-full bg-[#0d1424] border border-[#00d4ff] p-6 sm:p-8 mt-4 sm:mt-0 pt-8 sm:pt-10 rounded-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#00d4ff] text-[#0a0f1e] font-mono tracking-widest text-[10px] px-3 py-1 mb-0 whitespace-nowrap rounded-none inline-block">
            MOST POPULAR
          </div>
          <div className="pb-6 border-b border-[#1a2744] mb-6">
            <div className="font-mono tracking-widest text-xs text-[#00d4ff]">PRO</div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-white font-mono tracking-widest text-3xl">$49</span>
              <span className="text-slate-400 font-mono tracking-widest text-xs">/ month</span>
            </div>
            <div className="mt-3 text-slate-300 font-mono tracking-widest text-xs leading-relaxed">
              For maritime analysts and commercial operators.
            </div>
          </div>
          <div className="flex-1 space-y-2.5 mb-8">
            <FeatureRow check text="Everything in Free" accentClass="text-[#00d4ff]" />
            <FeatureRow check text="Watch list sync across devices" accentClass="text-[#00d4ff]" />
            <FeatureRow check text="10× API rate limit" accentClass="text-[#00d4ff]" />
            <FeatureRow check text="Intelligence brief archive (90 days)" accentClass="text-[#00d4ff]" />
            <FeatureRow check text="Priority data refresh (15s vs 30s)" accentClass="text-[#00d4ff]" />
            <FeatureRow check text="Vessel alert notifications (email)" accentClass="text-[#00d4ff]" />
            <FeatureRow check text="CSV export — vessel tracks & port data" accentClass="text-[#00d4ff]" />
            <FeatureRow check={false} text="Custom intelligence feeds" accentClass="text-[#00d4ff]" />
            <FeatureRow check={false} text="Dedicated support" accentClass="text-[#00d4ff]" />
            <FeatureRow check={false} text="White-label embed" accentClass="text-[#00d4ff]" />
          </div>
          <WaitlistForm tier="pro" />
        </div>

        {/* TIER 3 — ENTERPRISE */}
        <div className="flex flex-col h-full bg-[#0d1424] border border-[#1a2744] hover:border-[#8b5cf6] transition-colors p-6 sm:p-8 mt-4 sm:mt-0 rounded-none">
          <div className="pb-6 border-b border-[#1a2744] mb-6">
            <div className="font-mono tracking-widest text-xs text-[#8b5cf6]">ENTERPRISE</div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-white font-mono tracking-widest text-3xl">Custom</span>
              <span className="text-slate-400 font-mono tracking-widest text-xs">pricing</span>
            </div>
            <div className="mt-3 text-slate-300 font-mono tracking-widest text-xs leading-relaxed">
              For port authorities, P&I clubs, and government agencies.
            </div>
          </div>
          <div className="flex-1 space-y-2.5 mb-8">
            <FeatureRow check text="Everything in Pro" accentClass="text-[#8b5cf6]" />
            <FeatureRow check text="Custom intelligence feeds" accentClass="text-[#8b5cf6]" />
            <FeatureRow check text="Dedicated support SLA" accentClass="text-[#8b5cf6]" />
            <FeatureRow check text="White-label embed (your domain)" accentClass="text-[#8b5cf6]" />
            <FeatureRow check text="Unlimited API access" accentClass="text-[#8b5cf6]" />
            <FeatureRow check text="On-premise deployment option" accentClass="text-[#8b5cf6]" />
            <FeatureRow check text="Custom data integrations" accentClass="text-[#8b5cf6]" />
            <FeatureRow check text="Quarterly briefings with analyst" accentClass="text-[#8b5cf6]" />
          </div>
          <div className="mt-auto">
            <Link
              href="/demo"
              className="flex items-center justify-center border border-[#8b5cf6] text-[#8b5cf6] hover:bg-[#8b5cf6] hover:text-white transition-colors font-mono tracking-widest text-xs w-full py-3 touch-manipulation rounded-none"
            >
              REQUEST BRIEFING →
            </Link>
          </div>
        </div>

      </div>

      {/* ── Footer section ───────────────────────────────────────────────────── */}
      <div className="border-t border-[#1a2744] pt-8 mt-16 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          <div>
            <div className="font-mono tracking-widest text-xs text-slate-400 mb-4">COMMON QUESTIONS</div>
            <div className="mb-4">
              <div className="font-mono tracking-widest text-xs text-white mb-1">Is the free tier really free?</div>
              <div className="font-mono tracking-widest text-xs text-slate-400 leading-relaxed">
                Yes. The platform runs on public data sources and open-source infrastructure. No account required, no rate limit on the globe view. API access is rate-limited on free tier.
              </div>
            </div>
            <div className="mb-4">
              <div className="font-mono tracking-widest text-xs text-white mb-1">When does Pro launch?</div>
              <div className="font-mono tracking-widest text-xs text-slate-400 leading-relaxed">
                Pro features are in development. Join the waitlist to be notified at launch and receive early-access pricing.
              </div>
            </div>
            <div className="mb-4">
              <div className="font-mono tracking-widest text-xs text-white mb-1">What counts as Enterprise use?</div>
              <div className="font-mono tracking-widest text-xs text-slate-400 leading-relaxed">
                Port authorities, P&I clubs, shipping companies, government maritime agencies, and NGOs with operational requirements. Contact us via the demo form.
              </div>
            </div>
          </div>
          <div>
            <div className="font-mono tracking-widest text-xs text-slate-400 mb-4">DATA SOURCES</div>
            <div className="text-slate-400 font-mono tracking-widest text-xs mb-3">
              Thalweg aggregates public maritime data from:
            </div>
            <div className="text-slate-300 text-xs font-mono tracking-widest space-y-1">
              <div>· AISStream.io — live vessel telemetry</div>
              <div>· OpenSanctions — OFAC · EU · UN sanctions lists</div>
              <div>· IMB Piracy Reporting Centre — incident data</div>
              <div>· Global Fishing Watch — fishing vessel activity</div>
              <div>· Copernicus Marine Service — ocean conditions</div>
              <div>· NOAA — weather and sea surface temperature</div>
              <div>· MarineRegions.org — EEZ and MPA boundaries</div>
            </div>
            <div className="mt-4 font-mono tracking-widest text-[10px] text-slate-500">
              AGPL-3.0 licensed. Fork it, self-host it, contribute to it.
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatBlock({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className="text-center">
      <div className={`font-mono tracking-widest text-2xl sm:text-3xl font-bold ${color}`}>
        {value}
      </div>
      <div className="font-mono tracking-widest text-[9px] text-slate-500 mt-1">
        {label}
      </div>
    </div>
  )
}

function FeatureRow({ check, text, accentClass }: { check: boolean; text: string; accentClass: string }) {
  return (
    <div className="flex items-start gap-2">
      {check ? (
        <span className={`text-xs font-mono flex-shrink-0 ${accentClass}`}>✓</span>
      ) : (
        <span className="text-slate-600 text-xs font-mono flex-shrink-0">✗</span>
      )}
      <span className={`font-mono tracking-widest text-xs ${check ? 'text-slate-300' : 'text-slate-600'}`}>
        {text}
      </span>
    </div>
  )
}