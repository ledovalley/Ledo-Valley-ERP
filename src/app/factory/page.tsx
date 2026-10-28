import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import {
  fetchLooseLots,
  fetchUnderProcessBlends,
  fetchFactoryHistory
} from "./actions";
import { fetchAllProducts } from "@/app/dashboard/settings/actions";
import { signOut } from "@/app/dashboard/actions";
import FactoryDashboardClient from "./FactoryDashboardClient";
import { CatalogProduct } from "@/types/factory";
import { connection } from "next/server";

export const instant = false;

export default async function FactoryPage() {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = user.user_metadata?.role || "employee";
  const email = user.email || "";
  const name = user.user_metadata?.name || email.split("@")[0];
  const lastSignInAt = user.last_sign_in_at;

  // Fetch initial state in parallel
  const [lots, blends, historyRows, productsData] = await Promise.all([
    fetchLooseLots(),
    fetchUnderProcessBlends(),
    fetchFactoryHistory(),
    fetchAllProducts()
  ]);

  // Map ERP products to CatalogProduct format
  const catalogProducts: CatalogProduct[] = productsData.map((p: any) => ({
    id: p.id,
    name: p.name,
    unit: p.unit || "kg",
    size: p.size || 1,
    stock: p.stock || 0,
    hsnCode: p.hsn_code,
    gstRate: p.gst_rate
  }));

  // Map history rows to HistoryRecord
  const historyRecords = historyRows.map((h: any) => ({
    id: h.id,
    type: h.type,
    desc: h.description,
    timestamp: h.timestamp,
    userId: h.user_id,
    userName: h.user_name,
    details: h.details
  }));

  return (
    <FactoryDashboardClient
      initialLots={lots}
      initialBlends={blends}
      initialHistory={historyRecords}
      initialProducts={catalogProducts}
      userRole={role}
      userEmail={email}
      userName={name}
      userId={user.id}
      lastSignInAt={lastSignInAt}
      signOutAction={signOut}
    />
  );
}
