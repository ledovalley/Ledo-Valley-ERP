'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  TrendingUp,
  Users,
  Activity,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Clock,
  Award
} from 'lucide-react';
import SessionCountdown from '@/components/SessionCountdown';
import Image from 'next/image';
import { SESSION_DURATION_SECONDS } from '@/utils/sessionConfig';

interface TopNavbarProps {
  userRole: string;
  userEmail: string;
  initial: string;
  lastSignInAt?: string;
  signOutAction: () => Promise<void>;
  factoryTab?: string;
  onFactoryTabChange?: (tab: string) => void;
  factoryBadges?: {
    inventory?: number;
    process?: number;
    missing?: number;
  };
}

export default function TopNavbar({
  userRole,
  userEmail,
  initial,
  lastSignInAt,
  signOutAction,
  factoryTab = 'inventory',
  onFactoryTabChange,
  factoryBadges
}: TopNavbarProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const isFactory = pathname.startsWith('/factory');
  const isPortal = pathname.startsWith('/portal');
  const canAccessPortal = userRole.toLowerCase() === 'admin';

  const navItems = isPortal
    ? []
    : isFactory
      ? [
        { label: 'Inventory & Receiving', id: 'inventory', icon: Award, badge: factoryBadges?.inventory },
        { label: 'Blend Management', id: 'blend', icon: TrendingUp },
        { label: 'Under Process', id: 'process', icon: LayoutDashboard, badge: factoryBadges?.process },
        { label: 'History Ledger', id: 'history', icon: Activity },
        ...(userRole === 'admin' || userRole === 'manager'
          ? [{ label: 'Gap Analysis', id: 'missing_blends', icon: Award, badge: factoryBadges?.missing }]
          : []),
      ]
      : [
        { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
        { label: 'Sales & Retailers', href: '/dashboard/sales', icon: TrendingUp },
        { label: 'Audit & Ledger', href: '/dashboard/ledger', icon: Award },
        ...(userRole === 'admin'
          ? [{ label: 'User Management', href: '/dashboard/users', icon: Users }]
          : []),
      ];

  const isActive = (item: any) => {
    if (isPortal) {
      return false;
    }
    if (isFactory) {
      return factoryTab === item.id;
    }
    if (item.href === '/dashboard') {
      return pathname === '/dashboard';
    }
    return pathname.startsWith(item.href);
  };

  const isSettingsActive = pathname.startsWith('/dashboard/settings');

  const canAccessSettings = userRole === 'admin';

  return (
    <header className="w-full mb-6 relative z-30">
      <div className="flex items-center justify-between gap-4">

        {/* Left: Brand Pill Badge & App Switcher */}
        <div className="flex items-center gap-2">
          <Link
            href={isPortal ? "/portal" : isFactory ? "/factory" : "/dashboard"}
            className="h-11 flex items-center gap-2.5 pl-1 pr-4 rounded-full border border-slate-200/80 bg-white/80 hover:bg-white shadow-xs backdrop-blur-md transition-all group"
          >
            <div className="w-8 h-8 rounded-full overflow-hidden bg-[#85be9f] flex items-center justify-center shadow-xs shrink-0">
              <Image
                src="/logo/logo.svg"
                alt="Ledo Valley Logo"
                width={28}
                height={28}
                className="w-full h-full object-cover"
                priority
              />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-slate-900 text-xs tracking-tight group-hover:text-[#0D4728] transition-colors leading-tight">
                Ledo Valley
              </span>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                {isPortal ? "Portal" : isFactory ? "Factory" : "ERP"}
              </span>
            </div>
          </Link>

          {canAccessPortal && !isPortal && (
            <Link
              href={isFactory ? "/dashboard" : "/factory"}
              className="h-9 px-3 flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 hover:bg-[#0D4728] hover:text-[#FFF9CD] text-slate-700 text-xs font-bold transition-all shadow-2xs"
              title={`Switch to ${isFactory ? "ERP Dashboard" : "Factory Module"}`}
            >
              <span className="text-[11px]">Go to {isFactory ? "ERP" : "Factory"}</span>
            </Link>
          )}
        </div>

        {/* Right Section: Right-Aligned Navigations + Settings + Account Button */}
        <div className="flex items-center gap-2 sm:gap-3">

          {/* Segmented Navigation Pills (Hidden on Portal) */}
          {navItems.length > 0 && (
            <nav className="hidden md:flex items-center h-11 gap-1 p-1 bg-white/80 backdrop-blur-md rounded-full border border-slate-200/80 shadow-xs">
              {navItems.map((item: any) => {
                const active = isActive(item);
                if (isFactory) {
                  return (
                    <button
                      key={item.id}
                      onClick={() => onFactoryTabChange && onFactoryTabChange(item.id)}
                      className={`h-full flex items-center gap-2 px-5 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer ${active
                        ? 'bg-[#0D4728] text-[#FFF9CD] shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                        }`}
                    >
                      <span>{item.label}</span>
                      {typeof item.badge === 'number' && item.badge > 0 && (
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${active ? 'bg-[#FFF9CD] text-[#0D4728]' : 'bg-slate-200 text-slate-700'
                            }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`h-full flex items-center gap-2 px-5 rounded-full text-sm font-medium transition-all duration-200 ${active
                      ? 'bg-[#0D4728] text-[#FFF9CD] shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                      }`}
                  >
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          )}

          {/* Settings Button (Only on ERP Dashboard, Hidden on Portal & Factory) */}
          {canAccessSettings && !isPortal && !isFactory && (
            <Link
              href="/dashboard/settings"
              className={`hidden sm:flex items-center h-11 gap-2 px-4.5 rounded-full border text-sm font-medium transition-all duration-200 shadow-xs backdrop-blur-md ${isSettingsActive
                ? 'bg-[#0D4728] text-[#FFF9CD] border-[#0D4728] font-semibold'
                : 'bg-white/80 hover:bg-white border-slate-200/80 text-slate-700 hover:text-slate-900'
                }`}
            >
              <Settings className="w-4 h-4 text-slate-500 group-hover:text-slate-800" />
              <span>Settings</span>
            </Link>
          )}

          {/* Redesigned Account Button with integrated session timer dropdown */}
          <div className="relative">
            <button
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="h-11 flex items-center gap-2.5 pl-1.5 pr-4 rounded-full bg-white/80 hover:bg-white border border-slate-200/80 shadow-xs backdrop-blur-md transition-all group"
            >
              {/* Avatar Pill Monogram with subtle status indicator */}
              <div className="relative shrink-0">
                <div className="w-8 h-8 rounded-full bg-[#0D4728] flex items-center justify-center text-[#FFF9CD] text-xs font-bold shadow-inner group-hover:scale-105 transition-transform">
                  {initial}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
              </div>

              {/* Role Title */}
              <span className="hidden sm:inline-block text-sm font-semibold text-slate-800 capitalize tracking-tight group-hover:text-[#0D4728] transition-colors">
                {userRole}
              </span>

              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-transform duration-200 ${userDropdownOpen ? 'rotate-180 text-[#0D4728]' : ''}`} />
            </button>

            {/* Redesigned Account & Session Dropdown Menu */}
            {userDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setUserDropdownOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-3xl shadow-xl border border-slate-100 p-3.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">

                  {/* Account Header */}
                  <div className="p-3 bg-slate-50/80 rounded-2xl mb-2.5">
                    <div className="flex items-center gap-2.5 mb-1">
                      <div className="w-8 h-8 rounded-full bg-[#0D4728] flex items-center justify-center text-[#FFF9CD] text-sm font-bold">
                        {initial}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 capitalize truncate">{userRole} Account</p>
                        <p className="text-xs text-slate-500 truncate">{userEmail}</p>
                      </div>
                    </div>
                  </div>

                  {/* Redesigned Session Countdown Integration */}
                  <div className="px-3 py-2.5 bg-orange-50/60 border border-orange-100 rounded-2xl mb-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs uppercase font-bold tracking-wider text-orange-700 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-orange-600" />
                        Session Expiry
                      </span>
                      <span className="text-xs font-semibold bg-orange-100/80 text-orange-800 px-2.5 py-0.5 rounded-full">
                        {SESSION_DURATION_SECONDS <= 60 ? `${SESSION_DURATION_SECONDS}s Test` : '48h Auto'}
                      </span>
                    </div>
                    <SessionCountdown lastSignInAt={lastSignInAt} />
                  </div>

                  {/* Settings Link inside dropdown for quick access (Restricted to Admin & Manager) */}
                  {canAccessSettings && (
                    <Link
                      href="/dashboard/settings"
                      onClick={() => setUserDropdownOpen(false)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl hover:bg-slate-50 text-slate-700 text-sm font-medium transition-colors mb-1"
                    >
                      <Settings className="w-4 h-4 text-slate-400" />
                      Account Settings
                    </Link>
                  )}

                  {/* Sign Out Action */}
                  <form action={signOutAction}>
                    <button
                      type="submit"
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-red-600 hover:bg-red-50 text-sm font-semibold transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-700 shadow-xs"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="md:hidden mt-3 p-3 bg-white rounded-3xl border border-slate-200 shadow-lg space-y-1">
          {navItems.map((item: any) => {
            const active = isActive(item);
            const Icon = item.icon;
            if (isFactory) {
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onFactoryTabChange && onFactoryTabChange(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-2.5 rounded-2xl text-sm font-medium transition-colors ${active
                    ? 'bg-[#0D4728] text-[#FFF9CD] font-semibold'
                    : 'text-slate-600 hover:bg-slate-50'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4.5 h-4.5" />
                    <span>{item.label}</span>
                  </div>
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${active ? 'bg-[#FFF9CD] text-[#0D4728]' : 'bg-slate-200 text-slate-700'
                        }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-medium transition-colors ${active
                  ? 'bg-[#0D4728] text-[#FFF9CD] font-semibold'
                  : 'text-slate-600 hover:bg-slate-50'
                  }`}
              >
                <Icon className="w-4.5 h-4.5" />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {canAccessSettings && !isPortal && !isFactory && (
            <Link
              href="/dashboard/settings"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-medium transition-colors ${isSettingsActive
                ? 'bg-[#0D4728] text-[#FFF9CD] font-semibold'
                : 'text-slate-600 hover:bg-slate-50'
                }`}
            >
              <Settings className="w-4.5 h-4.5" />
              <span>Settings</span>
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
