'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import {
  SESSION_EXPIRES_COOKIE,
  SESSION_START_COOKIE,
  SESSION_DURATION_MS,
  SESSION_DURATION_SECONDS,
} from '@/utils/sessionConfig';
import { Clock, AlertTriangle } from 'lucide-react';

export default function SessionMonitor() {
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [isExpiring, setIsExpiring] = useState(false);
  const hasTriggeredLogout = useRef(false);

  useEffect(() => {
    const supabase = createClient();

    // Listen to Supabase auth state change (e.g. if revoked remotely)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && !hasTriggeredLogout.current) {
        hasTriggeredLogout.current = true;
        window.location.href = '/login?reason=expired';
      }
    });

    const getTargetExpiry = (): number => {
      const match = document.cookie.match(new RegExp('(^|;\\s*)' + SESSION_EXPIRES_COOKIE + '=([^;]+)'));
      if (match && match[2]) {
        const val = parseInt(match[2], 10);
        if (!isNaN(val)) return val;
      }
      return Date.now() + SESSION_DURATION_MS;
    };

    const targetExpiry = getTargetExpiry();

    const performLogout = async () => {
      if (hasTriggeredLogout.current) return;
      hasTriggeredLogout.current = true;
      setIsExpiring(true);

      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.error('Error during automatic sign out:', e);
      }

      // Clear cookies
      document.cookie = `${SESSION_EXPIRES_COOKIE}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      document.cookie = `${SESSION_START_COOKIE}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;

      // Redirect immediately to login
      window.location.href = '/login?reason=expired';
    };

    const checkTimer = () => {
      const now = Date.now();
      const diffMs = targetExpiry - now;
      const remaining = Math.max(0, Math.floor(diffMs / 1000));

      setSecondsRemaining(remaining);

      if (remaining <= 0) {
        performLogout();
      }
    };

    checkTimer();
    const interval = setInterval(checkTimer, 1000);

    return () => {
      clearInterval(interval);
      subscription.unsubscribe();
    };
  }, []);

  // In test mode (<= 60s), show a helpful floating pill in the bottom corner
  const isTestMode = SESSION_DURATION_SECONDS <= 60;

  if (secondsRemaining === null) return null;

  return (
    <>
      {/* Floating Test Session Countdown Pill (Visible only during quick test mode) */}
      {isTestMode && (
        <div
          className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3.5 py-2 rounded-full shadow-lg border backdrop-blur-md transition-all text-xs font-mono select-none ${
            secondsRemaining <= 10
              ? 'bg-red-500/90 text-white border-red-600 animate-pulse'
              : 'bg-slate-900/85 text-[#FFF9CD] border-slate-700/60'
          }`}
          title="Session Test Timer: User will be automatically signed out when this reaches 0s"
        >
          {secondsRemaining <= 10 ? (
            <AlertTriangle className="w-3.5 h-3.5 text-white animate-bounce" />
          ) : (
            <Clock className="w-3.5 h-3.5 text-[#E4B84D]" />
          )}
          <span className="font-sans font-medium text-[11px] text-white/80">
            {isExpiring
              ? 'Logging out...'
              : secondsRemaining <= 10
              ? 'Session expiring in:'
              : 'Test Session:'}
          </span>
          <span className="font-bold tracking-tight text-white">
            {secondsRemaining}s
          </span>
        </div>
      )}
    </>
  );
}
