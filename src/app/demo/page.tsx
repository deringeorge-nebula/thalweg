import React from 'react'
import DemoRequestForm from '@/components/demo/DemoRequestForm'

export const metadata = {
  title: 'Request a Demo | Thalweg',
  description: 'Request a live demonstration of Thalweg maritime intelligence platform for your organization.',
}

export default function DemoPage() {
  return (
    <div className="bg-[#0a0f1e] min-h-screen sm:grid sm:grid-cols-2">
      {/* LEFT COLUMN */}
      <div className="sm:sticky sm:top-0 sm:h-screen flex flex-col justify-between bg-[#0d1424] border-r border-[#1a2744] px-8 py-12">
        <div>
          <div className="font-mono tracking-widest text-[#00d4ff] text-[10px] mb-6">
            THALWEG INTELLIGENCE PLATFORM
          </div>
          <h1 className="font-mono tracking-widest text-white text-2xl sm:text-3xl leading-tight">
            Request Access
          </h1>
          <p className="text-slate-300 text-sm font-mono tracking-widest leading-relaxed mt-4">
            Thalweg provides real-time maritime intelligence for port authorities, sanctions analysts, and maritime security teams.
          </p>

          <div className="mt-8 space-y-3">
            {[
              "Live vessel tracking — 50,000+ vessels globally",
              "Dark fleet & AIS manipulation detection",
              "Sanctioned vessel cross-reference (OFAC · EU · UN)",
              "Predictive port congestion — 72-hour outlook",
              "Piracy & maritime security incident layer",
              "Embeddable widget for your internal tools"
            ].map((item, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 bg-[#00d4ff] flex-shrink-0 mt-1.5 rounded-none"></div>
                <div className="text-slate-300 text-xs font-mono tracking-widest leading-relaxed">
                  {item}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-[#1a2744] pt-6 mt-12 sm:mt-auto">
          <div className="font-mono tracking-widest text-[10px] text-slate-500">
            CLASSIFICATION: UNCLASSIFIED // OPEN SOURCE
          </div>
          <div className="font-mono tracking-widest text-[10px] text-slate-600 mt-1">
            Data sources: AISStream · OpenSanctions · IMB · GFW · Copernicus
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN */}
      <div className="px-6 sm:px-8 py-12">
        <DemoRequestForm />
      </div>
    </div>
  )
}
