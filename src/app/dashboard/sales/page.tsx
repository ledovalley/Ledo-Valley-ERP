import { fetchRetailers, fetchSalesRecords, fetchProducts } from "./actions";
import SalesClient from "./SalesClient";
import { createClient } from "@/utils/supabase/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import { connection } from "next/server";

export const instant = false;

export default async function SalesPage() {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const currentUserRole = user?.user_metadata?.role || "employee";
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

  let usersList: any[] = [];
  if (['admin', 'manager'].includes(currentUserRole)) {
    try {
      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
      usersList = usersData?.users || [];
    } catch (e) {
      console.error("Fetch users error in SalesPage:", e);
    }
  }

  const [retailers, salesRecords, products] = await Promise.all([
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
