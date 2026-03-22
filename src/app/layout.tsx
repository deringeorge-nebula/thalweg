// src/app/layout.tsx
import type { Metadata } from 'next';
import { Space_Grotesk, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

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
  title: 'Thalweg — Real-Time Global Maritime Intelligence',
  description:
    'Live vessel tracking, port congestion, dark fleet detection, and ocean intelligence. Open source. Free.',
  keywords: ['maritime', 'AIS', 'vessel tracking', 'port congestion', 'dark fleet', 'open source'],
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
      <body className="bg-ocean-base text-white antialiased">{children}</body>
    </html>
  );
}
