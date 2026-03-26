// src/hooks/useVesselStream.ts
// Maintains vessel state in a useRef Map — zero re-renders on incoming AIS data.
// The 500ms batch timer in GlobeView reads from vesselMapRef.

'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { VesselRow } from '@/types/vessel';

const REALTIME_CONNECTION_LIMIT = 180; // Supabase free tier is 200; use 180 as ceiling
const POLLING_INTERVAL_MS = 30_000;
const INITIAL_FETCH_LIMIT = 50_000;

export function useVesselStream() {
    const supabase = createClient();
    const vesselMapRef = useRef<Map<string, VesselRow>>(new Map());
    const realtimeActiveRef = useRef(false);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [dataFreshness, setDataFreshness] = useState<Date | null>(null);

    // ── Initial bulk fetch ─────────────────────────────────────────────────────
    useEffect(() => {
        async function initialLoad() {
            let page = 0
            const pageSize = 10000
            let hasMore = true

            while (hasMore) {
                const { data, error } = await supabase
                    .from('vessels')
                    .select(`mmsi, vessel_name, type_category, type_color,
                 lat, lon, sog, cog, nav_status, is_active,
                 is_anomaly, anomaly_type, sanctions_match, 
                 dark_fleet_score, last_update`)
                    .eq('is_active', true)
                    .not('lat', 'is', null)
                    .range(page * pageSize, (page + 1) * pageSize - 1)
                    .order('last_update', { ascending: false })

                if (error || !data || data.length === 0) {
                    hasMore = false
                    break
                }

                // Merge into vesselMapRef
                for (const vessel of data) {
                    vesselMapRef.current.set(vessel.mmsi, vessel as any)
                }

                if (data.length < pageSize) {
                    hasMore = false
                } else {
                    page++
                }

                // Safety cap: max 5 pages = 50,000 vessels
                if (page >= 5) hasMore = false
            }

            setTotalCount(vesselMapRef.current.size);
            setDataFreshness(new Date());
            setIsLoading(false);
        }

        initialLoad()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Supabase Realtime subscription ───────────────────────────────────────
    useEffect(() => {
        const channel = supabase
            .channel('vessels-realtime', {
                config: { broadcast: { self: false } },
            })
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'vessels' },
                (payload) => {
                    realtimeActiveRef.current = true;

                    if (payload.eventType === 'DELETE') {
                        vesselMapRef.current.delete((payload.old as VesselRow).mmsi);
                    } else {
                        const vessel = (payload.new || payload.old) as VesselRow;
                        if (vessel?.mmsi) {
                            vesselMapRef.current.set(vessel.mmsi, vessel);
                        }
                    }

                    setTotalCount(vesselMapRef.current.size);
                    setDataFreshness(new Date());
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    realtimeActiveRef.current = true;
                }
                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    realtimeActiveRef.current = false;
                    console.warn('[useVesselStream] Realtime unavailable — polling fallback active');
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // ── 30-second REST polling fallback ────────────────────────────────────────
    // Activates automatically when Realtime is not working.
    // Also runs always to catch vessels that Realtime missed.
    useEffect(() => {
        const poll = async () => {
            const since = new Date(Date.now() - POLLING_INTERVAL_MS * 2).toISOString();

            const { data, error } = await supabase
                .from('vessels')
                .select('mmsi,vessel_name,type_category,type_color,lat,lon,sog,cog,nav_status,is_active,is_anomaly,sanctions_match,dark_fleet_score,last_update')
                .eq('is_active', true)
                .gte('last_update', since)
                .not('lat', 'is', null)
                .limit(5000);

            if (error || !data) return;

            data.forEach((v) => {
                const existing = vesselMapRef.current.get(v.mmsi);
                // Merge — preserve existing fields not included in the polling select
                vesselMapRef.current.set(v.mmsi, { ...existing, ...v } as VesselRow);
            });

            setTotalCount(vesselMapRef.current.size);
            setDataFreshness(new Date());
        };

        const interval = setInterval(poll, POLLING_INTERVAL_MS);
        return () => clearInterval(interval);
    }, []);

    return {
        vesselMapRef,
        totalCount,
        isLoading,
        dataFreshness,
        realtimeActiveRef,
    };
}
