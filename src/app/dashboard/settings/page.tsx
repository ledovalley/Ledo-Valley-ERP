import { connection } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { fetchAllProducts, fetchEligibleEmployees, fetchTargetsForMonth } from "./actions";
import SettingsClient from "./SettingsClient";

export const instant = false;

export default async function SettingsPage() {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const role = user?.user_metadata?.role || "employee";
  if (!['admin', 'manager'].includes(role)) {
    redirect('/unauthorized');
  }

  const name = user?.user_metadata?.name || user?.email?.split('@')[0] || "User";
  const email = user?.email || "";

  // Current year-month (YYYY-MM)
  const currentMonth = new Date().toISOString().slice(0, 7);

  // Fetch product catalog
  const products = await fetchAllProducts();

  // Fetch eligible employees below manager level
  const eligibleEmployees = await fetchEligibleEmployees();

  // Fetch existing targets for the current month
  const initialTargets = await fetchTargetsForMonth(currentMonth);

  return (
    <SettingsClient
      products={products}
      eligibleEmployees={eligibleEmployees}
      initialTargets={initialTargets}
      initialMonth={currentMonth}
      userRole={role}
      userName={name}
      userEmail={email}
    />
  );
}
