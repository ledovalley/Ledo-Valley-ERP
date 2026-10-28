import { ShieldAlert, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 relative overflow-hidden">
      {/* Background ambient effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-red-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-brand-primary/10 blur-[120px] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center text-center p-8 max-w-md bg-white/80 backdrop-blur-xl border border-slate-200 rounded-3xl shadow-xl">
        <div className="w-20 h-20 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mb-6 shadow-md shadow-red-500/10">
          <ShieldAlert className="w-10 h-10 text-red-500" />
        </div>
        
        <h1 className="text-4xl font-bold text-slate-900 mb-3 tracking-tight">Access Denied</h1>
        <p className="text-slate-500 mb-8 leading-relaxed">
          You do not have the required permissions to view this page. If you believe this is a mistake, please contact your system administrator.
        </p>

        <Link 
          href="/dashboard"
          className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-900 px-6 py-3 rounded-xl font-medium transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
