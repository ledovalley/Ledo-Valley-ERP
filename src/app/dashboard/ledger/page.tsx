import { connection } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { fetchEmployeeAuditLedger } from "@/app/dashboard/actions";
import LedgerClient from "./LedgerClient";

export const instant = false;

export default async function LedgerPage() {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const role = user?.user_metadata?.role || 'staff';
  const userId = user?.id || '';
  const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Team Member';

  // Fetch audit ledger records
  const initialAudit = await fetchEmployeeAuditLedger();

  // If Admin or Manager, also load users list for the dropdown filter
  let usersList: any[] = [];
  if (role === 'admin' || role === 'manager') {
    try {
      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
      usersList = usersData?.users || [];
    } catch (e) {
      // fallback
    }
  }

  return (
    <LedgerClient
      initialAudit={initialAudit}
      usersList={usersList}
      currentUserRole={role}
      currentUserId={userId}
      currentUserName={userName}
    />
  );
}
