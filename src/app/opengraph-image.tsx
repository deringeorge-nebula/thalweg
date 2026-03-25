import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Thalweg — Real-time Maritime Intelligence'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          backgroundColor: '#0a0f1e',
          padding: '60px',
          justifyContent: 'space-between',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
          {/* Row 1 — Title and Tag */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
            }}
          >
            <div
              style={{
                fontSize: '72px',
                fontWeight: 800,
                color: 'white',
                letterSpacing: '8px',
              }}
            >
              THALWEG
            </div>
            <div
              style={{
                fontSize: '18px',
                color: '#00d4ff',
                letterSpacing: '4px',
                border: '1px solid #00d4ff',
                padding: '6px 16px',
                borderRadius: '4px',
                display: 'flex', // Satori required
              }}
            >
              MARITIME INTELLIGENCE
            </div>
          </div>

          {/* Row 2 — Tagline */}
          <div
            style={{
              display: 'flex',
              marginTop: '16px',
              fontSize: '28px',
              color: '#94a3b8',
              fontWeight: 400,
            }}
          >
            Real-time vessel tracking. Dark fleet detection. Sanctions monitoring. Spill prediction.
          </div>

          {/* MIDDLE SECTION — Stat Cards */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: '24px',
              marginTop: '48px',
              width: '100%',
            }}
          >
            {/* Card 1 */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: '#0d1424',
                border: '1px solid #1a2744',
                borderRadius: '8px',
                padding: '20px 28px',
                flex: 1,
              }}
            >
              <div style={{ color: '#00d4ff', fontSize: '36px', fontWeight: 'bold' }}>40,000+</div>
              <div style={{ color: '#64748b', fontSize: '14px', marginTop: '8px' }}>LIVE VESSELS</div>
            </div>

            {/* Card 2 */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: '#0d1424',
                border: '1px solid #1a2744',
                borderRadius: '8px',
                padding: '20px 28px',
                flex: 1,
              }}
            >
              <div style={{ color: '#f97316', fontSize: '36px', fontWeight: 'bold' }}>50+</div>
              <div style={{ color: '#64748b', fontSize: '14px', marginTop: '8px' }}>PORTS MONITORED</div>
            </div>

            {/* Card 3 */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: '#0d1424',
                border: '1px solid #1a2744',
                borderRadius: '8px',
                padding: '20px 28px',
                flex: 1,
              }}
            >
              <div style={{ color: '#eab308', fontSize: '36px', fontWeight: 'bold' }}>REAL-TIME</div>
              <div style={{ color: '#64748b', fontSize: '14px', marginTop: '8px' }}>SANCTIONS SYNC</div>
            </div>

            {/* Card 4 */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: '#0d1424',
                border: '1px solid #1a2744',
                borderRadius: '8px',
                padding: '20px 28px',
                flex: 1,
              }}
            >
              <div style={{ color: '#ef4444', fontSize: '36px', fontWeight: 'bold' }}>FREE</div>
              <div style={{ color: '#64748b', fontSize: '14px', marginTop: '8px' }}>VS $5M/YR PALANTIR</div>
            </div>
          </div>
        </div>

        {/* BOTTOM SECTION — Footer */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            width: '100%',
          }}
        >
          <div style={{ color: '#00d4ff', fontSize: '22px' }}>thalweg.vercel.app</div>
          <div style={{ color: '#475569', fontSize: '16px' }}>
            Built by a naval architecture student · Visakhapatnam, India · AGPL-3.0
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
