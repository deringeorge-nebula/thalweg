'use client'

import React, { useState } from 'react'
import Link from 'next/link'

interface FormData {
  name: string
  organization: string
  role: string
  email: string
  useCase: string
  message: string
}

type FormStatus = 'idle' | 'submitting' | 'success' | 'error'

export default function DemoRequestForm() {
  const [formData, setFormData] = useState<FormData>({
    name: '', organization: '', role: '', email: '',
    useCase: '', message: ''
  })
  const [status, setStatus] = useState<FormStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string>('')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('submitting')
    setErrorMessage('')

    try {
      const res = await fetch('/api/demo-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        setStatus('error')
        setErrorMessage(data.error ?? 'TRANSMISSION FAILED. RETRY.')
        return
      }

      setStatus('success')
    } catch {
      setStatus('error')
      setErrorMessage('NETWORK ERROR. CHECK CONNECTION AND RETRY.')
    }
  }

  if (status === 'success') {
    return (
      <div className="h-full flex flex-col justify-center">
        <div className="font-mono tracking-widest text-[#00d4ff] text-sm mb-4">
          ✓ REQUEST TRANSMITTED
        </div>
        <div className="text-white font-mono tracking-widest text-xs">
          Your demo request has been received.
        </div>
        <div className="text-slate-300 font-mono tracking-widest text-xs mt-2 leading-relaxed">
          We will contact you at {formData.email} within 24–48 hours to schedule your demonstration.
        </div>
        
        <div className="border-t border-[#1a2744] mt-8 pt-6">
          <Link href="/" className="text-[#00d4ff] font-mono tracking-widest text-xs hover:text-white transition-colors touch-manipulation">
            ← RETURN TO PLATFORM
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="font-mono tracking-widest text-xs text-slate-400 mb-8 border-b border-[#1a2744] pb-3">
        DEMO REQUEST FORM
      </div>

      <form onSubmit={handleSubmit}>
        <div className="mb-5">
          <label className="block mb-1.5 font-mono tracking-widest text-[10px] text-slate-400 uppercase">
            FULL NAME
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="CAPT. J. HAWKINS"
            required
            className="w-full bg-[#0a0f1e] border border-[#1a2744] text-white font-mono tracking-widest text-xs px-3 py-2.5 touch-manipulation focus:outline-none focus:border-[#00d4ff] transition-colors placeholder:text-slate-600 placeholder:font-mono placeholder:tracking-widest rounded-none"
          />
        </div>

        <div className="mb-5">
          <label className="block mb-1.5 font-mono tracking-widest text-[10px] text-slate-400 uppercase">
            ORGANIZATION
          </label>
          <input
            type="text"
            name="organization"
            value={formData.organization}
            onChange={handleChange}
            placeholder="ROTTERDAM PORT AUTHORITY"
            required
            className="w-full bg-[#0a0f1e] border border-[#1a2744] text-white font-mono tracking-widest text-xs px-3 py-2.5 touch-manipulation focus:outline-none focus:border-[#00d4ff] transition-colors placeholder:text-slate-600 placeholder:font-mono placeholder:tracking-widest rounded-none"
          />
        </div>

        <div className="mb-5">
          <label className="block mb-1.5 font-mono tracking-widest text-[10px] text-slate-400 uppercase">
            ROLE / TITLE
          </label>
          <input
            type="text"
            name="role"
            value={formData.role}
            onChange={handleChange}
            placeholder="PORT TRAFFIC MANAGER"
            required
            className="w-full bg-[#0a0f1e] border border-[#1a2744] text-white font-mono tracking-widest text-xs px-3 py-2.5 touch-manipulation focus:outline-none focus:border-[#00d4ff] transition-colors placeholder:text-slate-600 placeholder:font-mono placeholder:tracking-widest rounded-none"
          />
        </div>

        <div className="mb-5">
          <label className="block mb-1.5 font-mono tracking-widest text-[10px] text-slate-400 uppercase">
            EMAIL ADDRESS
          </label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="j.hawkins@portofrotterdam.com"
            required
            className="w-full bg-[#0a0f1e] border border-[#1a2744] text-white font-mono tracking-widest text-xs px-3 py-2.5 touch-manipulation focus:outline-none focus:border-[#00d4ff] transition-colors placeholder:text-slate-600 placeholder:font-mono placeholder:tracking-widest rounded-none"
          />
        </div>

        <div className="mb-5">
          <label className="block mb-1.5 font-mono tracking-widest text-[10px] text-slate-400 uppercase">
            PRIMARY USE CASE
          </label>
          <div className="relative">
            <select
              name="useCase"
              value={formData.useCase}
              onChange={handleChange}
              required
              className="appearance-none w-full bg-[#0a0f1e] border border-[#1a2744] text-white font-mono tracking-widest text-xs px-3 py-2.5 touch-manipulation focus:outline-none focus:border-[#00d4ff] transition-colors placeholder:text-slate-600 placeholder:font-mono placeholder:tracking-widest rounded-none"
            >
              <option value="" disabled>SELECT USE CASE</option>
              <option value="port_operations">PORT OPERATIONS</option>
              <option value="sanctions">SANCTIONS COMPLIANCE</option>
              <option value="maritime_research">MARITIME RESEARCH</option>
              <option value="journalism">INVESTIGATIVE JOURNALISM</option>
              <option value="vessel_tracking">VESSEL TRACKING</option>
              <option value="other">OTHER</option>
            </select>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-mono pointer-events-none">▼</span>
          </div>
        </div>

        <div className="mb-5">
          <label className="block mb-1.5 font-mono tracking-widest text-[10px] text-slate-400 uppercase">
            REQUIREMENTS / MESSAGE (OPTIONAL)
          </label>
          <textarea
            name="message"
            value={formData.message}
            onChange={handleChange}
            rows={4}
            placeholder="DESCRIBE YOUR SPECIFIC INTELLIGENCE REQUIREMENTS..."
            className="resize-none w-full bg-[#0a0f1e] border border-[#1a2744] text-white font-mono tracking-widest text-xs px-3 py-2.5 touch-manipulation focus:outline-none focus:border-[#00d4ff] transition-colors placeholder:text-slate-600 placeholder:font-mono placeholder:tracking-widest rounded-none"
          />
        </div>

        <button
          type="submit"
          disabled={status === 'submitting'}
          className={`w-full py-3 mt-6 font-mono tracking-widest text-xs touch-manipulation transition-colors rounded-none ${
            status === 'submitting' 
              ? 'bg-[#00d4ff] text-[#0a0f1e] opacity-75 cursor-not-allowed' 
              : 'bg-[#00d4ff] text-[#0a0f1e] hover:bg-[#06b6d4]'
          }`}
        >
          {status === 'submitting' ? 'TRANSMITTING...' : 'SUBMIT REQUEST →'}
        </button>

        {status === 'error' && (
          <div className="mt-3 p-3 border border-[#ef4444] bg-[#ef4444]/10 font-mono tracking-widest text-[10px] text-[#ef4444]">
            ⚠ {errorMessage}
          </div>
        )}
      </form>
    </div>
  )
}
