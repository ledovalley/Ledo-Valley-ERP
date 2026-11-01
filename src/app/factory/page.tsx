import { getCachedUser } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import {
  fetchLooseLots,
  fetchPacketCatalog,
  fetchUnderProcessBlends,
  fetchFactoryHistory,
  fetchMissingSerials
} from "./actions";
import { signOut } from "@/app/dashboard/actions";
import FactoryDashboardClient from "./FactoryDashboardClient";
import { CatalogProduct } from "@/types/factory";
import { connection } from "next/server";

export const instant = false;

export default async function FactoryPage() {
  await connection();
  const user = await getCachedUser();

  if (!user) {
    redirect("/login");
  }

  const role = (user.app_metadata?.role as string) || "";
  const email = user.email || "";
  const name = user.user_metadata?.name || email.split("@")[0];
  const lastSignInAt = user.last_sign_in_at;

  // Fetch initial state in parallel
  // These throw on a database error, so the page shows an error instead of
  // empty lists that look like lost data.
  const [lots, blends, historyRows, catalogProducts, missingSerials] = await Promise.all([
    fetchLooseLots(),
    fetchUnderProcessBlends(),
    fetchFactoryHistory(),
    fetchPacketCatalog(),
    fetchMissingSerials()
  ]);

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
      initialMissingSerials={missingSerials}
      userRole={role}
      userEmail={email}
      userName={name}
      userId={user.id}
      lastSignInAt={lastSignInAt}
      signOutAction={signOut}
    />
  );
}
