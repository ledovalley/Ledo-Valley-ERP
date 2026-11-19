-- =============================================================================
-- Ledo Valley ERP: live database health check (READ-ONLY, changes nothing)
--
-- Run in Supabase > SQL Editor. Every line says OK, or MISSING / PROBLEM with
-- what to do. Safe to run any time, as often as you like.
-- =============================================================================
WITH checks(area, item, ok, fix) AS (
  -- ---------- database pieces from the SQL files ----------
  SELECT 'Setup', 'Delivery columns on orders',
         (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='sales_records' AND column_name IN ('delivery_status','delivered_at')) = 2,
         'Run 20261111_sales_delivery_columns.sql'
  UNION ALL SELECT 'Setup', 'Payments table + safe Collect (fn_record_sale_payment)',
         to_regclass('public.sales_payments') IS NOT NULL AND to_regproc('public.fn_record_sale_payment') IS NOT NULL,
         'Run 20261110_sales_payments.sql'
  UNION ALL SELECT 'Setup', 'Paid allowance weeks table (allowance_payouts)',
         to_regclass('public.allowance_payouts') IS NOT NULL, 'Run 20261113_allowance_payouts.sql'
  UNION ALL SELECT 'Setup', 'Paid weeks cannot be changed or deleted (guard)',
         EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_allowance_payouts_guard'), 'Run 20261113_allowance_payouts.sql'
  UNION ALL SELECT 'Setup', 'Sales totals in the database (fn_sales_summary)',
         to_regproc('public.fn_sales_summary') IS NOT NULL, 'Run 20261104_sales_summary.sql'
  UNION ALL SELECT 'Setup', 'Factory speed (lot list + Gap Analysis in one request)',
         to_regproc('public.fn_factory_loose_lots') IS NOT NULL AND to_regproc('public.fn_factory_missing_serials') IS NOT NULL
           AND to_regclass('public.idx_factory_blend_lots_lot_id') IS NOT NULL,
         'Run 20261109_factory_speed.sql'
  UNION ALL SELECT 'Setup', 'History paging and search over all history',
         to_regproc('public.fn_factory_history_page') IS NOT NULL AND to_regproc('public.fn_factory_history_filters') IS NOT NULL,
         'Run 20261112_history_pages.sql'
  UNION ALL SELECT 'Setup', 'Packet stock: Set All to Zero (fn_zero_packet_stock)',
         to_regproc('public.fn_zero_packet_stock') IS NOT NULL, 'Run 20261114_packet_stock_zero.sql'
  UNION ALL SELECT 'Setup', 'Sell loose tea from a lot, with undo (factory_loose_sales)',
         to_regclass('public.factory_loose_sales') IS NOT NULL AND to_regproc('public.fn_sell_loose_tea') IS NOT NULL
           AND to_regproc('public.fn_cancel_loose_sale') IS NOT NULL,
         'Run 20261116_loose_sales.sql'
  UNION ALL SELECT 'Protection', 'Loose tea sales cannot be edited or deleted (guard)',
         to_regclass('public.factory_loose_sales') IS NULL OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_factory_loose_sales_guard'),
         'Run 20261116_loose_sales.sql'
  UNION ALL SELECT 'Setup', 'Cancel a sale / delete a retailer (sales_cancelled)',
         to_regclass('public.sales_cancelled') IS NOT NULL AND to_regproc('public.fn_cancel_sale') IS NOT NULL
           AND to_regproc('public.fn_delete_retailer') IS NOT NULL AND to_regproc('public.fn_restore_retailer') IS NOT NULL
           AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='retailers' AND column_name='is_active'),
         'Run 20261117_sale_cancel_retailer_delete.sql'
  UNION ALL SELECT 'Setup', 'Cash from cancelled orders comes off the next shift (trigger on shifts)',
         to_regclass('public.sales_cancelled') IS NULL OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_shift_apply_cash_refunds' AND tgenabled <> 'D'),
         'Run 20261117_sale_cancel_retailer_delete.sql'
  UNION ALL SELECT 'Protection', 'Cancelled orders cannot be edited or deleted (guard)',
         to_regclass('public.sales_cancelled') IS NULL OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sales_cancelled_guard'),
         'Run 20261117_sale_cancel_retailer_delete.sql'
  UNION ALL SELECT 'Setup', 'Admin corrections to allowances (allowance_corrections)',
         to_regclass('public.allowance_corrections') IS NOT NULL AND to_regproc('public.fn_save_allowance_correction') IS NOT NULL
           AND to_regproc('public.fn_allowance_corr_token') IS NOT NULL,
         'Run 20261118_allowance_corrections.sql'
  UNION ALL SELECT 'Setup', 'Retailer insights (Sales -> Insights tab)',
         to_regproc('public.fn_retailer_insights') IS NOT NULL AND to_regproc('public.fn_no_order_reasons') IS NOT NULL,
         'Run 20261119_retailer_insights.sql'
  UNION ALL SELECT 'Setup', 'Sign a person out of all devices when their password changes (fn_revoke_user_sessions)',
         to_regproc('public.fn_revoke_user_sessions') IS NOT NULL,
         'Run 20261120_revoke_sessions.sql'
  UNION ALL SELECT 'Safety', 'Shift totals can only be changed by the shift''s own sales person (fn_record_sale_on_shift, fn_increment_shift_visits)',
         (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname IN ('fn_record_sale_on_shift','fn_increment_shift_visits')
             AND NOT p.prosecdef AND pg_get_functiondef(p.oid) ILIKE '%not yours%') = 2,
         'Run 20261102_review_fixes.sql (section 5)'
  UNION ALL SELECT 'Protection', 'Allowance corrections cannot be edited or deleted (guard)',
         to_regclass('public.allowance_corrections') IS NULL OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_allowance_corrections_guard'),
         'Run 20261118_allowance_corrections.sql'
  UNION ALL SELECT 'Setup', 'Stock take (fn_apply_stock_take)',
         to_regproc('public.fn_apply_stock_take') IS NOT NULL, 'Run 20261101_stock_take.sql'
  -- ---------- protections ----------
  UNION ALL SELECT 'Protection', 'History is permanent (no edits or deletes)',
         EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_factory_history_read_only'), 'Run 20261103_gap_analysis_and_safety.sql'
  UNION ALL SELECT 'Protection', 'Every issued serial number is recorded permanently',
         EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_factory_blends_log_serial') AND to_regclass('public.factory_serial_log') IS NOT NULL,
         'Run 20261103_gap_analysis_and_safety.sql'
  UNION ALL SELECT 'Protection', 'Lots used by blends under process cannot be deleted',
         EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid WHERE p.proname = 'fn__guard_lot_delete'), 'Run 20261103_gap_analysis_and_safety.sql'
  UNION ALL SELECT 'Protection', 'Packed blends cannot be deleted',
         EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid WHERE p.proname = 'fn__guard_blend_delete'), 'Run 20261103_gap_analysis_and_safety.sql'
  UNION ALL SELECT 'Protection', 'Payment, history and allowance functions are server-only (not callable from the browser)',
         NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                      WHERE n.nspname = 'public'
                        AND p.proname IN ('fn_record_sale_payment','fn_apply_stock_take','fn_factory_history_page','fn_factory_missing_serials','fn_sales_summary','fn_zero_packet_stock','fn_sell_loose_tea','fn_cancel_loose_sale','fn_cancel_sale','fn_delete_retailer','fn_restore_retailer','fn_save_allowance_correction','fn_allowance_corr_token','fn_retailer_insights','fn_no_order_reasons','fn_revoke_user_sessions')
                        AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))),
         'Run the SQL file for the function listed as callable; send me a screenshot if it stays'
  UNION ALL SELECT 'Protection', 'Paid allowance, payment and cancelled-order records not readable from the browser',
         (to_regclass('public.allowance_payouts') IS NULL OR NOT has_table_privilege('anon', 'public.allowance_payouts', 'SELECT'))
           AND (to_regclass('public.sales_payments') IS NULL OR NOT has_table_privilege('anon', 'public.sales_payments', 'SELECT'))
           AND (to_regclass('public.sales_cancelled') IS NULL OR NOT (has_table_privilege('anon', 'public.sales_cancelled', 'SELECT') OR has_table_privilege('authenticated', 'public.sales_cancelled', 'SELECT')))
           AND (to_regclass('public.allowance_corrections') IS NULL OR NOT (has_table_privilege('anon', 'public.allowance_corrections', 'SELECT') OR has_table_privilege('authenticated', 'public.allowance_corrections', 'SELECT'))),
         'Send me a screenshot'
  UNION ALL SELECT 'Protection', 'Row security is on for every table (the browser key cannot read or change tables freely)',
         NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity),
         'Send me a screenshot of the query in note 2 below'
  UNION ALL SELECT 'Protection', 'Deleting a user never deletes their orders, shifts, visits or other records',
         NOT EXISTS (SELECT 1 FROM pg_constraint c
                      WHERE c.contype = 'f' AND c.confrelid = 'auth.users'::regclass AND c.confdeltype = 'c'
                        AND c.connamespace = 'public'::regnamespace),
         'Do not delete users until fixed. Send me a screenshot of the query in note 3 below'
  -- ---------- data after the fresh start ----------
  UNION ALL SELECT 'Data', 'No lot has negative stock',
         NOT EXISTS (SELECT 1 FROM public.factory_loose_lots WHERE bags < 0 OR weight < 0), 'Send me a screenshot (do not edit)'
  UNION ALL SELECT 'Data', 'No packet product has negative stock (short / excess may be negative)',
         NOT EXISTS (SELECT 1 FROM public.factory_packet_catalog WHERE stock < 0 AND id <> 'p-variance' AND name !~* 'short.*excess|excess.*short'), 'Send me a screenshot (do not edit)'
  UNION ALL SELECT 'Data', 'Serial counter is not behind the highest blend number',
         (SELECT COALESCE(max(last_serial), 0) FROM public.factory_serial_counter) >= (SELECT COALESCE(max(serial_no), 0) FROM public.factory_blends),
         'Send me a screenshot (new blends could get a used number)'
  UNION ALL SELECT 'Data', 'Every blend under process still has its lots recorded',
         NOT EXISTS (SELECT 1 FROM public.factory_blends b WHERE b.status <> 'PACKED' AND NOT EXISTS (SELECT 1 FROM public.factory_blend_lots_used u WHERE u.blend_id = b.id)),
         'Send me a screenshot'
  UNION ALL SELECT 'Data', 'Loose tea sales: bags and kg are valid',
         to_regclass('public.factory_loose_sales') IS NULL
           OR (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM public.factory_loose_sales WHERE bags <= 0 OR weight <= 0', false, true, '')))[1]::text::int = 0,
         'Send me a screenshot'
  UNION ALL SELECT 'Data', 'No more than one stock take open',
         (SELECT count(*) FROM public.factory_stock_takes WHERE status = 'OPEN') <= 1, 'Send me a screenshot'
  UNION ALL SELECT 'Data', 'Orders: paid + due adds up to the amount',
         NOT EXISTS (SELECT 1 FROM public.sales_records WHERE abs(COALESCE(cash_amount,0) + COALESCE(online_amount,0) + COALESCE(due_amount,0) - COALESCE(amount,0)) > 0.01),
         'Send me a screenshot (list the orders with the query in the note below)'
  UNION ALL SELECT 'Data', 'No order has negative money',
         NOT EXISTS (SELECT 1 FROM public.sales_records WHERE cash_amount < 0 OR online_amount < 0 OR due_amount < 0), 'Send me a screenshot'
  UNION ALL SELECT 'Data', 'Every order belongs to an existing retailer',
         NOT EXISTS (SELECT 1 FROM public.sales_records s WHERE s.retailer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.retailers r WHERE r.id = s.retailer_id)),
         'Send me a screenshot'
  UNION ALL SELECT 'Data', 'Only one running shift per person',
         NOT EXISTS (SELECT user_id FROM public.shifts WHERE status IN ('active','paused') GROUP BY user_id HAVING count(*) > 1), 'Send me a screenshot'
)
SELECT area, item, CASE WHEN ok THEN 'OK' ELSE 'MISSING / PROBLEM' END AS result, CASE WHEN ok THEN '' ELSE fix END AS what_to_do
  FROM checks
 ORDER BY (NOT ok) DESC, area, item;

-- Counts at a glance (read-only)
SELECT 'users' AS what, (SELECT count(*) FROM auth.users) AS rows
UNION ALL SELECT 'inventory lots (with stock)', (SELECT count(*) FROM public.factory_loose_lots WHERE weight > 0)
UNION ALL SELECT 'packet products', (SELECT count(*) FROM public.factory_packet_catalog)
UNION ALL SELECT 'blends (all)', (SELECT count(*) FROM public.factory_blends)
UNION ALL SELECT 'factory history entries', (SELECT count(*) FROM public.factory_history)
UNION ALL SELECT 'retailers', (SELECT count(*) FROM public.retailers)
UNION ALL SELECT 'orders', (SELECT count(*) FROM public.sales_records)
UNION ALL SELECT 'shifts', (SELECT count(*) FROM public.shifts)
UNION ALL SELECT 'next blend serial', (SELECT COALESCE(max(last_serial), 0) + 1 FROM public.factory_serial_counter);

-- Note: to list orders whose paid + due doesn't add up:
-- SELECT id, created_at, amount, cash_amount, online_amount, due_amount FROM public.sales_records
--  WHERE abs(COALESCE(cash_amount,0) + COALESCE(online_amount,0) + COALESCE(due_amount,0) - COALESCE(amount,0)) > 0.01;

-- Note 2: tables without row security, and who may change orders, shops and shifts
-- (read-only; send me a screenshot if any table is listed or a rule looks open):
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity;
-- SELECT tablename, policyname, cmd, roles, qual, with_check FROM pg_policies
--  WHERE schemaname = 'public' AND tablename IN ('sales_records','retailers','shifts','retailer_visits') AND cmd <> 'SELECT'
--  ORDER BY tablename, cmd;

-- Note 3: links from your tables to users, and what deleting a user does to them
-- (read-only; CASCADE means the rows are deleted along with the user):
-- SELECT conrelid::regclass AS table_name, conname,
--        CASE confdeltype WHEN 'c' THEN 'CASCADE (rows deleted with the user)' WHEN 'n' THEN 'set to empty'
--             WHEN 'r' THEN 'blocked (user cannot be deleted)' WHEN 'a' THEN 'blocked (user cannot be deleted)' ELSE confdeltype::text END AS on_user_delete
--   FROM pg_constraint WHERE contype = 'f' AND confrelid = 'auth.users'::regclass AND connamespace = 'public'::regnamespace;
