import type { Metadata } from 'next';
import { DemoForm } from './DemoForm';

export const metadata: Metadata = {
  title: 'Request Access — Thalweg Maritime Intelligence',
  description: 'Request researcher or enterprise access to Thalweg. Full API access for port authorities, NGOs, P&I clubs, and academic institutions.',
  openGraph: {
    title: 'Request Access — Thalweg',
    description: 'Institutional access to real-time maritime intelligence. Free for researchers and NGOs.',
    url: 'https://thalweg.vercel.app/demo',
    siteName: 'Thalweg',
    images: [{ url: 'https://thalweg.vercel.app/opengraph-image' }],
  },
  twitter: { card: 'summary_large_image' }
};

export default function DemoPage() {
  return <DemoForm />;
}
