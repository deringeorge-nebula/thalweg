'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import dynamic from 'next/dynamic';

const GlobeView = dynamic<any>(
  () => import('@/components/globe/GlobeView'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-[#0a0f1e] flex items-center justify-center">
        <span className="text-[#00d4ff] text-xs font-data tracking-widest animate-pulse">
          LOADING THALWEG...
        </span>
      </div>
    ),
  }
);

function EmbedContent() {
  const searchParams = useSearchParams();
  const lat = parseFloat(searchParams.get('lat') ?? '20');
  const lon = parseFloat(searchParams.get('lon') ?? '80');
  const zoom = parseFloat(searchParams.get('zoom') ?? '4');
  const filter = searchParams.get('filter') ?? null;

  return (
    <div className="w-screen h-screen bg-[#0a0f1e] overflow-hidden relative">
      <GlobeView
        embedMode={true}
        initialLat={lat}
        initialLon={lon}
        initialZoom={zoom}
        embedFilter={filter}
      />
      <a
        href="https://thalweg.vercel.app"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-3 right-3 z-10 bg-[#0a0f1e]/90 border border-[#1a2744] rounded px-2 py-1 text-[#00d4ff] text-[9px] font-data tracking-widest hover:border-[#00d4ff] transition-colors"
      >
        THALWEG
      </a>
    </div>
  );
}

export default function EmbedPage() {
  return (
    <Suspense fallback={<div className="w-screen h-screen bg-[#0a0f1e]" />}>
      <EmbedContent />
    </Suspense>
  );
}
