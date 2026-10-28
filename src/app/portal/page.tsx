import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { ArrowRight, Factory, LayoutDashboard, Sparkles } from "lucide-react";
import { signOut } from "@/app/dashboard/actions";
import TopNavbar from "@/components/layout/TopNavbar";
import SessionMonitor from "@/components/auth/SessionMonitor";

export const instant = false;

export default async function PortalPage() {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = user.user_metadata?.role || "employee";
  const email = user.email || "";
  const initial = email.charAt(0).toUpperCase();
  const lastSignInAt = user.last_sign_in_at;

  return (
    <div className="min-h-screen bg-[#DCE2E8] flex flex-col justify-start antialiased selection:bg-[#0D4728]/15 selection:text-[#0D4728]">
      {/* Active Session Enforcer & Automatic Logout Monitor */}
      <SessionMonitor />

      {/* Signature Dribbble Curved Canvas Frame */}
      <div className="bg-gradient-to-br from-[#FAFBF8] via-[#F6F7F2] to-[#EEF1EB] p-4 sm:p-6 lg:p-8 flex-1 flex flex-col relative overflow-hidden justify-between">
        {/* Subtle Ambient Brand Atmosphere */}
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-[#0D4728]/5 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-[#E4B84D]/10 blur-3xl pointer-events-none" />

        {/* Unified TopNavbar from ERP */}
        <TopNavbar
          userRole={role}
          userEmail={email}
          initial={initial}
          lastSignInAt={lastSignInAt}
          signOutAction={signOut}
        />

        {/* Main Selection Hub */}
        <main className="relative z-10 max-w-5xl mx-auto w-full my-auto py-8">
          <div className="text-center max-w-xl mx-auto mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#0D4728]/10 text-[#0D4728] rounded-full text-xs font-bold mb-3">
              <Sparkles size={13} />
              <span>Select Workspace</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
              Where would you like to work today?
            </h2>
            <p className="text-sm text-slate-600 font-medium mt-2">
              Switch between modules anytime without having to re-authenticate.
            </p>
          </div>

          {/* The 2 Core Module Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Card 1: Ledo Valley ERP */}
            <Link
              href="/dashboard"
              className="group relative bg-white/90 hover:bg-white rounded-3xl p-8 border border-slate-200/80 shadow-[0_10px_30px_rgba(13,71,40,0.06)] hover:shadow-[0_20px_40px_rgba(13,71,40,0.12)] transition-all flex flex-col justify-between overflow-hidden cursor-pointer"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#0D4728]/10 to-transparent rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
              
              <div>
                <div className="w-14 h-14 rounded-2xl bg-[#0D4728]/10 group-hover:bg-[#0D4728] text-[#0D4728] group-hover:text-[#FFF9CD] flex items-center justify-center transition-colors mb-6 shadow-sm">
                  <LayoutDashboard size={28} />
                </div>

                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-black uppercase tracking-wider text-[#0D4728]">Sales & Accounts</span>
                </div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight group-hover:text-[#0D4728] transition-colors">
                  Ledo Valley ERP
                </h3>
                <p className="text-sm text-slate-600 font-medium mt-3 leading-relaxed">
                  Sales orders, daily shift closing, general ledger, retailer directory, user permissions, and financial audit logs.
                </p>
              </div>

              <div className="pt-8 border-t border-slate-100 flex items-center justify-between mt-6">
                <span className="text-xs font-bold text-slate-500">Core Financial Platform</span>
                <div className="flex items-center gap-2 text-sm font-bold text-[#0D4728] group-hover:translate-x-1 transition-transform">
                  <span>Enter ERP</span>
                  <ArrowRight size={16} />
                </div>
              </div>
            </Link>

            {/* Card 2: Factory & Tea Blending */}
            <Link
              href="/factory"
              className="group relative bg-white/90 hover:bg-white rounded-3xl p-8 border border-slate-200/80 shadow-[0_10px_30px_rgba(228,184,77,0.08)] hover:shadow-[0_20px_40px_rgba(228,184,77,0.16)] transition-all flex flex-col justify-between overflow-hidden cursor-pointer"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#E4B84D]/20 to-transparent rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
              
              <div>
                <div className="w-14 h-14 rounded-2xl bg-[#E4B84D]/20 group-hover:bg-[#0D4728] text-[#9A7216] group-hover:text-[#FFF9CD] flex items-center justify-center transition-colors mb-6 shadow-sm">
                  <Factory size={28} />
                </div>

                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-black uppercase tracking-wider text-[#9A7216]">Operations & Blends</span>
                </div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight group-hover:text-[#0D4728] transition-colors">
                  Factory & Tea Blending
                </h3>
                <p className="text-sm text-slate-600 font-medium mt-3 leading-relaxed">
                  Loose tea receiving, recipe blend formulation, live under-process batch management, and lot-level traceability.
                </p>
              </div>

              <div className="pt-8 border-t border-slate-100 flex items-center justify-between mt-6">
                <span className="text-xs font-bold text-slate-500">Tea Processing Engine</span>
                <div className="flex items-center gap-2 text-sm font-bold text-[#0D4728] group-hover:translate-x-1 transition-transform">
                  <span>Enter Factory</span>
                  <ArrowRight size={16} />
                </div>
              </div>
            </Link>
          </div>
        </main>

        {/* Footer */}
        <footer className="relative z-10 text-center py-4 text-xs font-semibold text-slate-500">
          Ledo Valley Tea Co. &bull; Enterprise Operating System
        </footer>
      </div>
    </div>
  );
}
