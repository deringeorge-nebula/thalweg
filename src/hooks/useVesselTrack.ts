'use client';

import { useState, useEffect } from 'react';

export interface TrackPoint {
  lat: number;
  lon: number;
  sog: number | null;
  recorded_at: string;
}

export function useVesselTrack(mmsi: number | null): {
  track: TrackPoint[];
  isLoading: boolean;
  hasTrack: boolean;
} {
  const [track, setTrack] = useState<TrackPoint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (mmsi === null) {
      setTrack([]);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    const fetchTrack = async () => {
      try {
        const response = await fetch(`/api/vessel/${mmsi}/track`);
        if (!response.ok) {
          throw new Error('Failed to fetch vessel track');
        }
        
        const data = await response.json();
        
        if (isMounted) {
          setTrack(data.track || []);
        }
      } catch (error) {
        console.error('[useVesselTrack] Fetch error:', error);
        if (isMounted) {
          setTrack([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchTrack();

    return () => {
      isMounted = false;
    };
  }, [mmsi]);

  const hasTrack = track.length > 1;

  return { track, isLoading, hasTrack };
}
