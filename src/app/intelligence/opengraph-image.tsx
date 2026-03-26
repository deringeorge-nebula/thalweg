import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Thalweg Fleet Intelligence';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0a0f1e',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'monospace',
        }}
      >
        <div
          style={{
            color: '#00d4ff',
            fontSize: 16,
            letterSpacing: 8,
            marginBottom: 24,
          }}
        >
          THALWEG MARITIME INTELLIGENCE
        </div>
        <div
          style={{
            color: 'white',
            fontSize: 56,
            fontWeight: 'bold',
            letterSpacing: 4,
          }}
        >
          FLEET INTELLIGENCE
        </div>
        <div
          style={{
            color: '#64748b',
            fontSize: 20,
            marginTop: 20,
          }}
        >
          Live aggregates · Dark fleet · Sanctions · Anomalies
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
