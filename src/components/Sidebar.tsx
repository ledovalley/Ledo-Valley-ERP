import React from 'react';
import Image from 'next/image';
import { X, LogOut, ChevronRight, Database } from 'lucide-react';
import { SystemUser } from '@/types';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';

interface SidebarProps {
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  navItems: { id: string; label: string; icon: React.ReactNode }[];
  systemUser: SystemUser;
  setShowBackupModal: (open: boolean) => void;
}

export default function Sidebar({
  isMobileMenuOpen,
  setIsMobileMenuOpen,
  activeTab,
  setActiveTab,
  navItems,
  systemUser,
  setShowBackupModal
}: SidebarProps) {
  const initials = systemUser.name
    ?.split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2);

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-[#0B172B]/55 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        onClick={() => setIsMobileMenuOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[290px] shrink-0 transform flex-col overflow-hidden border-r border-white/10 bg-[#0B172B] text-[#F0F5F9] transition-transform duration-300 ease-out lg:relative lg:w-[272px] lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0 shadow-[0_24px_80px_rgba(11,23,43,0.45)]' : '-translate-x-full'
          }`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(0,153,101,0.18),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(255,254,226,0.08),_transparent_30%)] pointer-events-none" />

        <div className="relative flex h-full flex-col">
          <div className="border-b border-white/10 px-5 pb-5 pt-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F0F5F9] shadow-md">
                    <Image
                      src="/symbolLogo.svg"
                      alt="Ledo Valley ERP Logo"
                      width={24}
                      height={24}
                      className="h-6 w-6"
                    />
                  </div>

                  <div className="min-w-0">
                    <h1 className="truncate text-[15px] font-semibold tracking-[0.01em] text-[#F0F5F9]">
                      Ledo Valley
                    </h1>
                    <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.24em] text-[#F0F5F9]/55">
                      ERP Workspace
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[#F0F5F9]/70 transition hover:bg-white/10 hover:text-white md:hidden"
                aria-label="Close sidebar"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="relative flex-1 overflow-y-auto px-4 py-5">
            <div className="mb-3 px-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FFFEE2]/55">
                Navigation
              </p>
            </div>

            <div className="space-y-2">
              {navItems.map((item) => {
                const isActive = activeTab === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl px-3 py-3 text-left transition-all duration-200 ${isActive
                      ? 'bg-[#F0F5F9] text-[#0B172B] shadow-[0_12px_30px_rgba(0,0,0,0.18)]'
                      : 'border border-transparent text-[#F0F5F9]/78 hover:border-white/10 hover:bg-white/6 hover:text-white'
                      }`}
                  >
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200 ${isActive
                        ? 'bg-[#009965] text-white shadow-[inset_0_-1px_0_rgba(0,0,0,0.18)]'
                        : 'bg-white/5 text-[#FFFEE2]/80 group-hover:bg-white/10 group-hover:text-[#FFFEE2]'
                        }`}
                    >
                      {item.icon}
                    </div>

                    <div className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-[14px] ${isActive ? 'font-semibold' : 'font-medium'
                          }`}
                      >
                        {item.label}
                      </span>
                      <span
                        className={`mt-0.5 block text-[11px] ${isActive ? 'text-[#0B172B]/55' : 'text-[#F0F5F9]/40'
                          }`}
                      >
                        Workspace section
                      </span>
                    </div>

                    <ChevronRight
                      size={16}
                      className={`transition-all duration-200 ${isActive
                        ? 'translate-x-0 text-[#0B172B]/45'
                        : '-translate-x-1 opacity-0 text-[#F0F5F9]/40 group-hover:translate-x-0 group-hover:opacity-100'
                        }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="px-4 pb-4 mt-auto">
            <button
              onClick={() => setShowBackupModal(true)}
              className="w-full rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 p-3 flex items-center justify-between transition-colors shadow-sm"
            >
              <div className="flex items-center gap-3 text-[#F0F5F9]">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0B172B]/50 border border-white/10">
                  <Database size={16} />
                </div>
                <div className="text-left">
                  <p className="text-[13px] font-semibold">Database Backups</p>
                  <p className="text-[11px] text-[#F0F5F9]/60">Automated Daily Sync</p>
                </div>
              </div>
              <ChevronRight size={14} className="text-[#F0F5F9]/40" />
            </button>
          </div>

          <div className="border-t border-white/10 p-4 pt-0">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 mt-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="flex items-center gap-3">
                <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-[#009965] font-semibold uppercase tracking-wide text-white shadow-[0_10px_25px_rgba(0,153,101,0.28)]">
                  {initials || 'LV'}
                  <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-[#0B172B] bg-[#FFFEE2]" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-[#F0F5F9]">
                    {systemUser.name}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] capitalize text-[#F0F5F9]/58">
                    {systemUser.role.replace('_', ' ')}
                  </p>
                </div>

                <button
                  onClick={() => signOut(auth)}
                  title="Logout"
                  aria-label="Logout"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#009965]/25 bg-[#004825]/70 text-[#FFFEE2] transition hover:border-[#009965]/40 hover:bg-[#009965] hover:text-white"
                >
                  <LogOut size={17} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}