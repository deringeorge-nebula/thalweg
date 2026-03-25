// src/app/layout.tsx
import type { Metadata } from 'next';
import { Space_Grotesk, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-heading',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-body',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500'],
  variable: '--font-data',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Thalweg - Free Maritime Intelligence',
  description: '29,547 live vessels. Sanctions screening. Dark fleet detection. Port congestion forecasts. Free, open-source maritime intelligence built on public data.',
  metadataBase: new URL('https://thalweg.vercel.app'),
  openGraph: {
    title: 'Thalweg - Free Maritime Intelligence',
    description: '29,547 live vessels. Sanctions screening. Dark fleet detection. Port congestion forecasts. Open source.',
    url: 'https://thalweg.vercel.app',
    siteName: 'Thalweg',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Thalweg - real-time global maritime intelligence tool showing 29,547 vessels on a 3D globe',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Thalweg - Free Maritime Intelligence',
    description: '29,547 live vessels. Sanctions screening. Dark fleet detection. Free and open source.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="bg-ocean-base text-white antialiased">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
