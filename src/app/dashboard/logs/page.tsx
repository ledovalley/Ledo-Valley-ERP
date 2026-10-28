import { fetchLogs, fetchArchives } from "./actions";
import LogsClient from "./LogsClient";
import { connection } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export const instant = false;

export default async function LogsPage() {
  await connection();
  // System logs disabled for now
  redirect('/unauthorized');
}
