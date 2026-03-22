// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'ocean-base': '#0A1628',
        'ocean-surface': 'rgba(10, 22, 40, 0.85)',
        'accent-cyan': '#00D4FF',
        'accent-blue': '#0066FF',
        'alert-critical': '#FF4444',
        'alert-warning': '#FFB800',
        'alert-ok': '#00FF88',
        'text-primary': '#FFFFFF',
        'text-secondary': '#8899AA',
        'text-muted': '#4A5568',
        'border-glow': 'rgba(0, 212, 255, 0.15)',
      },
      fontFamily: {
        heading: ['Space Grotesk', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        data: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'glow-cyan': '0 0 20px rgba(0, 212, 255, 0.3)',
      },
      backdropBlur: {
        'panel': '12px',
      },
    },
  },
  plugins: [],
  darkMode: 'class',
};

export default config;
