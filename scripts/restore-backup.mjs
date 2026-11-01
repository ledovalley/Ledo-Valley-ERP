// Restore a Ledo Valley ERP backup (.json.gz from the nightly job, the email,
// or the admin "Download backup" button) into Supabase.
//
//   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
//   node scripts/restore-backup.mjs ledo-valley-backup-2026-11-01.json.gz --dry-run
//
// Options
//   --dry-run            show what would be restored, change nothing (do this first)
//   --tables=a,b         restore only these tables (default: all tables in the file)
//   --restore-roles      also put back each user's role and pay settings (app_metadata),
//                        matched by email; users themselves must already exist
//   --yes                skip the "type RESTORE" confirmation
//
// How it restores: every row in the backup is written back (insert, or overwrite
// the row with the same id). Rows created AFTER the backup are NOT deleted.
// Take a fresh backup before restoring so you can undo.

import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { createInterface } from 'node:readline/promises'

const args = process.argv.slice(2)
const filePath = args.find(a => !a.startsWith('--'))
const dryRun = args.includes('--dry-run')
const restoreRoles = args.includes('--restore-roles')
const skipConfirm = args.includes('--yes')
const onlyTables = (args.find(a => a.startsWith('--tables=')) || '').replace('--tables=', '').split(',').map(s => s.trim()).filter(Boolean)

// Parents before children, so links between tables resolve
const ORDER = [
  'factory_loose_lots', 'factory_packet_catalog', 'factory_blends', 'factory_blend_lots_used',
  'factory_history', 'factory_serial_counter', 'factory_stock_takes', 'factory_stock_take_counts',
  'products', 'retailers', 'shifts', 'sales_records', 'retailer_visits',
  'employee_targets', 'daily_operational_targets', 'logs', 'log_archives'
]

if (!filePath) {
  console.error('Usage: node scripts/restore-backup.mjs <backup.json.gz> [--dry-run] [--tables=a,b] [--restore-roles] [--yes]')
  process.exit(1)
}

const raw = readFileSync(filePath)
const json = filePath.endsWith('.gz') ? gunzipSync(raw).toString('utf8') : raw.toString('utf8')
const backup = JSON.parse(json)
if (backup.app !== 'ledo-valley-erp' || !backup.tables) {
  console.error('This does not look like a Ledo Valley ERP backup file.')
  process.exit(1)
}

const tables = Object.keys(backup.tables)
  .filter(t => t !== '_auth_users')
  .filter(t => onlyTables.length === 0 || onlyTables.includes(t))
  .sort((a, b) => (ORDER.indexOf(a) === -1 ? 999 : ORDER.indexOf(a)) - (ORDER.indexOf(b) === -1 ? 999 : ORDER.indexOf(b)))

console.log(`Backup taken: ${backup.createdAt}`)
for (const t of tables) console.log(`  ${t}: ${backup.tables[t].length} rows`)
if (restoreRoles) console.log(`  user roles/pay settings: ${(backup.tables._auth_users || []).length} users`)

if (dryRun) {
  console.log('\nDry run: nothing was changed.')
  process.exit(0)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.')
  process.exit(1)
}

if (!skipConfirm) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(`\nThis overwrites matching rows in ${url}. Type RESTORE to continue: `)
  rl.close()
  if (answer.trim() !== 'RESTORE') {
    console.log('Cancelled.')
    process.exit(0)
  }
}

// Loaded only when actually restoring, so --dry-run works anywhere
const { createClient } = await import('@supabase/supabase-js')
const supabase = createClient(url, key, { auth: { persistSession: false } })
let failed = false

for (const t of tables) {
  const rows = backup.tables[t]
  let done = 0
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500)
    const { error } = await supabase.from(t).upsert(batch)
    if (error) {
      console.error(`  ${t}: FAILED at rows ${i + 1}-${i + batch.length}: ${error.message}`)
      failed = true
      break
    }
    done += batch.length
  }
  console.log(`  ${t}: ${done}/${rows.length} restored`)
}

if (restoreRoles) {
  const saved = backup.tables._auth_users || []
  const current = []
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    current.push(...data.users)
    if (data.users.length < 1000) break
  }
  let restored = 0
  for (const s of saved) {
    const u = current.find(c => c.email && s.email && c.email.toLowerCase() === s.email.toLowerCase())
    if (!u) { console.log(`  user ${s.email}: not found, skipped (create the user first)`); continue }
    const { error } = await supabase.auth.admin.updateUserById(u.id, { app_metadata: { ...u.app_metadata, ...s.app_metadata } })
    if (error) { console.error(`  user ${s.email}: FAILED ${error.message}`); failed = true } else restored++
  }
  console.log(`  user roles/pay settings: ${restored}/${saved.length} restored`)
}

console.log(failed ? '\nFinished with errors (see above).' : '\nRestore complete.')
process.exit(failed ? 1 : 0)
