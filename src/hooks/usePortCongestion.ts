// src/hooks/usePortCongestion.ts
// Fetches port congestion data every 5 minutes — matches the Edge Function schedule.

'use client';

import { useEffect, useState } from 'react';
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

export function usePortCongestion() {
    const supabase = createClient();
    const [ports, setPorts] = useState<PortWithCongestion[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    async function fetchPorts() {
        const { data, error } = await supabase
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

        const merged: PortWithCongestion[] = data.map((p: any) => {
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
    }

    useEffect(() => {
        fetchPorts();
        // Re-fetch every 5 minutes — matches cron schedule
        const interval = setInterval(fetchPorts, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    return { ports, isLoading };
}
