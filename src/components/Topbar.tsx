import React from 'react';
import { LogOut, Sparkles } from 'lucide-react';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';

interface TopbarProps {
  activeTitle: string | undefined;
}

export default function Topbar({ activeTitle }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 hidden h-[76px] shrink-0 border-b border-[#0B172B]/8 bg-[#F0F5F9]/92 backdrop-blur-xl md:flex">
      <div className="flex w-full items-center justify-between px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#0B172B]/8 bg-white shadow-[0_10px_30px_rgba(11,23,43,0.08)]">
            <Sparkles size={18} className="text-[#009965]" />
          </div>

          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#0B172B]/45">
              Workspace
            </p>
            <h2 className="truncate text-[22px] font-semibold capitalize tracking-[-0.02em] text-[#0B172B]">
              {activeTitle || 'Dashboard'}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-3 rounded-2xl border border-[#009965]/15 bg-white pr-4 pl-2 py-2 shadow-[0_10px_24px_rgba(11,23,43,0.05)] lg:flex">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-[#009965]/10">
              <span className="h-2.5 w-2.5 rounded-full bg-[#009965]" />
              <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-[#009965]/50" />
            </div>

            <div className="leading-tight">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0B172B]/40">
                System
              </p>
              <p className="text-sm font-semibold text-[#004825]">
                Connected
              </p>
            </div>
          </div>

          <div className="h-8 w-px bg-[#0B172B]/10" />

          <button
            onClick={() => signOut(auth)}
            className="group inline-flex h-12 items-center gap-2 rounded-2xl border border-[#0B172B]/10 bg-white px-4 text-sm font-semibold text-[#0B172B] shadow-[0_10px_24px_rgba(11,23,43,0.06)] cursor-pointer hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
            aria-label="Logout"
          >
            <LogOut
              size={16}
              className="transition-transform duration-200 group-hover:-translate-x-0.5"
            />
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}