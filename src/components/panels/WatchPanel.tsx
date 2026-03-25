'use client'

import { useState } from 'react'
import { trackWatchSubscription } from '@/lib/analytics'

interface WatchPanelProps {
  mmsi: string
  vesselName: string | null
}

type WatchState = 'idle' | 'input' | 'loading' | 'success' | 'error'

export default function WatchPanel({ mmsi, vesselName }: WatchPanelProps) {
  const [state, setState] = useState<WatchState>('idle')
  const [email, setEmail] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleWatch() {
    if (!email || !email.includes('@')) {
      setErrorMsg('Enter a valid email address')
      return
    }
    setState('loading')
    try {
      const res = await fetch('/api/watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mmsi, email, vessel_name: vesselName })
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error ?? 'Failed to add watch')
        setState('error')
        return
      }
      trackWatchSubscription(mmsi, vesselName ?? 'Unknown')
      setState('success')
    } catch {
      setErrorMsg('Network error')
      setState('error')
    }
  }

  if (state === 'success') {
    return (
      <div className="mt-3 pt-3 border-t border-navy-700/50">
        <div className="flex items-center gap-2">
          <span className="text-accent-cyan text-xs font-data">✓ WATCHING</span>
          <span className="text-gray-400 text-xs font-data truncate">{email}</span>
        </div>
        <p className="text-gray-500 text-xs mt-1 font-data">
          Alerts sent when anomaly or sanctions match detected.
        </p>
      </div>
    )
  }

  if (state === 'input' || state === 'loading' || state === 'error') {
    return (
      <div className="mt-3 pt-3 border-t border-navy-700/50">
        <p className="text-gray-400 text-xs font-data mb-2">
          Get email alerts for anomalies on this vessel
        </p>
        <div className="flex gap-2">
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => { setEmail(e.target.value); setErrorMsg('') }}
            onKeyDown={e => e.key === 'Enter' && handleWatch()}
            disabled={state === 'loading'}
            className="flex-1 bg-navy-900 border border-navy-600 text-white text-xs 
                       font-data px-2 py-1.5 rounded focus:outline-none 
                       focus:border-accent-cyan placeholder-gray-600"
          />
          <button
            onClick={handleWatch}
            disabled={state === 'loading'}
            className="bg-accent-cyan/10 border border-accent-cyan/50 text-accent-cyan 
                       text-xs font-data px-3 py-1.5 rounded hover:bg-accent-cyan/20 
                       transition-colors disabled:opacity-50"
          >
            {state === 'loading' ? '...' : 'WATCH'}
          </button>
        </div>
        {(state === 'error' || errorMsg) && (
          <p className="text-red-400 text-xs font-data mt-1">{errorMsg}</p>
        )}
      </div>
    )
  }

  // idle state
  return (
    <div className="mt-3 pt-3 border-t border-navy-700/50">
      <button
        onClick={() => setState('input')}
        className="flex items-center gap-2 text-xs font-data text-gray-400 
                   hover:text-accent-cyan transition-colors group"
      >
        <span className="text-lg leading-none group-hover:scale-110 transition-transform">
          🔔
        </span>
        <span>WATCH VESSEL FOR ALERTS</span>
      </button>
    </div>
  )
}
