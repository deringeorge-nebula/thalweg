'use client';

import React, { useState, useEffect, useCallback } from 'react';

const REGIONS = [
  'GLOBAL',
  'INDIAN OCEAN',
  'RED SEA',
  'PERSIAN GULF',
  'MEDITERRANEAN',
  'ATLANTIC',
  'PACIFIC'
] as const;

type Region = typeof REGIONS[number];

interface RiskEvent {
  id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'DARK FLEET' | 'ANOMALY' | 'ROUTE RISK' | 'SANCTIONS' | 'PIRACY';
  title: string;
  region: string;
  detail: string;
  timestamp: string;
  mmsi?: string;
  lat?: number;
  lon?: number;
}

interface IntelBrief {
  id: string
  title: string
  summary: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  region: string
  category: string
  published_at: string
}

function getRelativeTime(isoRaw: string): string {
  const ts = new Date(isoRaw).getTime();
  if (isNaN(ts)) return 'unknown time';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'just now';
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m} minute${m !== 1 ? 's' : ''} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h !== 1 ? 's' : ''} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d !== 1 ? 's' : ''} ago`;
}


function getSeverityPill(severity: RiskEvent['severity'] | IntelBrief['severity']): string {
  switch (severity) {
    case 'CRITICAL': return 'bg-[#ef4444] text-white';
    case 'HIGH': return 'bg-[#f97316] text-white';
    case 'MEDIUM': return 'bg-[#00d4ff] text-[#0a0f1e]';
    case 'LOW': return 'bg-[#1a2744] text-slate-400';
    default: return 'bg-[#1a2744] text-slate-400';
  }
}

function getCategoryClasses(category: string): string {
  switch (category) {
    case 'DARK FLEET': return 'text-[#8b5cf6] border-[#8b5cf6]';
    case 'ANOMALY': return 'text-[#00d4ff] border-[#00d4ff]';
    case 'ROUTE RISK': return 'text-[#f97316] border-[#f97316]';
    case 'SANCTIONS': return 'text-[#ef4444] border-[#ef4444]';
    case 'PIRACY': return 'text-[#f97316] border-[#f97316]';
    case 'PORT CONGESTION': return 'text-[#06b6d4] border-[#06b6d4]';
    case 'ENVIRONMENTAL': return 'text-[#10b981] border-[#10b981]';
    default: return 'text-slate-400 border-slate-400';
  }
}



export default function IntelligenceFeed() {
  const [activeRegion, setActiveRegion] = useState<Region>('GLOBAL');
  const [events, setEvents] = useState<RiskEvent[]>([]);
  const [briefs, setBriefs] = useState<IntelBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchFeeds = useCallback(async () => {
    try {
      const [anomaliesRes, darkfleetRes, piracyRes, stsRes] = await Promise.allSettled([
        fetch('/api/anomalies', { cache: 'no-store' }),
        fetch('/api/darkfleet', { cache: 'no-store' }),
        fetch('/api/piracy', { cache: 'no-store' }),
        fetch('/api/sts', { cache: 'no-store' }),
      ])

      const anomalyEvents: RiskEvent[] =
        anomaliesRes.status === 'fulfilled' && anomaliesRes.value.ok
          ? await anomaliesRes.value.json()
          : []

      const darkfleetEvents: RiskEvent[] =
        darkfleetRes.status === 'fulfilled' && darkfleetRes.value.ok
          ? await darkfleetRes.value.json()
          : []

      const piracyEvents: RiskEvent[] =
        piracyRes.status === 'fulfilled' && piracyRes.value.ok
          ? await piracyRes.value.json() : []

      const stsEvents: RiskEvent[] =
        stsRes.status === 'fulfilled' && stsRes.value.ok
          ? await stsRes.value.json() : []

      const merged: RiskEvent[] = [
        ...darkfleetEvents,
        ...stsEvents,
        ...piracyEvents,
        ...anomalyEvents,
      ].sort((a, b) => {
        const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
        return order[a.severity] - order[b.severity]
      })

      setEvents(merged)

      const briefsRes = await fetch('/api/intelligence-briefs', { cache: 'no-store' })
      const briefsData: IntelBrief[] = briefsRes.ok
        ? await briefsRes.json()
        : []
      setBriefs(briefsData)

      setIsError(false)
    } catch {
      setIsError(true)
    }
  }, []);

  useEffect(() => {
    fetchFeeds().finally(() => setLoading(false));
  }, [fetchFeeds]);

  useEffect(() => {
    const fetchInterval = setInterval(() => {
      fetchFeeds();
    }, 60000);

    const countInterval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) return 60;
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(fetchInterval);
      clearInterval(countInterval);
    };
  }, [fetchFeeds]);

  const filteredEvents = activeRegion === 'GLOBAL'
    ? events
    : events.filter((e) => e.region.includes(activeRegion));

  const filteredBriefs = activeRegion === 'GLOBAL'
    ? briefs
    : briefs.filter((b) => b.region === activeRegion);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 w-full flex flex-col min-h-screen">
      <div className="overflow-x-auto no-scrollbar mb-6 border-b border-[#1a2744] pb-2">
        <div className="flex space-x-2 w-max">
          {REGIONS.map((region) => (
            <button
              key={region}
              onClick={() => setActiveRegion(region)}
              className={`touch-manipulation rounded-none px-4 py-2 font-mono tracking-widest text-xs transition-colors ${activeRegion === region
                  ? 'bg-[#00d4ff] text-[#0a0f1e]'
                  : 'border border-[#1a2744] text-slate-400 hover:border-[#00d4ff] hover:text-[#00d4ff]'
                }`}
            >
              {region}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-6 flex-grow">
        <div className="flex flex-col space-y-4">
          <div className="flex justify-between items-center border-b border-[#1a2744] pb-2">
            <span className="font-mono tracking-widest text-xs text-slate-400">ACTIVE RISK FEED</span>
            <div className="flex items-center space-x-2">
              {isError && <span className="text-[#f97316] font-mono tracking-widest text-[10px]">⚠ FEED INTERRUPTED</span>}
              <span className="font-mono tracking-widest text-xs text-slate-400">REFRESH IN {countdown}s</span>
            </div>
          </div>

          <div className="flex flex-col space-y-3">
            {loading ? (
              <>
                <div className="animate-pulse bg-[#0d1424] border border-[#1a2744] h-20 w-full" />
                <div className="animate-pulse bg-[#0d1424] border border-[#1a2744] h-24 w-full" />
                <div className="animate-pulse bg-[#0d1424] border border-[#1a2744] h-20 w-full" />
              </>
            ) : filteredEvents.length === 0 ? (
              <div className="text-center py-8 text-slate-500 font-mono tracking-widest text-xs">
                NO ACTIVE ALERTS FOR THIS REGION
              </div>
            ) : (
              filteredEvents.map(event => (
                <div key={event.id} className="bg-[#0d1424] border border-[#1a2744] hover:border-[#00d4ff] transition-colors cursor-default p-4 rounded-none">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className={`font-mono tracking-widest text-[10px] px-2 py-0.5 ${getSeverityPill(event.severity)}`}>
                      {event.severity}
                    </span>
                    <span className={`border border-current font-mono tracking-widest text-[10px] px-2 py-0.5 ${getCategoryClasses(event.category)}`}>
                      {event.category}
                    </span>
                  </div>
                  <div className="text-white font-mono text-sm uppercase">
                    {event.title}
                  </div>
                  <div className="text-slate-300 text-xs mt-1">
                    {event.detail}
                  </div>
                  <div className="text-slate-500 text-xs mt-1 font-mono tracking-widest uppercase">
                    {event.region} · {mounted ? new Date(event.timestamp).toLocaleString() : '...'}
                  </div>
                  {event.mmsi && (
                    <div className="text-[#00d4ff] text-xs mt-1 font-mono tracking-widest uppercase">
                      MMSI: {event.mmsi}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex flex-col space-y-4 mt-6 sm:mt-0">
          <div className="border-b border-[#1a2744] pb-2">
            <span className="font-mono tracking-widest text-xs text-slate-400">INTELLIGENCE BRIEFS</span>
          </div>

          <div className="flex flex-col space-y-3">
            {filteredBriefs.length === 0 ? (
              <div className="text-center py-8 text-slate-500 font-mono tracking-widest text-xs">
                NO BRIEFS FOR THIS REGION
              </div>
            ) : (
              filteredBriefs.map(brief => (
                <div key={brief.id} className="bg-[#0d1424] border border-[#1a2744] hover:border-[#00d4ff]/50 transition-colors cursor-default p-4 rounded-none">
                  <div className="flex items-center space-x-2">
                    <span className={`border border-current font-mono tracking-widest text-[10px] px-2 py-0.5 ${getCategoryClasses(brief.category)}`}>
                      {brief.category}
                    </span>
                    <span className={`font-mono tracking-widest text-[10px] px-2 py-0.5 ${getSeverityPill(brief.severity)}`}>
                      {brief.severity}
                    </span>
                  </div>
                  <div className="text-white font-mono text-sm leading-snug mt-2">
                    {brief.title}
                  </div>
                  <div className="text-slate-300 text-xs leading-relaxed mt-2">
                    {brief.summary}
                  </div>

                  <div className="border-t border-[#1a2744] mt-3 pt-2">
                    <div className="text-slate-500 text-[10px] font-mono tracking-widest uppercase">
                      CLASSIFICATION: UNCLASSIFIED // OPEN SOURCE
                    </div>
                    <div className="text-slate-500 text-[10px] font-mono mt-1 uppercase">
                      Published: {mounted ? getRelativeTime(brief.published_at) : '...'} · {brief.region}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-[#1a2744] pt-3 mt-4 w-full">
        <div className="text-center font-mono tracking-widest text-[10px] text-slate-600">
          DATA SOURCES: AISSTREAM.IO · OPENSANCTIONS · IMB PIRACY REPORTING CENTRE · GLOBAL FISHING WATCH · COPERNICUS MARINE SERVICE
        </div>
      </div>
    </div>
  );
}
