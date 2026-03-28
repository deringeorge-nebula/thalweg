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

interface Brief {
  id: string;
  region: string;
  category: 'DARK FLEET' | 'PORT CONGESTION' | 'SANCTIONS' | 'PIRACY' | 'ENVIRONMENTAL';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  headline: string;
  summary: string;
  vessels?: string[];
  ports?: string[];
  publishedAt: string;
  classification: 'UNCLASSIFIED // OPEN SOURCE';
}

const STATIC_BRIEFS: Brief[] = [
  {
    id: 'ib-001',
    region: 'RED SEA',
    category: 'PIRACY',
    severity: 'HIGH',
    headline: 'Houthi Interdiction Activity — Bab-el-Mandeb Strait',
    summary: 'Vessel traffic through the Bab-el-Mandeb Strait remains elevated risk. AIS analysis indicates continued rerouting via Cape of Good Hope for VLCC and container traffic exceeding 300m LOA. Transit delays of 12–18 days above baseline observed across affected routes. Vessels with Israeli beneficial ownership or port calls continue to represent primary targeting criteria.',
    ports: ['Aden', 'Djibouti', 'Jeddah'],
    publishedAt: '2026-03-28T06:00:00Z',
    classification: 'UNCLASSIFIED // OPEN SOURCE'
  },
  {
    id: 'ib-002',
    region: 'PERSIAN GULF',
    category: 'DARK FLEET',
    severity: 'CRITICAL',
    headline: 'Shadow Fleet STS Activity — Gulf of Oman Anchorage Zone',
    summary: 'Sustained ship-to-ship transfer activity observed at established anchorage coordinates in the Gulf of Oman. Vessel behavioral analysis indicates AIS manipulation consistent with Iranian crude oil export evasion. Four vessels with expired or suspended class certificates identified operating within the transfer zone over the past 72 hours. Cross-reference against OFAC SDN and EU sanctions lists ongoing.',
    vessels: ['UNKNOWN-01', 'UNKNOWN-02'],
    ports: ['Khor Fakkan', 'Fujairah'],
    publishedAt: '2026-03-27T18:00:00Z',
    classification: 'UNCLASSIFIED // OPEN SOURCE'
  },
  {
    id: 'ib-003',
    region: 'INDIAN OCEAN',
    category: 'PORT CONGESTION',
    severity: 'MEDIUM',
    headline: 'Colombo Terminal Congestion — Inbound Vessel Pipeline Elevated',
    summary: 'Inbound vessel density within 50nm of Colombo Port has increased 18% above the 30-day baseline. Container feeder vessels represent the primary congestion driver. Current anchorage wait times estimated at 28–36 hours for non-priority berths. Colombo serves as the primary transshipment hub for South Asian container traffic — downstream schedule impacts expected across Visakhapatnam, Chennai, and Kochi feeders.',
    ports: ['Colombo', 'Visakhapatnam', 'Chennai', 'Kochi'],
    publishedAt: '2026-03-28T09:00:00Z',
    classification: 'UNCLASSIFIED // OPEN SOURCE'
  },
  {
    id: 'ib-004',
    region: 'PACIFIC',
    category: 'ENVIRONMENTAL',
    severity: 'MEDIUM',
    headline: 'IUU Fishing Activity — Western Pacific MPA Boundary Violations',
    summary: 'AIS gap analysis across Western Pacific Marine Protected Areas indicates 6 fishing vessels with unexplained dark periods coinciding with MPA boundary crossings over the past 7 days. Vessel flag states: 3 China, 2 unregistered, 1 flag-of-convenience (Panama). Behavioral fingerprinting suggests repeat offenders — prior AIS dark events recorded at the same MPA coordinates in January 2026.',
    publishedAt: '2026-03-27T12:00:00Z',
    classification: 'UNCLASSIFIED // OPEN SOURCE'
  }
];

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

function deriveRegion(lat?: number, lon?: number): string {
  if (lat === undefined || lon === undefined) return 'GLOBAL';
  if (lat > 30 && lat < 47 && lon > -6 && lon < 36) return 'MEDITERRANEAN';
  if (lat > 12 && lat < 30 && lon > 32 && lon < 44) return 'RED SEA';
  if (lat > 23 && lat < 30 && lon > 48 && lon < 57) return 'PERSIAN GULF';
  if (lat > -40 && lat < 30 && lon > 40 && lon < 100) return 'INDIAN OCEAN';
  if (lon > -80 && lon < 20 && lat > -60 && lat < 70) return 'ATLANTIC';
  if (lon < -80 || lon > 100) return 'PACIFIC';
  return 'GLOBAL';
}

function getSeverityPill(severity: RiskEvent['severity'] | Brief['severity']): string {
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

function getAnomalySeverity(type?: string): RiskEvent['severity'] {
  if (!type) return 'MEDIUM';
  const t = type.toUpperCase();
  if (t.includes('CRITICAL')) return 'CRITICAL';
  if (t.includes('HIGH')) return 'HIGH';
  if (t.includes('LOW')) return 'LOW';
  return 'MEDIUM';
}

// Ensure proper internal types matching API expected
interface RawApiRecord {
  id?: string;
  title?: string;
  detail?: string;
  description?: string;
  type?: string;
  timestamp?: string;
  createdAt?: string;
  lat?: number;
  lon?: number;
  mmsi?: string;
}

export default function IntelligenceFeed() {
  const [activeRegion, setActiveRegion] = useState<Region>('GLOBAL');
  const [events, setEvents] = useState<RiskEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchFeeds = useCallback(async () => {
    let threwError = false;
    let hasData = false;
    let newEvents: RiskEvent[] = [];

    try {
      const [anomaliesRes, darkFleetRes] = await Promise.all([
        fetch('/api/anomalies').catch(() => null),
        fetch('/api/darkfleet').catch(() => null)
      ]);

      if (!anomaliesRes || !anomaliesRes.ok || !darkFleetRes || !darkFleetRes.ok) {
        threwError = true;
      }

      const parseResponse = async (res: Response | null) => {
        if (!res || !res.ok) return [];
        try {
          const text = await res.text();
          if (!text) return [];
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) return parsed;
          if (parsed && Array.isArray(parsed.data)) return parsed.data;
          if (parsed && Array.isArray(parsed.events)) return parsed.events;
          return [];
        } catch {
          return [];
        }
      };

      const anomaliesData = await parseResponse(anomaliesRes);
      if (anomaliesData.length > 0) {
        hasData = true;
        const mapped = anomaliesData.map((item: RawApiRecord) => ({
          id: item.id || `anon-${Math.random().toString(36).substring(2, 9)}`,
          severity: getAnomalySeverity(item.type),
          category: 'ANOMALY' as const,
          title: item.title || item.type || 'UNKNOWN ANOMALY',
          region: deriveRegion(item.lat, item.lon),
          detail: item.detail || item.description || 'Anomaly detected',
          timestamp: item.timestamp || item.createdAt || new Date().toISOString(),
          mmsi: item.mmsi,
          lat: item.lat,
          lon: item.lon
        }));
        newEvents = [...newEvents, ...mapped];
      }

      const darkFleetData = await parseResponse(darkFleetRes);
      if (darkFleetData.length > 0) {
        hasData = true;
        const mapped = darkFleetData.map((item: RawApiRecord) => ({
          id: item.id || `df-${Math.random().toString(36).substring(2, 9)}`,
          severity: 'HIGH' as const,
          category: 'DARK FLEET' as const,
          title: item.title || 'DARK FLEET ACTIVITY',
          region: deriveRegion(item.lat, item.lon),
          detail: item.detail || item.description || 'Dark fleet vessel detected',
          timestamp: item.timestamp || item.createdAt || new Date().toISOString(),
          mmsi: item.mmsi,
          lat: item.lat,
          lon: item.lon
        }));
        newEvents = [...newEvents, ...mapped];
      }

      if (hasData) {
        newEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setEvents(newEvents);
      }
    } catch {
      threwError = true;
    }
    
    setIsError(threwError);
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
    ? STATIC_BRIEFS
    : STATIC_BRIEFS.filter((b) => b.region === activeRegion);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 w-full flex flex-col min-h-screen">
      <div className="overflow-x-auto no-scrollbar mb-6 border-b border-[#1a2744] pb-2">
        <div className="flex space-x-2 w-max">
          {REGIONS.map((region) => (
            <button 
              key={region} 
              onClick={() => setActiveRegion(region)}
              className={`touch-manipulation rounded-none px-4 py-2 font-mono tracking-widest text-xs transition-colors ${
                activeRegion === region 
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
                       {brief.headline}
                     </div>
                     <div className="text-slate-300 text-xs leading-relaxed mt-2">
                       {brief.summary}
                     </div>
                     
                     <div className="border-t border-[#1a2744] mt-3 pt-2">
                       <div className="text-slate-500 text-[10px] font-mono tracking-widest uppercase">
                         CLASSIFICATION: {brief.classification}
                       </div>
                       <div className="text-slate-500 text-[10px] font-mono mt-1 uppercase">
                         Published: {mounted ? getRelativeTime(brief.publishedAt) : '...'} · {brief.region}
                       </div>
                       
                       {(brief.ports?.length || brief.vessels?.length) ? (
                         <div className="mt-2 space-y-1 block">
                           {brief.ports && brief.ports.length > 0 && (
                             <div className="block">
                               <span className="text-slate-500 text-[10px] font-mono mr-1">PORTS:</span>
                               {brief.ports.map(port => (
                                 <span key={port} className="border border-[#1a2744] text-[10px] text-slate-400 font-mono px-1.5 py-0.5 inline-block mr-1">
                                   {port.toUpperCase()}
                                 </span>
                               ))}
                             </div>
                           )}
                           {brief.vessels && brief.vessels.length > 0 && (
                             <div className="block mt-1">
                               <span className="text-slate-500 text-[10px] font-mono mr-1">VESSELS:</span>
                               {brief.vessels.map(v => (
                                 <span key={v} className="border border-[#1a2744] text-[10px] text-slate-400 font-mono px-1.5 py-0.5 inline-block mr-1">
                                   {v.toUpperCase()}
                                 </span>
                               ))}
                             </div>
                           )}
                         </div>
                       ) : null}
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
