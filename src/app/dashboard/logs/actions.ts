'use server'

import { supabaseAdmin } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'

// Verify Admin Role
async function enforceAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.user_metadata?.role !== 'admin') {
    throw new Error('Unauthorized')
  }
}

export async function fetchLogs(type: 'system' | 'error', page: number = 1, limit: number = 50) {
  await enforceAdmin()
  
  const from = (page - 1) * limit
  const to = from + limit - 1

  const { data, error, count } = await supabaseAdmin
    .from('logs')
    .select('*', { count: 'exact' })
    .eq('type', type)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    console.error("Fetch Logs Error:", error.message)
    return { data: [], total: 0 }
  }

  return { data: data || [], total: count || 0 }
}

export async function fetchArchives() {
  await enforceAdmin()

  const { data, error } = await supabaseAdmin
    .from('log_archives')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3) // Ensure we display up to 3 as requested

  if (error) return []
  return data || []
}

// Generate a signed URL so the admin can securely download the private CSV file
export async function getArchiveDownloadUrl(filePath: string) {
  await enforceAdmin()

  const { data, error } = await supabaseAdmin
    .storage
    .from('log_archives')
    .createSignedUrl(filePath, 60) // valid for 60 seconds

  if (error) return { error: error.message }
  return { url: data.signedUrl }
}
