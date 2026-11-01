# Review fixes (on top of commit 796dfd0): how to apply them

This patch fixes all 29 issues in *Ledo-Valley-ERP-Review-Updated-Code.pdf*
(B1–B3, D1–D8, S1–S3, A1–A3, R1–R2, F1–F9). Your four migrations are kept
unchanged; one new migration, `20261102_review_fixes.sql`, upgrades the database
from the state they leave.

## Before you start: how to "wipe and start fresh"

**Empty the data in your existing Supabase project. Don't create a new project.**
Only the factory tables are defined in `supabase/migrations/`. The sales, shifts,
retailers, products, targets and logs tables were created by hand and are not in
the repo, so a new project would not have them. (To change that, run
`npx supabase db pull` once and commit the result.)

To empty the factory data (keeps tables, users and settings):

```sql
TRUNCATE public.factory_stock_take_counts, public.factory_stock_takes,
         public.factory_blend_lots_used, public.factory_blends,
         public.factory_history, public.factory_loose_lots,
         public.factory_packet_catalog;
```

Add `public.sales_records, public.retailer_visits, public.shifts` (and others) only
if you also want to clear sales data. Re-create your system ledger lots
(`l-balance` etc.) and packet products afterwards, as you did originally.

## Apply in this order

1. **Back up** (Supabase > Database > Backups), even before wiping.
2. **Run the new migration** in the Supabase SQL editor:
   `supabase/migrations/20261102_review_fixes.sql`.
   Your database has already run the earlier ones. On a brand-new database, run all
   six files in name order. It is safe to run twice.
3. **Check roles and pay.** The migration copies each user's pay settings to the
   protected place. Look over everyone once, since a user could have changed their own
   values before this fix:
   ```sql
   SELECT email, raw_app_meta_data FROM auth.users ORDER BY email;
   ```
   Fix any wrong role or pay in the app (Users screen) or with:
   ```sql
   UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
    WHERE email = 'you@example.com';
   ```
   Everyone should log out and in again so their session carries the protected role.
4. **Set environment variables** in Vercel:
   - `CRON_SECRET` (required): a long random string. Used by the nightly backup and log cleanup.
   - `DELETE_PASSWORD` (optional): changes the delete password from `2222`.
   - `RESEND_API_KEY` + `BACKUP_EMAIL_TO` (optional): email a copy of each backup.
5. **Make the `log_archives` and `backups` storage buckets private.**
6. **Run `npm run build` and `npm run lint`**, then deploy. `vercel.json` schedules the
   backup for 2:00 am India time.
7. **Run the backup once** from Vercel > Settings > Cron Jobs, and check Supabase
   Storage > `backups/daily`.

## Test before real use

Refresh the page after every step and check the numbers in Supabase match the screen.

- Receive a lot. Create a blend: the name ends in `| SL-01`.
- **Edit** that blend (more bags): it saves, keeps SL-01, old lots returned, new deducted.
- Create two more blends, tick both, **Merge**: one new blend with a new SL, stock unchanged,
  Gap Analysis shows no gaps.
- **Duplicate** a blend: new SL, stock deducted once.
- **Finalize**: packet stock up, returned loose tea added to the balance lot; History
  shows it with yield and variance.
- A blend that uses a whole lot, then **Purge NIL stock**: that lot is kept while the blend
  is under process.
- Delete a blend, a lot, a packet product: each asks for the delete password; a wrong
  password deletes nothing.
- Edit a lot's label while someone else makes a blend from it in another tab: the label
  saves, the other person's deduction stays.
- **Stock take**: count a few lots, Review, Update stock.
- Sales user: record a sale; their shift totals go up. In the browser console,
  `await supabase.auth.updateUser({ data: { role: 'admin' } })` then reload: still a sales user.

## What changed

| Area | Files |
|---|---|
| Database | `supabase/migrations/20261102_review_fixes.sql` (new) |
| Factory | `factory/actions.ts`, `factory/page.tsx`, `FactoryDashboardClient.tsx`, `BlendModule.tsx`, `ProcessModule.tsx`, `InventoryModule.tsx`, `HistoryModule.tsx`, `types/factory.ts` |
| Roles and pay | `utils/authRoles.ts` (protected role only), `users/actions.ts`, `UsersClient.tsx`, `login/actions.ts`, all dashboard pages and actions that check a role, `LedgerClient.tsx` |
| Sales and shifts | `dashboard/actions.ts`, `sales/actions.ts`, `SalesClient.tsx` |
| Backups and logs | `vercel.json` (new), `cron/archive-logs/route.ts`, `portal/page.tsx` |
| Delete password | ERP `settings` and `users` screens and actions (factory ones in Factory) |
| Optional script | `scripts/migrate-roles-to-app-metadata.mjs` (the SQL migration already does this) |

## Behaviour to be aware of

- The SL number is set by the database when a blend is saved; the preview shows
  "SL-(assigned on save)".
- A blend whose lot was deleted can't be deleted or edited until the lot exists again
  (the app refuses rather than losing that tea). With the fixes, the app itself no longer
  deletes such lots; this only happens if a lot is deleted directly in Supabase.
- Lot and packet-product stock edits are refused if someone changed that stock meanwhile.
- Deleting a user or a product is still a hard delete. Before relying on it, run this once;
  any `CASCADE` means related records would be deleted too:
  ```sql
  SELECT conrelid::regclass, pg_get_constraintdef(oid) FROM pg_constraint
   WHERE confrelid IN ('public.products'::regclass, 'auth.users'::regclass);
  ```
  Prefer deactivating products; for users, remove their role instead of deleting.

## How this was checked

- All six migrations were run in order on a fresh PostgreSQL 16 database (with stand-ins
  for Supabase's auth schema and roles), and the new one was run twice.
- Tested there: create, edit, merge, duplicate-style create, finalize, delete; serial numbers
  (no gaps after failed attempts, screen-sent SL replaced); bags and weight validation;
  packet weight from the catalog; refusing to lose stock when a lot is missing; logged-in and
  logged-out users refused on every stock function; shift functions limited to the caller's
  own active shift with no negative amounts; stock take apply; every history row gets an id.
- Every one of the 29 issues was checked against the code, and the TypeScript type check
  shows no new errors compared with the original code.
- **Not run:** `npm run build`, `npm run lint`, or the screens in a browser (packages can't be
  installed in the review workspace). Do step 6 and the test list above before real use.
