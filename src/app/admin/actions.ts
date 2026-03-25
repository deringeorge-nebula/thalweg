'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function adminLogin(formData: FormData): Promise<void> {
  const password = formData.get('password') as string
  const expected = process.env.ADMIN_PASSWORD ?? ''

  if (!expected || password !== expected) {
    redirect('/admin?error=1')
  }

  ;(await cookies()).set('thalweg-admin', 'authenticated', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 8,
  })

  redirect('/admin')
}
