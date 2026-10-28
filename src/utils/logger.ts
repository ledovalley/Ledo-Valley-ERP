import { supabaseAdmin } from './supabase/admin';
import { createClient } from './supabase/server';

type LogType = 'system' | 'error';

export async function logEvent(type: LogType, message: string, details: Record<string, any> = {}) {
  try {
    let userId = null;
    
    // Attempt to safely grab the currently authenticated user if this is called in a request context
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      if (data?.user?.id) {
        userId = data.user.id;
      }
    } catch (e) {
      // It's fine if we fail to get a user (e.g., if this is running in a background cron job)
    }

    const { error } = await supabaseAdmin.from('logs').insert({
      level: type === 'error' ? 'error' : 'info',
      type,
      message,
      context: details,
      details,
      user_id: userId
    });

    if (error) {
      console.error("[CRITICAL] Failed to write log to DB:", error.message);
    }
  } catch (err) {
    console.error("[CRITICAL] Fatal error in logEvent:", err);
  }
}
