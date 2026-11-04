import { cache } from 'react'
import { supabaseAdmin } from '@/utils/supabase/admin'
import type { User } from '@supabase/supabase-js'

/**
 * Every login account, fetched at most once per page load (React cache), however
 * many dashboard widgets need it. Server-only (uses the service-role key).
 */
export const listAllUsersCached = cache(async () => {
  const users: User[] = []
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(error.message)
    users.push(...data.users)
    if (data.users.length < 1000) break
  }
  return users
})
