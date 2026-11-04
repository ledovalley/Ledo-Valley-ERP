import { fetchRetailers, fetchSalesRecords, fetchProducts } from "./actions";
import SalesClient from "./SalesClient";
import { createClient } from "@/utils/supabase/server";
import { listAllUsersCached } from "@/utils/usersList";
import { connection } from "next/server";

export const instant = false;

export default async function SalesPage() {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const currentUserRole = user?.app_metadata?.role || "employee";
  const currentUserId = user?.id || "";
  const currentUserName = user?.user_metadata?.name || user?.email?.split('@')[0] || "Team Member";

  // All authenticated employees can view Sales & Retailers (admin/manager see all, others see their own)
  if (!user) {
    return (
      <div className="p-8 text-center text-red-500 font-medium">
        Please sign in to view Sales Management.
      </div>
    );
  }

  // Everything loads at the same time
  const [usersList, retailers, salesRecords, products] = await Promise.all([
    ['admin', 'manager'].includes(currentUserRole)
      ? listAllUsersCached().catch((e) => { console.error("Fetch users error in SalesPage:", e); return [] as any[]; })
      : Promise.resolve([] as any[]),
    fetchRetailers(),
    fetchSalesRecords(),
    fetchProducts()
  ]);

  return (
    <div className="w-full">
      <SalesClient 
        retailers={retailers} 
        salesRecords={salesRecords} 
        products={products}
        usersList={usersList}
        currentUserRole={currentUserRole}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
      />
    </div>
  );
}
