// src/app/page.tsx
import dynamic from 'next/dynamic';

// deck.gl requires browser WebGL — must disable SSR
const GlobeView = dynamic(() => import('@/components/globe/GlobeView'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen bg-ocean-base flex items-center justify-center">
      <div className="text-center">
        <div className="text-accent-cyan font-heading font-bold text-2xl mb-2">THALWEG</div>
        <div className="text-text-secondary text-sm font-body">
          Initialising maritime intelligence...
        </div>
      </div>
    </div>
  ),
});

export default function Home() {
  return (
    <main className="w-full h-screen overflow-hidden bg-ocean-base">
      <GlobeView />
    </main>
  );
}
