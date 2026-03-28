import React from 'react';
import IntelligenceFeed from '@/components/intelligence/IntelligenceFeed';

export const metadata = {
  title: 'Maritime Intelligence | Thalweg',
  description: 'Real-time global maritime risk assessment. Dark fleet activity, route threats, port congestion alerts, and sanctioned vessel tracking.'
};

export default function MaritimeIntelligencePage() {
  return (
    <div className="bg-[#0a0f1e] min-h-screen">
      <div className="border-b border-[#1a2744]">
        <div className="flex justify-between items-center px-4 py-3 max-w-7xl mx-auto w-full">
          <div className="font-mono tracking-widest text-white text-xs sm:text-sm">
            MARITIME INTELLIGENCE
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-[#00d4ff] text-[10px] animate-pulse">● LIVE</span>
            <span className="text-slate-400 text-xs font-mono tracking-widest hidden sm:inline">
              THALWEG GLOBAL RISK ASSESSMENT
            </span>
          </div>
        </div>
      </div>
      <IntelligenceFeed />
    </div>
  );
}
