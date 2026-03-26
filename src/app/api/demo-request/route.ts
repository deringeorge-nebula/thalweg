import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.MY_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, organization, role, use_case, tier_interest } = body;

    // Validate required fields
    if (
      !name || typeof name !== 'string' || name.length < 2 ||
      !email || typeof email !== 'string' || email.length < 2 ||
      !organization || typeof organization !== 'string' || organization.length < 2 ||
      !use_case || typeof use_case !== 'string' || use_case.length < 2
    ) {
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
    }

    // Validate email basic regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
    }

    // Insert into Supabase
    const { error: dbError } = await supabaseAdmin
      .from('demo_requests')
      .insert({
        name,
        email,
        organization,
        role,
        use_case,
        tier_interest
      });

    if (dbError) {
      console.error('[demo-request API] Supabase error:', dbError);
      return NextResponse.json({ error: 'Failed to save request' }, { status: 500 });
    }

    // Send notification email to founder
    try {
      await resend.emails.send({
        from: 'Thalweg <noreply@thalweg.vercel.app>',
        to: 'oriphicwaves@gmail.com',    
        subject: `Demo Request: ${organization} — ${tier_interest || 'unspecified'}`,
        html: `
          <h2>New Demo Request</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Organization:</strong> ${organization}</p>
          <p><strong>Role:</strong> ${role ?? 'Not specified'}</p>
          <p><strong>Tier Interest:</strong> ${tier_interest ?? 'Not specified'}</p>
          <p><strong>Use Case:</strong></p>
          <p>${use_case}</p>
        `
      });
    } catch (e) {
      console.error('[demo-request API] Failed to send founder email:', e);
    }

    // Send confirmation to requester
    try {
      await resend.emails.send({
        from: 'Thalweg <noreply@thalweg.vercel.app>',
        to: email,
        subject: 'Demo request received — Thalweg Maritime Intelligence',
        html: `
          <div style="font-family:monospace;background:#0a0f1e;color:#e2e8f0;padding:32px;max-width:480px">
            <h2 style="color:#00d4ff;letter-spacing:4px">THALWEG</h2>
            <p>Hi ${name},</p>
            <p>Your demo request for ${organization} has been received. We'll be in touch within 48 hours.</p>
            <p style="color:#64748b;font-size:12px">
              Thalweg Maritime Intelligence<br>
              https://thalweg.vercel.app
            </p>
          </div>
        `
      });
    } catch (e) {
      console.error('[demo-request API] Failed to send user confirmation email:', e);
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    console.error('[demo-request API] General error:', error);
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
