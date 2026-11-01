// One-time script: copy role and pay fields from user_metadata (which users can
// edit themselves) to app_metadata (which only the service-role key can edit).
//
// Run ONCE, from the project folder, BEFORE deploying the new code:
//
//   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
//   node scripts/migrate-roles-to-app-metadata.mjs
//
// Add --dry-run to see what would change without writing anything.
//
// By default the old copies in user_metadata are LEFT in place, so the code
// that is live right now keeps working until you deploy the new code (which
// never reads them). After the new code is deployed you can optionally run
// again with --clear-old to remove the stale copies.
//
// IMPORTANT: before running, check the printed list. If anyone's role looks
// wrong (for example a salesperson shown as admin), they may already have
// edited their own metadata. Fix that user in the Supabase dashboard first.

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const dryRun = process.argv.includes('--dry-run')
const clearOld = process.argv.includes('--clear-old')

if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })
const VALID_ROLES = ['admin', 'manager', 'sales']

const users = []
for (let page = 1; ; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
  if (error) throw error
  users.push(...data.users)
  if (data.users.length < 1000) break
}

console.log(`${users.length} users found${dryRun ? ' (dry run, nothing will be written)' : ''}\n`)

let changed = 0
for (const u of users) {
  const um = u.user_metadata ?? {}
  const am = u.app_metadata ?? {}

  // Keep app_metadata values if they already exist (script is safe to re-run)
  const role = (am.role ?? um.role ?? '').toString().toLowerCase()
  const next = {
    role: VALID_ROLES.includes(role) ? role : 'sales',
    employment_type: am.employment_type ?? um.employment_type ?? 'monthly_salary',
    base_rate: Number(am.base_rate ?? um.base_rate ?? 0) || 0,
    allowances: Array.isArray(am.allowances ?? um.allowances) ? (am.allowances ?? um.allowances) : [],
  }

  const flag = VALID_ROLES.includes(role) ? '' : `  <-- unknown role "${role}", set to "sales"`
  console.log(`${u.email ?? u.id}: role=${next.role} pay=${next.employment_type} ${next.base_rate}${flag}`)

  if (dryRun) continue

  const update = { app_metadata: { ...am, ...next } }
  if (clearOld) {
    update.user_metadata = { ...um, role: null, employment_type: null, base_rate: null, allowances: null }
  }
  const { error } = await supabase.auth.admin.updateUserById(u.id, update)
  if (error) {
    console.error(`  FAILED: ${error.message}`)
  } else {
    changed++
  }
}

console.log(`\n${dryRun ? 'Would update' : 'Updated'} ${dryRun ? users.length : changed} users.`)
