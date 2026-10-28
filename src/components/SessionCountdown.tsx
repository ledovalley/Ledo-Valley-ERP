'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { SESSION_EXPIRES_COOKIE, SESSION_DURATION_MS } from '@/utils/sessionConfig';

export default function SessionCountdown({ lastSignInAt }: { lastSignInAt: string | undefined }) {
  const [timeLeft, setTimeLeft] = useState<string>('Calculating...');
  const [isExpiring, setIsExpiring] = useState(false);

  useEffect(() => {
    // Read session cookie if present
    const getTargetExpiry = (): number => {
      const match = document.cookie.match(new RegExp('(^|;\\s*)' + SESSION_EXPIRES_COOKIE + '=([^;]+)'));
      if (match && match[2]) {
        const val = parseInt(match[2], 10);
        if (!isNaN(val)) return val;
      }
      if (lastSignInAt) {
        return new Date(lastSignInAt).getTime() + SESSION_DURATION_MS;
      }
      return Date.now() + SESSION_DURATION_MS;
    };

    const targetExpiry = getTargetExpiry();

    const handleLogout = async () => {
      setIsExpiring(true);
      setTimeLeft('Logging out...');
      try {
        const supabase = createClient();
        await supabase.auth.signOut();
      } catch {}
      // Clear session cookie
      document.cookie = `${SESSION_EXPIRES_COOKIE}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      window.location.href = '/login?reason=expired';
    };

    const calculateTimeLeft = () => {
      const now = Date.now();
      const difference = targetExpiry - now;

      if (difference <= 0) {
        handleLogout();
        return;
      }

      const hours = Math.floor(difference / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      } else if (minutes > 0) {
        setTimeLeft(`${minutes}m ${seconds}s`);
      } else {
        setTimeLeft(`${seconds}s`);
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [lastSignInAt]);

  return (
    <div className="flex items-center justify-between text-xs font-mono font-medium text-orange-950 pt-0.5">
      <span className="text-[11px] text-orange-800 font-sans">Remaining:</span>
      <span className={`font-bold px-2 py-0.5 rounded-lg border shadow-2xs transition-all ${
        isExpiring 
          ? 'text-red-700 bg-red-100 border-red-300 animate-pulse' 
          : 'text-orange-700 bg-white/70 border-orange-200/60'
      }`}>
        {timeLeft}
      </span>
    </div>
  );
}

