/**
 * Centralized Session Lifetime Configuration
 *
 * Current Mode: TESTING (30 seconds)
 * Production Default: 48 hours (48 * 60 * 60 = 172800 seconds)
 *
 * To fall back to 48 hours after testing, change SESSION_DURATION_SECONDS to:
 * export const SESSION_DURATION_SECONDS = 48 * 60 * 60;
 */

export const SESSION_DURATION_SECONDS = 48 * 60 * 60; // 48 hours = 172800 seconds
export const SESSION_DURATION_MS = SESSION_DURATION_SECONDS * 1000;

export const SESSION_EXPIRES_COOKIE = 'lv_session_expires_at';
export const SESSION_START_COOKIE = 'lv_session_started_at';
