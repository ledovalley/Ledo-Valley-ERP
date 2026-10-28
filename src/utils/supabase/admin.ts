import { createClient } from '@supabase/supabase-js'

// Use this client strictly in Server Actions or API routes for administrative tasks.
// NEVER use this in client components, as it bypasses Row Level Security (RLS).
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
