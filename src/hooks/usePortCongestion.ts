// src/hooks/usePortCongestion.ts
'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface PortWithCongestion {
    id: string;
    name: string;
    country: string;
    lat: number;
    lon: number;
    un_locode: string | null;
    congestion_index: number;
    congestion_status: string;
    active_vessel_count: number;
    inbound_vessel_count: number;
    weighted_vessel_count: number;
    predicted_congestion_24h: number;
    predicted_congestion_48h: number;
    predicted_congestion_72h: number;
    calculated_at: string | null;
}

// Fix 1: type for the Supabase join row — replaces `any` on line 56
interface PortQueryRow {
    id: string;
    name: string;
    country: string;
    lat: number;
    lon: number;
    un_locode: string | null;
    port_congestion: {
        congestion_index: number;
        congestion_status: string;
        active_vessel_count: number;
        inbound_vessel_count: number;
        weighted_vessel_count: number;
        predicted_congestion_24h: number;
        predicted_congestion_48h: number;
        predicted_congestion_72h: number;
        calculated_at: string | null;
    } | {
        congestion_index: number;
        congestion_status: string;
        active_vessel_count: number;
        inbound_vessel_count: number;
        weighted_vessel_count: number;
        predicted_congestion_24h: number;
        predicted_congestion_48h: number;
        predicted_congestion_72h: number;
        calculated_at: string | null;
    }[] | null;
}

export function usePortCongestion() {
    // Fix 2: stable supabase ref — createClient() called once, not on every render
    const supabaseRef = useRef(createClient());
    const [ports, setPorts] = useState<PortWithCongestion[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Fix 3: useCallback makes fetchPorts stable — safe to add to useEffect deps
    const fetchPorts = useCallback(async () => {
        const { data, error } = await supabaseRef.current
            .from('ports')
            .select(`
        id, name, country, lat, lon, un_locode,
        port_congestion (
          congestion_index,
          congestion_status,
          active_vessel_count,
          inbound_vessel_count,
          weighted_vessel_count,
          predicted_congestion_24h,
          predicted_congestion_48h,
          predicted_congestion_72h,
          calculated_at
        )
      `)
            .limit(100);

        if (error || !data) {
            console.error('[usePortCongestion]', error?.message);
            return;
        }

        const merged: PortWithCongestion[] = (data as unknown as PortQueryRow[]).map((p) => {
            const congestion = Array.isArray(p.port_congestion)
                ? p.port_congestion[0]
                : p.port_congestion;
            return {
                id: p.id,
                name: p.name,
                country: p.country,
                lat: p.lat,
                lon: p.lon,
                un_locode: p.un_locode,
                congestion_index: congestion?.congestion_index ?? 0,
                congestion_status: congestion?.congestion_status ?? 'NORMAL',
                active_vessel_count: congestion?.active_vessel_count ?? 0,
                inbound_vessel_count: congestion?.inbound_vessel_count ?? 0,
                weighted_vessel_count: congestion?.weighted_vessel_count ?? 0,
                predicted_congestion_24h: congestion?.predicted_congestion_24h ?? 0,
                predicted_congestion_48h: congestion?.predicted_congestion_48h ?? 0,
                predicted_congestion_72h: congestion?.predicted_congestion_72h ?? 0,
                calculated_at: congestion?.calculated_at ?? null,
            };
        });

        setPorts(merged);
        setIsLoading(false);
    }, []); // no deps — supabaseRef.current is stable via useRef

    // Fix 4: fetchPorts is now stable, safe to include in deps
    useEffect(() => {
        fetchPorts();
        const interval = setInterval(fetchPorts, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [fetchPorts]);

    return { ports, isLoading };
}