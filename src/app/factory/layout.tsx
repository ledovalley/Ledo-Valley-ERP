import { getCachedUser } from "@/utils/supabase/server";
import { connection } from "next/server";
import SessionMonitor from "@/components/auth/SessionMonitor";

export const instant = false;

export default async function FactoryLayout({ children }: { children: React.ReactNode }) {
  await connection();
  await getCachedUser();

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden print:h-auto bg-[#DCE2E8] print:bg-white flex flex-col justify-start antialiased selection:bg-[#0D4728]/15 selection:text-[#0D4728]">
      {/* Active Session Enforcer & Automatic Logout Monitor */}
      <SessionMonitor />

      {/* Signature Dribbble Curved Canvas Frame */}
      <div className="bg-gradient-to-br from-[#FAFBF8] via-[#F6F7F2] to-[#EEF1EB] print:bg-none print:p-0 p-3 sm:p-5 lg:p-6 flex-1 flex flex-col relative w-full max-w-full overflow-hidden print:h-auto">
        {/* Ambient Brand Atmosphere (Subtle bottom-left only to keep top navbar header pristine) */}
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-[#E4B84D]/10 blur-3xl pointer-events-none print:hidden" />

        {/* Dynamic Page Content */}
        <div className="flex-1 flex flex-col w-full max-w-full print:block print:h-auto print:overflow-visible">
          {children}
        </div>
      </div>
    </div>
  );
}
