-- =============================================================================
-- Sign a person out of every device (used when an admin changes their password)
--
-- Deletes that person's login sessions (and their refresh tokens), so every phone
-- or browser they were logged in on is asked to log in again straight away.
-- Nothing else is touched: no shifts, orders, users or roles.
--
-- Only the server (service role) can call it; the app checks the caller is an
-- admin first. Safe to run more than once.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_revoke_user_sessions(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_sessions INTEGER;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'A user is required.';
  END IF;
  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_sessions = ROW_COUNT;
  -- any refresh token not tied to a session (older logins)
  DELETE FROM auth.refresh_tokens WHERE user_id = p_user_id::text;
  RETURN v_sessions;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_revoke_user_sessions(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_revoke_user_sessions(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
