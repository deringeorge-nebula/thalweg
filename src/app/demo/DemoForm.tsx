'use client';

import { useState } from 'react';
import Link from 'next/link';

export function DemoForm() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    organization: '',
    role: '',
    use_case: '',
    tier_interest: 'researcher'
  });

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!form.name.trim() || !form.email.trim() || !form.organization.trim() || !form.use_case.trim()) {
      setValidationError('Please fill out all required fields marked with *');
      return;
    }

    setStatus('submitting');

    try {
      const response = await fetch('/api/demo-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });

      if (response.ok) {
        setStatus('success');
      } else {
        setStatus('error');
      }
    } catch (error) {
      console.error('[Demo form error]', error);
      setStatus('error');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  return (
    <div className="bg-[#0a0f1e] min-h-screen font-body text-slate-300 pb-16">
      {/* HEADER */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-[#0a0f1e]/95 backdrop-blur border-b border-[#1a2744] z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <span className="font-heading text-white font-bold text-lg tracking-wide">
            THALWEG
          </span>
          <span className="text-slate-400 text-xs font-data">
            MARITIME INTELLIGENCE
          </span>
        </div>
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="text-[#00d4ff] text-xs font-data hover:underline cursor-pointer"
          >
            ← LIVE GLOBE
          </Link>
          <Link href="/api-docs" className="text-slate-400 text-xs font-data hover:text-[#00d4ff]">
            API DOCS
          </Link>
          <Link href="/intelligence" className="text-slate-400 text-xs font-data hover:text-[#00d4ff]">
            INTELLIGENCE
          </Link>
        </div>
      </header>

      {/* FORM SECTION */}
      <section className="max-w-2xl mx-auto px-6 pt-32 pb-16">
        <h1 className="font-data text-3xl font-bold text-white tracking-widest">
          REQUEST ACCESS
        </h1>
        <p className="mt-3 text-slate-400">
          For researchers, port authorities, NGOs, and institutional operators. We respond within 48 hours.
        </p>

        {status === 'success' ? (
          <div className="mt-10 bg-[#0d1424] border border-[#00ff88] rounded-xl p-8 text-center">
            <h2 className="text-[#00ff88] font-data text-xl tracking-widest">REQUEST RECEIVED</h2>
            <p className="text-slate-400 mt-3">We&apos;ll be in touch within 48 hours.</p>
            <div className="mt-6">
              <Link href="/" className="text-[#00d4ff] text-sm font-data hover:underline">
                ← Return to Live Globe
              </Link>
            </div>
          </div>
        ) : (
          <form className="mt-10 space-y-6" onSubmit={handleSubmit}>

            {/* Name */}
            <div>
              <label htmlFor="name" className="block text-[#00d4ff] text-xs font-data tracking-widest mb-2">Name*</label>
              <input
                id="name"
                name="name"
                type="text"
                placeholder="Your name"
                className="w-full bg-[#0d1424] border border-[#1a2744] rounded px-4 py-3 text-white text-sm font-data focus:outline-none focus:border-[#00d4ff] placeholder:text-slate-600"
                value={form.name}
                onChange={handleChange}
                disabled={status === 'submitting'}
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-[#00d4ff] text-xs font-data tracking-widest mb-2">Email*</label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="your@institution.edu"
                className="w-full bg-[#0d1424] border border-[#1a2744] rounded px-4 py-3 text-white text-sm font-data focus:outline-none focus:border-[#00d4ff] placeholder:text-slate-600"
                value={form.email}
                onChange={handleChange}
                disabled={status === 'submitting'}
              />
            </div>

            {/* Organization */}
            <div>
              <label htmlFor="organization" className="block text-[#00d4ff] text-xs font-data tracking-widest mb-2">Organization*</label>
              <input
                id="organization"
                name="organization"
                type="text"
                placeholder="Port authority, university, NGO, etc."
                className="w-full bg-[#0d1424] border border-[#1a2744] rounded px-4 py-3 text-white text-sm font-data focus:outline-none focus:border-[#00d4ff] placeholder:text-slate-600"
                value={form.organization}
                onChange={handleChange}
                disabled={status === 'submitting'}
              />
            </div>

            {/* Role */}
            <div>
              <label htmlFor="role" className="block text-[#00d4ff] text-xs font-data tracking-widest mb-2">Role</label>
              <input
                id="role"
                name="role"
                type="text"
                placeholder="e.g. Maritime Safety Officer, Researcher"
                className="w-full bg-[#0d1424] border border-[#1a2744] rounded px-4 py-3 text-white text-sm font-data focus:outline-none focus:border-[#00d4ff] placeholder:text-slate-600"
                value={form.role}
                onChange={handleChange}
                disabled={status === 'submitting'}
              />
            </div>

            {/* Tier Interest */}
            <div>
              <label htmlFor="tier_interest" className="block text-[#00d4ff] text-xs font-data tracking-widest mb-2">Tier Interest</label>
              <select
                id="tier_interest"
                name="tier_interest"
                className="w-full bg-[#0d1424] border border-[#1a2744] rounded px-4 py-3 text-white text-sm font-data focus:outline-none focus:border-[#00d4ff] appearance-none"
                value={form.tier_interest}
                onChange={handleChange}
                disabled={status === 'submitting'}
              >
                <option value="researcher">Researcher / NGO (Free)</option>
                <option value="enterprise">Enterprise (Commercial)</option>
              </select>
            </div>

            {/* Use Case */}
            <div>
              <label htmlFor="use_case" className="block text-[#00d4ff] text-xs font-data tracking-widest mb-2">Use Case*</label>
              <textarea
                id="use_case"
                name="use_case"
                rows={4}
                placeholder="Describe how you intend to use Thalweg..."
                className="w-full bg-[#0d1424] border border-[#1a2744] rounded px-4 py-3 text-white text-sm font-data focus:outline-none focus:border-[#00d4ff] placeholder:text-slate-600"
                value={form.use_case}
                onChange={handleChange}
                disabled={status === 'submitting'}
              ></textarea>
            </div>

            {/* Validation Error */}
            {validationError && (
              <div className="text-red-400 text-sm font-data">
                {validationError}
              </div>
            )}

            {/* API Error */}
            {status === 'error' && (
              <div className="text-red-400 text-sm font-data">
                Something went wrong. Please email support@thalweg.vercel.app
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={status === 'submitting'}
              className={`w-full py-3 rounded font-data text-sm mt-2 font-bold transition-colors ${status === 'submitting'
                ? 'bg-[#00d4ff]/50 text-[#0a0f1e]/50 cursor-not-allowed'
                : 'bg-[#00d4ff] text-[#0a0f1e] hover:bg-[#00d4ff]/80'
                }`}
            >
              {status === 'submitting' ? 'SUBMITTING...' : 'SUBMIT REQUEST →'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
