'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/utils/supabase/server'
import {
  SESSION_DURATION_SECONDS,
  SESSION_DURATION_MS,
  SESSION_EXPIRES_COOKIE,
  SESSION_START_COOKIE
} from '@/utils/sessionConfig'

export async function login(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: error.message }
  }

  const now = Date.now()
  const expiresAt = now + SESSION_DURATION_MS
  const cookieStore = await cookies()

  cookieStore.set(SESSION_EXPIRES_COOKIE, expiresAt.toString(), {
    path: '/',
    maxAge: SESSION_DURATION_SECONDS,
    sameSite: 'lax',
    httpOnly: false, // Accessible to client timer
  })

  cookieStore.set(SESSION_START_COOKIE, now.toString(), {
    path: '/',
    maxAge: SESSION_DURATION_SECONDS,
    sameSite: 'lax',
    httpOnly: false,
  })

  // Check user role:
  // - Admin goes to /portal (can choose ERP or Factory)
  // - Warehouse Manager goes directly to /factory
  // - Sales Person goes directly to /dashboard
  const { data: { user } } = await supabase.auth.getUser()
  const role = user?.user_metadata?.role

  revalidatePath('/dashboard')
  revalidatePath('/portal')
  revalidatePath('/factory')

  if (role === 'admin') {
    redirect('/portal')
  } else if (role === 'manager') {
    redirect('/factory')
  } else {
    redirect('/dashboard')
  }
}
