import { fetchLogs, fetchArchives } from "./actions";
import LogsClient from "./LogsClient";
import { connection } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export const instant = false;

export default async function LogsPage() {
  await connection();
  
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const role = user?.user_metadata?.role;

  if (role !== 'admin') {
    redirect('/unauthorized');
  }

  // Pre-fetch initial page of logs (50 limit) and the archives
  const [initialSystemLogs, initialErrorLogs, archives] = await Promise.all([
    fetchLogs('system', 1, 50),
    fetchLogs('error', 1, 50),
    fetchArchives()
  ]);

  return (
    <LogsClient 
      initialSystemLogs={initialSystemLogs} 
      initialErrorLogs={initialErrorLogs} 
      archives={archives} 
    />
  );
}
