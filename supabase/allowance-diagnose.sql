-- READ-ONLY. Run in Supabase > SQL Editor. Shows how the allowance tables really look in your database.
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('allowance_corrections', 'allowance_payouts')
  AND column_name IN ('week_start', 'user_id', 'day_date', 'km', 'extra_amount', 'present', 'cancelled_at', 'id', 'save_id')
ORDER BY table_name, column_name;

SELECT p.oid::regprocedure AS function_signature
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('fn_save_allowance_correction', 'fn_allowance_corr_token');

SELECT tgrelid::regclass AS on_table, tgname FROM pg_trigger
WHERE NOT tgisinternal AND tgrelid IN ('public.allowance_corrections'::regclass, 'public.allowance_payouts'::regclass);
