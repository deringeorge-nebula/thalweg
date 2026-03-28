import { Resend } from 'resend'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

interface DemoRequestBody {
  name: string
  organization: string
  role: string
  email: string
  useCase: string
  message: string
}

export async function POST(req: NextRequest) {
  try {
    const body: DemoRequestBody = await req.json()

    const { name, organization, role, email, useCase, message } = body

    if (
      !name?.trim() ||
      !organization?.trim() ||
      !role?.trim() ||
      !email?.trim() ||
      !useCase?.trim()
    ) {
      return NextResponse.json(
        { success: false, error: 'MISSING REQUIRED FIELDS' },
        { status: 400 }
      )
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'INVALID EMAIL ADDRESS' },
        { status: 400 }
      )
    }

    const resend = new Resend(process.env.RESEND_API_KEY)
    const subject = `[THALWEG] Demo Request — ${organization} · ${name}`

    const htmlBody = `
      <div style="font-family: monospace; background-color: #0a0f1e; color: #e2e8f0; padding: 32px;">
        <h2 style="color: #00d4ff; font-weight: normal; margin-bottom: 24px;">${subject}</h2>
        <table style="width: 100%; text-align: left; border-collapse: collapse;">
          <tbody>
            <tr>
              <th style="padding: 8px 0; min-width: 150px; color: #94a3b8; font-weight: normal;">FULL NAME:</th>
              <td style="padding: 8px 0; color: #e2e8f0;">${name}</td>
            </tr>
            <tr>
              <th style="padding: 8px 0; color: #94a3b8; font-weight: normal;">ORGANIZATION:</th>
              <td style="padding: 8px 0; color: #e2e8f0;">${organization}</td>
            </tr>
            <tr>
              <th style="padding: 8px 0; color: #94a3b8; font-weight: normal;">ROLE:</th>
              <td style="padding: 8px 0; color: #e2e8f0;">${role}</td>
            </tr>
            <tr>
              <th style="padding: 8px 0; color: #94a3b8; font-weight: normal;">EMAIL:</th>
              <td style="padding: 8px 0; color: #e2e8f0;">${email}</td>
            </tr>
            <tr>
              <th style="padding: 8px 0; color: #94a3b8; font-weight: normal;">USE CASE:</th>
              <td style="padding: 8px 0; color: #e2e8f0;">${useCase}</td>
            </tr>
            <tr>
              <th style="padding: 8px 0; color: #94a3b8; font-weight: normal; vertical-align: top;">MESSAGE:</th>
              <td style="padding: 8px 0; color: #e2e8f0;">${message || '(none)'}</td>
            </tr>
            <tr>
              <th style="padding: 8px 0; color: #94a3b8; font-weight: normal;">SUBMITTED AT:</th>
              <td style="padding: 8px 0; color: #e2e8f0;">${new Date().toISOString()}</td>
            </tr>
          </tbody>
        </table>
        
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #1a2744; color: #64748b; font-size: 12px;">
          Reply to this email to respond directly to the requester.
        </div>
      </div>
    `

    const { error } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: process.env.DEMO_NOTIFICATION_EMAIL ?? 'oriphicwaves@gmail.com',
      replyTo: email,
      subject,
      html: htmlBody,
    })

    if (error) {
      console.error('[demo-request] Resend error:', error)
      return NextResponse.json(
        { success: false, error: 'EMAIL DELIVERY FAILED' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('[demo-request] Resend error:', error)
    return NextResponse.json(
      { success: false, error: 'EMAIL DELIVERY FAILED' },
      { status: 500 }
    )
  }
}
