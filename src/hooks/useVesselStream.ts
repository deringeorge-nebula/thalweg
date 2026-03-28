// src/hooks/useVesselStream.ts
// Maintains vessel state in a useRef Map — zero re-renders on incoming AIS data.
// The 500ms batch timer in GlobeView reads from vesselMapRef.

'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { VesselRow } from '@/types/vessel';

const REALTIME_CONNECTION_LIMIT = 180;
const POLLING_INTERVAL_MS = 30_000;
const INITIAL_FETCH_LIMIT = 10_000;

export function useVesselStream() {
    const supabase = useMemo(() => createClient(), []);
    const vesselMapRef = useRef<Map<string, VesselRow>>(new Map());
    const realtimeActiveRef = useRef(false);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [dataFreshness, setDataFreshness] = useState<Date | null>(null);

    // ── Initial bulk fetch ─────────────────────────────────────────────────────
    useEffect(() => {
        async function initialLoad() {
            // PHASE 1 — Priority vessels (dark fleet + anomalies + sanctions)
            const { data: priority } = await supabase
                .from('vessels')
                .select('mmsi, vessel_name, type_category, type_color, lat, lon, sog, cog, nav_status, is_active, is_anomaly, sanctions_match, dark_fleet_score, last_update')
                .eq('is_active', true)
                .not('lat', 'is', null)
                .or('is_anomaly.eq.true,sanctions_match.eq.true,dark_fleet_score.gte.40')
                .order('dark_fleet_score', { ascending: false, nullsFirst: false })
                .limit(500);

            if (priority) {
                for (const vessel of priority as VesselRow[]) {
                    vesselMapRef.current.set(vessel.mmsi, vessel);
                }
            }

            setTotalCount(vesselMapRef.current.size);
            setDataFreshness(new Date());
            setIsLoading(false);

            // PHASE 2 — Bulk load remaining vessels
            let offset = 0;
            const PAGE_SIZE = 5000;

            while (offset < INITIAL_FETCH_LIMIT) {
                if (offset >= INITIAL_FETCH_LIMIT) break;

                const { data: page, error: pageError } = await supabase
                    .from('vessels')
                    .select('mmsi, vessel_name, type_category, type_color, lat, lon, sog, cog, nav_status, is_active, is_anomaly, sanctions_match, dark_fleet_score, last_update')
                    .eq('is_active', true)
                    .not('lat', 'is', null)
                    .order('last_update', { ascending: false })
                    .range(offset, offset + PAGE_SIZE - 1);

                if (pageError || !page || page.length === 0) break;

                for (const vessel of page as VesselRow[]) {
                    if (!vesselMapRef.current.has(vessel.mmsi)) {
                        vesselMapRef.current.set(vessel.mmsi, vessel);
                    }
                }

                setTotalCount(vesselMapRef.current.size);
                setDataFreshness(new Date());

                if (page.length < PAGE_SIZE) break;
                offset += PAGE_SIZE;
            }
        }

        initialLoad();
    }, [supabase]);

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
    }, [supabase]);

    // ── 30-second REST polling fallback ────────────────────────────────────────
    useEffect(() => {
        const poll = async () => {
            const { data, error } = await supabase
                .from('vessels')
                .select('mmsi, vessel_name, type_category, type_color, lat, lon, sog, cog, nav_status, is_active, is_anomaly, sanctions_match, dark_fleet_score, last_update')
                .eq('is_active', true)
                .not('lat', 'is', null)
                .order('last_update', { ascending: false })
                .limit(REALTIME_CONNECTION_LIMIT);

            if (error || !data) return;

            for (const v of data as VesselRow[]) {
                const existing = vesselMapRef.current.get(v.mmsi);
                vesselMapRef.current.set(v.mmsi, { ...existing, ...v } as VesselRow);
            }

            setTotalCount(vesselMapRef.current.size);
            setDataFreshness(new Date());
        };

        const interval = setInterval(poll, POLLING_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [supabase]);

    return {
        vesselMapRef,
        totalCount,
        isLoading,
        dataFreshness,
        realtimeActiveRef,
    };
}
