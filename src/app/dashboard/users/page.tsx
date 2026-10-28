import { fetchUsers } from "./actions";
import UsersClient from "./UsersClient";
import { createClient } from "@/utils/supabase/server";
import { connection } from "next/server";

export const instant = false;

export default async function UsersPage() {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const currentUserRole = user?.user_metadata?.role || "employee";

  // Prevent non-admins from viewing User Management
  if (currentUserRole !== 'admin') {
    return (
      <div className="p-8 text-center text-red-500 font-medium">
        Unauthorized to view User Management.
      </div>
    );
  }

  const users = await fetchUsers();

  return (
    <div className="w-full">
      <UsersClient users={users} currentUserRole={currentUserRole} />
    </div>
  );
}
