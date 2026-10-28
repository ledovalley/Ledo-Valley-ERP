'use client';

import React from 'react';
import { Users, Store, Package, Navigation } from 'lucide-react';
import { DashboardStats } from '../types';

interface TargetMetric {
  actual: number;
  target: number;
  pct: number;
}

interface DashboardHeroHeaderProps {
  stats: DashboardStats;
  targetProgress: {
    sales: TargetMetric;
    reach: TargetMetric;
    orders: TargetMetric;
    overallPct: number;
  };
}

export function DashboardHeroHeader({ stats, targetProgress }: DashboardHeroHeaderProps) {
  const role = (stats.userRole || '').toLowerCase();
  const isManagement = ['admin', 'manager'].includes(role);

  return (
    <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 sm:gap-6 pb-2">
      {/* Left: Headline & Segmented Progress Bar */}
      <div className="space-y-3 sm:space-y-4 max-w-2xl">
        <div>
          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-light text-slate-900 tracking-tight">
            Welcome in,{' '}
            <span className="font-semibold text-[#0D4728]">
              {stats.userName || (isManagement ? 'Ledo Valley HQ' : 'Field Representative')}
            </span>
          </h1>
          <p className="text-slate-500 text-xs sm:text-base mt-1">
            {isManagement
              ? 'Tea Estate & Agro Enterprise Resource Management — Company Operations'
              : `${stats.userRole ? stats.userRole.charAt(0).toUpperCase() + stats.userRole.slice(1) : 'Field Staff'} Operations • ${stats.userDistrict || 'Field Territory'}`}
          </p>
        </div>

        {/* Target Progress Segmented Capsule Bars */}
        <div className="flex items-start gap-2 sm:gap-3.5 w-full pt-1 sm:pt-2">
          {/* Segment 1: Sales Target */}
          <div
            style={{ flex: Math.max(targetProgress.sales.pct, 16) }}
            className="flex flex-col gap-1.5 sm:gap-2 min-w-[64px] sm:min-w-[76px]"
          >
            <span
              className="text-xs sm:text-sm font-normal text-slate-800 truncate"
              title={`Sales Target: ₹${targetProgress.sales.actual.toLocaleString('en-IN')}${targetProgress.sales.target > 0 ? ` / ₹${targetProgress.sales.target.toLocaleString('en-IN')}` : ''} (${targetProgress.sales.pct}%)`}
            >
              Sales Target
            </span>
            <div
              className="h-9 sm:h-11 rounded-full bg-[#0D4728] text-[#FFF9CD] text-xs sm:text-sm font-semibold flex items-center justify-center px-2.5 sm:px-3 shadow-xs transition-all hover:brightness-105 cursor-default"
              title={`Sales Target: ₹${targetProgress.sales.actual.toLocaleString('en-IN')} of ₹${targetProgress.sales.target.toLocaleString('en-IN')} (${targetProgress.sales.pct}%)`}
            >
              <span>{targetProgress.sales.pct}%</span>
            </div>
          </div>

          {/* Segment 2: Retailer Reach */}
          <div
            style={{ flex: Math.max(targetProgress.reach.pct, 16) }}
            className="flex flex-col gap-1.5 sm:gap-2 min-w-[64px] sm:min-w-[76px]"
          >
            <span
              className="text-xs sm:text-sm font-normal text-slate-800 truncate"
              title={`Retailer Reach: ${targetProgress.reach.actual}${targetProgress.reach.target > 0 ? ` / ${targetProgress.reach.target}` : ''} shops (${targetProgress.reach.pct}%)`}
            >
              Retailer Reach
            </span>
            <div
              className="h-9 sm:h-11 rounded-full bg-[#E4B84D] text-slate-900 text-xs sm:text-sm font-semibold flex items-center justify-center px-2.5 sm:px-3 shadow-xs transition-all hover:brightness-105 cursor-default"
              title={`Retailer Reach: ${targetProgress.reach.actual} of ${targetProgress.reach.target} outlets (${targetProgress.reach.pct}%)`}
            >
              <span>{targetProgress.reach.pct}%</span>
            </div>
          </div>

          {/* Segment 3: Orders Target */}
          <div
            style={{ flex: Math.max(targetProgress.orders.pct, 16) }}
            className="flex flex-col gap-1.5 sm:gap-2 min-w-[64px] sm:min-w-[76px]"
          >
            <span
              className="text-xs sm:text-sm font-normal text-slate-800 truncate"
              title={`Orders Target: ${targetProgress.orders.actual}${targetProgress.orders.target > 0 ? ` / ${targetProgress.orders.target}` : ''} orders (${targetProgress.orders.pct}%)`}
            >
              Orders Target
            </span>
            <div
              className="h-9 sm:h-11 rounded-full bg-[#0D4728]/15 text-[#0D4728] border border-[#0D4728]/30 text-xs sm:text-sm font-semibold flex items-center justify-center px-2.5 sm:px-3 transition-all hover:bg-[#0D4728]/25 cursor-default"
              title={`Orders Target: ${targetProgress.orders.actual} of ${targetProgress.orders.target} orders (${targetProgress.orders.pct}%)`}
            >
              <span>{targetProgress.orders.pct}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Minimalist Metric Counters (Responsive 3-Column Deck on Mobile) */}
      <div className="grid grid-cols-3 sm:flex sm:items-center gap-3 sm:gap-8 xl:gap-10 border-t xl:border-t-0 pt-3.5 sm:pt-4 xl:pt-0 w-full xl:w-auto">
        {/* Counter 1: Staff (for Management) or My Visits (for Staff) */}
        <div className="flex items-center sm:items-baseline gap-2 sm:gap-2.5">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
            {isManagement ? (
              <Users className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            ) : (
              <Navigation className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-[#0D4728]" />
            )}
          </div>
          <div className="min-w-0">
            <span className="text-2xl sm:text-4xl lg:text-5xl font-light text-slate-900 tracking-tight block truncate">
              {stats.staffCount ?? 0}
            </span>
            <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">
              {isManagement ? 'Staff' : 'My Visits'}
            </p>
          </div>
        </div>

        {/* Counter 2: Retailers */}
        <div className="flex items-center sm:items-baseline gap-2 sm:gap-2.5">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#E4B84D]/20 flex items-center justify-center text-[#9c7821] shrink-0">
            <Store className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          </div>
          <div className="min-w-0">
            <span className="text-2xl sm:text-4xl lg:text-5xl font-light text-slate-900 tracking-tight block truncate">
              {stats.retailerCount ?? 0}
            </span>
            <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">
              {isManagement ? 'Retailers' : 'My Retailers'}
            </p>
          </div>
        </div>

        {/* Counter 3: Sales Orders */}
        <div className="flex items-center sm:items-baseline gap-2 sm:gap-2.5">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#0D4728]/10 flex items-center justify-center text-[#0D4728] shrink-0">
            <Package className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          </div>
          <div className="min-w-0">
            <span className="text-2xl sm:text-4xl lg:text-5xl font-light text-slate-900 tracking-tight block truncate">
              {stats.salesCount ?? 0}
            </span>
            <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">
              {isManagement ? 'Orders' : 'My Orders'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

