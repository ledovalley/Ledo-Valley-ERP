-- ==============================================================================
-- Migration: Migrate User Roles from user_metadata to app_metadata (Fix C2)
-- Date: 2026-11-01
-- Description:
--   Copies existing role definitions from auth.users.raw_user_meta_data to
--   auth.users.raw_app_meta_data. This prevents authenticated users from modifying
--   their role via supabase.auth.updateUser() on the client.
-- ==============================================================================

DO $$
BEGIN
    UPDATE auth.users
    SET raw_app_meta_data = 
        COALESCE(raw_app_meta_data, '{}'::jsonb) || 
        jsonb_build_object(
            'role', 
            COALESCE(
                raw_app_meta_data->>'role', 
                raw_user_meta_data->>'role', 
                'employee'
            )
        )
    WHERE raw_app_meta_data->>'role' IS NULL;
END $$;

