import Link from 'next/link';

export default function PricingPage() {
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
        <Link 
          href="/" 
          className="text-[#00d4ff] text-xs font-data hover:underline cursor-pointer"
        >
          ← LIVE GLOBE
        </Link>
      </header>

      {/* HERO SECTION */}
      <section className="pt-32 pb-16 text-center px-6">
        <h1 className="font-data text-4xl font-bold text-white tracking-widest">
          INTELLIGENCE PRICING
        </h1>
        <p className="mt-4 text-slate-400 text-lg max-w-2xl mx-auto">
          Thalweg is free for public use. The tiers below reflect access levels for institutional and commercial operators.
        </p>
        <div className="mt-6 bg-[#0d1424] border border-[#1a2744] rounded-lg inline-block px-6 py-3">
          <p className="font-data text-sm text-slate-300">
            Palantir Maritime: $5M/yr  ·  Lloyd&apos;s List: $50K/yr  ·  Thalweg: starts free
          </p>
        </div>
      </section>

      {/* PRICING CARDS */}
      <section className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto px-6">
        
        {/* CARD 1 — PUBLIC */}
        <div className="bg-[#0d1424] border border-[#1a2744] rounded-xl p-8 flex flex-col">
          <h2 className="text-slate-400 text-xs font-data tracking-widest">PUBLIC</h2>
          <div className="text-5xl font-bold text-white font-data mt-2">FREE</div>
          <p className="text-slate-500 text-sm mt-1">forever</p>
          
          <div className="border-t border-[#1a2744] my-6"></div>
          
          <ul className="space-y-3 flex-grow">
            {[
              "Live 3D vessel globe (40,000+ vessels)",
              "Dark fleet detection layer",
              "Sanctions + anomaly indicators",
              "Port congestion intelligence",
              "Piracy incident tracking",
              "Route risk overlay",
              "Vessel search and watch alerts",
              "No account required"
            ].map((feature, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-[#00d4ff] text-sm flex-shrink-0">✓</span>
                <span className="text-slate-300 text-sm">{feature}</span>
              </li>
            ))}
          </ul>
          
          <Link 
            href="/" 
            className="w-full mt-8 py-3 rounded border border-[#00d4ff]/30 text-[#00d4ff] text-sm font-data text-center hover:bg-[#00d4ff]/10 transition-colors block"
          >
            OPEN GLOBE →
          </Link>
        </div>

        {/* CARD 2 — RESEARCHER (HIGHLIGHTED) */}
        <div className="bg-[#0d1424] border-2 border-[#00d4ff] rounded-xl p-8 relative flex flex-col">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#00d4ff] text-[#0a0f1e] text-[10px] font-data font-bold px-3 py-1 rounded-full tracking-widest whitespace-nowrap">
            MOST REQUESTED
          </div>
          
          <h2 className="text-[#00d4ff] text-xs font-data tracking-widest">RESEARCHER / NGO</h2>
          <div className="text-5xl font-bold text-white font-data mt-2">$0</div>
          <p className="text-slate-500 text-sm mt-1">apply for access</p>
          
          <div className="border-t border-[#1a2744] my-6"></div>
          
          <ul className="space-y-3 flex-grow">
            {[
              "Everything in Public",
              "Full REST API access (rate limits apply)",
              "Bulk vessel data export (CSV)",
              "Historical anomaly dataset access",
              "Priority email support",
              "Academic citation assistance",
              "Required: attribution + non-commercial use"
            ].map((feature, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-[#00d4ff] text-sm flex-shrink-0">✓</span>
                <span className="text-slate-300 text-sm">{feature}</span>
              </li>
            ))}
          </ul>
          
          <Link 
            href="/demo" 
            className="w-full mt-8 py-3 rounded bg-[#00d4ff] text-[#0a0f1e] text-sm font-data font-bold text-center hover:bg-[#00d4ff]/80 transition-colors block"
          >
            REQUEST ACCESS →
          </Link>
        </div>

        {/* CARD 3 — ENTERPRISE */}
        <div className="bg-[#0d1424] border border-[#1a2744] rounded-xl p-8 flex flex-col">
          <h2 className="text-slate-400 text-xs font-data tracking-widest">ENTERPRISE</h2>
          <div className="text-5xl font-bold text-white font-data mt-2">CONTACT</div>
          <p className="text-slate-500 text-sm mt-1">custom pricing</p>
          
          <div className="border-t border-[#1a2744] my-6"></div>
          
          <ul className="space-y-3 flex-grow">
            {[
              "Everything in Researcher",
              "Unlimited API access + custom rate limits",
              "On-premises deployment option",
              "Custom sanctions list integration",
              "SLA with 99.9% uptime guarantee",
              "Dedicated support channel",
              "White-label licensing available",
              "Integration with existing GMDSS/VMS systems"
            ].map((feature, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-[#00d4ff] text-sm flex-shrink-0">✓</span>
                <span className="text-slate-300 text-sm">{feature}</span>
              </li>
            ))}
          </ul>
          
          <Link 
            href="/demo" 
            className="w-full mt-8 py-3 rounded border border-[#1a2744] text-slate-300 text-sm font-data text-center hover:border-[#00d4ff] hover:text-[#00d4ff] transition-colors block"
          >
            SCHEDULE DEMO →
          </Link>
        </div>

      </section>

      {/* BOTTOM SECTION */}
      <section className="mt-24 text-center px-6">
        <h3 className="text-slate-500 text-xs font-data tracking-widest mb-8">USED FOR</h3>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
          {[
            "Port Authority Operations",
            "P&I Club Risk Assessment",
            "Maritime NGO Research",
            "Academic Oceanography",
            "Sanctions Compliance",
            "Environmental Monitoring",
            "Naval Architecture Research",
            "Investigative Journalism"
          ].map((useCase, i) => (
            <div key={i} className="bg-[#0d1424] border border-[#1a2744] rounded-lg p-4 text-center text-slate-400 text-xs font-data">
              {useCase}
            </div>
          ))}
        </div>

        {/* OPEN SOURCE NOTE */}
        <div className="mt-16 max-w-2xl mx-auto bg-[#0d1424] border border-[#1a2744] rounded-lg p-6 text-left">
          <h4 className="text-[#00d4ff] text-xs font-data tracking-widest mb-2">OPEN SOURCE</h4>
          <p className="text-slate-400 text-sm">
            Thalweg is AGPL-3.0 licensed. The full source is available on GitHub. Self-hosting is permitted and encouraged — the tiers above reflect hosted service access and support, not the software itself.
          </p>
          <a 
            href="https://github.com/deringeorge-nebula/thalweg" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="inline-block mt-3 text-[#00d4ff] text-xs font-data hover:underline"
          >
            View source on GitHub →
          </a>
        </div>
      </section>

    </div>
  );
}
