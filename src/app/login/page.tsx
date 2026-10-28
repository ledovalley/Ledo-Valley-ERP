"use client";

import { useState, useTransition, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Lock, Mail, Loader2, Eye, EyeOff, AlertCircle } from "lucide-react";
import { login } from "./actions";

function LoginForm() {
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, startTransition] = useTransition();
  const searchParams = useSearchParams();
  const isExpired = searchParams.get('reason') === 'expired';

  const handleAction = async (formData: FormData) => {
    setError("");
    startTransition(async () => {
      const result = await login(formData);
      if (result?.error) {
        setError(result.error);
      }
    });
  };

  return (
    <form action={handleAction} className="space-y-4">
      {isExpired && !error && (
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200/90 text-amber-800 text-xs font-medium flex items-center gap-2.5 animate-in fade-in shadow-2xs">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Your session has expired. Please sign in again to continue.</span>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-2xl bg-red-50 border border-red-200/80 text-red-600 text-xs font-medium animate-in fade-in">
          {error}
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-700">Email Address</label>
        <div className="relative">
          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="email"
            name="email"
            className="w-full bg-white border border-slate-200 rounded-full h-11 sm:h-10 pl-10 pr-4 text-sm sm:text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all shadow-2xs"
            placeholder="name@ledovalley.com"
            required
            autoComplete="email"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-700">Password</label>
        <div className="relative">
          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type={showPassword ? "text" : "password"}
            name="password"
            className="w-full bg-white border border-slate-200 rounded-full h-11 sm:h-10 pl-10 pr-11 text-sm sm:text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all shadow-2xs"
            placeholder="••••••••••••"
            required
            autoComplete="current-password"
          />
          <button 
            type="button" 
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 active:bg-slate-100 transition-colors"
            title={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-[#0D4728] hover:bg-[#167a44] active:scale-[0.99] text-[#FFF9CD] rounded-full h-11 sm:h-10 text-xs sm:text-sm font-semibold transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin text-[#FFF9CD]" />
          ) : (
            "Sign In to Dashboard"
          )}
        </button>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[#DCE2E8] p-3 xs:p-4 sm:p-6 md:p-8 relative overflow-hidden antialiased">
      {/* Background ambient effects in brand colors */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[#0D4728]/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[#E4B84D]/15 blur-[130px] pointer-events-none" />

      {/* Signature Dribbble Curved Canvas Frame */}
      <div className="w-full max-w-sm sm:max-w-md md:max-w-[960px] bg-white/95 backdrop-blur-xl border border-white/80 rounded-[28px] sm:rounded-[36px] md:rounded-[40px] shadow-[0_20px_50px_-12px_rgba(13,71,40,0.12)] overflow-hidden flex flex-col md:flex-row z-10 transition-all">
        
        {/* Left Side - Desktop Hero Banner (Visible on md+) */}
        <div className="hidden md:flex flex-col justify-between w-1/2 p-8 lg:p-12 bg-gradient-to-br from-[#0D4728] via-[#105430] to-[#072B18] relative overflow-hidden text-white">
          {/* Subtle geometric circles in brand gold */}
          <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-[#E4B84D]/10 blur-xl pointer-events-none" />
          <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-[#FFF9CD]/5 blur-xl pointer-events-none" />
          
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FFF9CD] text-[#0D4728] flex items-center justify-center font-bold text-sm shadow-md">
              LV
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[#FFF9CD]">Ledo Valley</h1>
              <p className="text-[10px] uppercase tracking-widest text-[#FFF9CD]/70 font-semibold">Tea Estate & Agro ERP</p>
            </div>
          </div>

          <div className="relative z-10 space-y-4 my-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-[#FFF9CD] text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-[#E4B84D]" />
              Enterprise Platform
            </div>
            <h2 className="text-3xl font-light text-white leading-tight">
              Integrated Field & <br />
              <span className="font-semibold text-[#FFF9CD]">Agro Operations</span>
            </h2>
            <p className="text-emerald-100/80 text-xs leading-relaxed max-w-sm">
              Role-governed territory distribution, real-time sales logging, retailer network, and immutable audit logs.
            </p>
          </div>

          <div className="relative z-10 flex items-center gap-3 text-xs text-emerald-200/60">
            <span>&copy; 2026 Ledo Valley</span>
            <span>&bull;</span>
            <span>Secure Cloud Gateway</span>
          </div>
        </div>

        {/* Right Side - Form Container with Mobile-First Adaptability */}
        <div className="w-full md:w-1/2 p-6 sm:p-8 md:p-10 lg:p-12 flex flex-col justify-center bg-[#FAFBF8]">
          
          {/* Mobile-Only Brand Header (Shows brand identity on phones) */}
          <div className="md:hidden flex items-center justify-between pb-4 mb-5 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#0D4728] text-[#FFF9CD] flex items-center justify-center font-bold text-xs shadow-sm border border-[#0D4728]/20 shrink-0">
                LV
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h2 className="text-sm font-bold tracking-tight text-[#0D4728]">Ledo Valley</h2>
                  <span className="text-[9px] font-semibold bg-[#E4B84D]/25 text-[#8c6c1a] px-1.5 py-0.5 rounded-full">ERP</span>
                </div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Tea Estate & Agro Platform</p>
              </div>
            </div>
            <span className="text-[10px] font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Secure
            </span>
          </div>

          <div className="mb-6">
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Welcome back</h3>
            <p className="text-slate-500 text-xs sm:text-sm mt-1">Sign in with your authorized credentials</p>
          </div>

          <Suspense fallback={
            <div className="p-4 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-[#0D4728]" />
            </div>
          }>
            <LoginForm />
          </Suspense>

          {/* Mobile Footer Attribution */}
          <div className="md:hidden pt-6 mt-4 border-t border-slate-100 text-center">
            <p className="text-[11px] text-slate-400 font-medium">
              &copy; 2026 Ledo Valley Tea Co. &bull; Enterprise Cloud
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}

