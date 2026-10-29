import { createClient } from "@/utils/supabase/server";
import { connection } from "next/server";
import SessionMonitor from "@/components/auth/SessionMonitor";

export const instant = false;

export default async function FactoryLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const supabase = await createClient();
  await supabase.auth.getUser();

  return (
    <div className="h-screen print:h-auto bg-[#DCE2E8] print:bg-white flex flex-col justify-start antialiased selection:bg-[#0D4728]/15 selection:text-[#0D4728] overflow-hidden print:overflow-visible">
      {/* Active Session Enforcer & Automatic Logout Monitor */}
      <SessionMonitor />

      {/* Signature Dribbble Curved Canvas Frame */}
      <div className="bg-gradient-to-br from-[#FAFBF8] via-[#F6F7F2] to-[#EEF1EB] print:bg-none print:p-0 p-4 sm:p-6 lg:p-8 flex-1 flex flex-col relative overflow-hidden print:overflow-visible h-full print:h-auto">
        {/* Ambient Brand Atmosphere */}
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-[#0D4728]/5 blur-3xl pointer-events-none print:hidden" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-[#E4B84D]/10 blur-3xl pointer-events-none print:hidden" />

        {/* Dynamic Page Content */}
        <div className="flex-1 min-h-0 flex flex-col print:block print:h-auto print:overflow-visible">
          {children}
        </div>
      </div>
    </div>
  );
}
