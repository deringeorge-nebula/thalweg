'use client'

import React, { useState, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'

interface WaitlistFormProps {
  tier: 'pro'
}

export default function WaitlistForm({ tier }: WaitlistFormProps) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle'|'submitting'|'success'|'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const supabase = useMemo(() => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('submitting')
    setErrorMsg('')

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      setStatus('error')
      setErrorMsg('INVALID EMAIL ADDRESS')
      return
    }

    const { error } = await supabase
      .from('waitlist')
      .insert({ 
        email: email.trim().toLowerCase(), 
        tier 
      })

    if (error) {
      if (error.code === '23505') {
        setStatus('success')
        return
      }
      setStatus('error')
      setErrorMsg('FAILED TO JOIN. RETRY.')
      console.error('[WaitlistForm] Error:', error)
      return
    }

    setStatus('success')
  }

  if (status === 'success') {
    return (
      <div className="mt-auto pt-6">
        <div className="text-[#00d4ff] font-mono tracking-widest text-xs">
          ✓ YOU&apos;RE ON THE LIST
        </div>
        <div className="text-slate-400 font-mono tracking-widest text-[10px] mt-1">
          We&apos;ll notify you at launch.
        </div>
      </div>
    )
  }

  return (
    <div className="mt-auto pt-6">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="YOUR@EMAIL.COM"
          className="flex-1 bg-[#0a0f1e] border border-[#1a2744] text-white font-mono tracking-widest text-xs px-3 py-2.5 focus:outline-none focus:border-[#00d4ff] transition-colors placeholder:text-slate-600 placeholder:font-mono rounded-none touch-manipulation w-full"
        />
        <button
          type="submit"
          disabled={status === 'submitting'}
          className="bg-[#00d4ff] text-[#0a0f1e] font-mono tracking-widest text-xs px-4 py-2.5 hover:bg-[#06b6d4] transition-colors touch-manipulation disabled:opacity-75 disabled:cursor-not-allowed flex-shrink-0 rounded-none w-auto"
        >
          {status === 'submitting' ? '...' : 'NOTIFY ME'}
        </button>
      </form>
      {status === 'error' && (
        <div className="mt-2 text-[#ef4444] font-mono tracking-widest text-[10px]">
          ⚠ {errorMsg}
        </div>
      )}
    </div>
  )
}
