'use client';

import React from 'react';

/**
 * Base atomic Skeleton component with smooth fluid shimmer animation
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`bg-slate-200/70 rounded-2xl shimmer-box ${className}`}
    />
  );
}

/**
 * Full-screen branded loading screen matching the Ledo Valley ERP aesthetic
 */
export function FullLoadingScreen({
  title = "Ledo Valley ERP",
  subtitle = "Synchronizing enterprise system data..."
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="min-h-screen bg-[#DCE2E8] flex items-center justify-center p-4 antialiased selection:bg-[#0D4728]/15 selection:text-[#0D4728]">
      {/* Signature Dribbble Curved Canvas Frame */}
      <div className="w-full max-w-lg bg-gradient-to-br from-[#FAFBF8] via-[#F6F7F2] to-[#EEF1EB] rounded-[36px] border border-white/80 shadow-2xl p-8 sm:p-10 flex flex-col items-center text-center relative overflow-hidden">
        
        {/* Subtle Ambient Brand Atmosphere */}
        <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-[#0D4728]/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-[#E4B84D]/15 blur-3xl pointer-events-none" />

        {/* Animated Brand Emblem Crest */}
        <div className="relative mb-6">
          {/* Pulsing ring aura */}
          <div className="absolute -inset-2.5 rounded-3xl bg-[#0D4728]/15 blur-md animate-pulse" />
          
          <div className="relative w-20 h-20 rounded-[28px] bg-gradient-to-br from-[#0D4728] to-[#185c37] flex items-center justify-center shadow-lg border border-white/20">
            {/* SVG Logo Tea Leaf / Crest */}
            <svg 
              className="w-12 h-12 text-[#FFF9CD] animate-pulse" 
              viewBox="0 0 256 256" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <path 
                fillRule="evenodd" 
                clipRule="evenodd" 
                d="M73.0376 125.692L85.3032 130.999C91.6381 133.088 102.893 137.065 109.952 136.374C109.211 130.41 98.4617 116.628 93.2387 111.758C91.9246 110.545 90.9474 109.72 89.4984 108.557C85.9939 105.76 86.9543 107.159 86.0782 104.766C100.652 105.794 122.184 135.633 122.37 152.683C122.437 158.748 121.898 199.993 122.605 203.531C123.279 206.968 126.818 210.844 130.187 210.86C130.271 210.86 130.44 211.298 132.63 210.389C135.023 202.655 130.878 155.16 134.13 143.299C138.039 129.028 144.188 121.716 155.106 113.477C158.358 111.034 161.761 107.378 166.361 106.535C165.148 109.753 159.065 113.932 153.96 120.503C150.557 124.866 140.229 137.57 148.046 136.744C173.707 134.066 203.764 117.419 212.222 91.4898C213.014 89.0468 215.794 80.2856 213.536 78.1459C210.79 76.023 190.454 79.8139 186.444 80.8248C170.893 84.6999 155.578 90.9843 143.497 100.655C134.736 107.664 129.345 115.987 127.694 117.082C125.419 116.055 127.188 117.352 125.571 115.179C125.015 114.437 124.695 113.78 124.088 112.938C123.027 111.455 121.864 110.124 120.685 108.81C107.358 93.8654 88.7234 86.5532 69.769 81.1449C64.8156 79.7296 46.097 76.6127 41.8344 78.1627C38.6838 85.02 46.6699 101.245 51.6233 107.513C56.543 113.73 60.8899 117.504 67.2754 121.968C68.876 123.097 71.5549 124.411 73.0544 125.675L73.0376 125.692Z" 
                fill="#FFF9CD"
              />
            </svg>
          </div>
        </div>

        {/* Brand Headline */}
        <h2 className="text-2xl font-light text-slate-900 tracking-tight">
          Ledo <span className="font-semibold text-[#0D4728]">Valley</span>
        </h2>
        <p className="text-xs uppercase font-bold tracking-widest text-[#E4B84D] mt-0.5">
          Enterprise Resource Planning
        </p>
        
        {/* Subtitle / Status */}
        <p className="text-xs text-slate-500 font-medium mt-3 max-w-xs">
          {subtitle}
        </p>

        {/* Fluid Brand Progress Line */}
        <div className="w-48 h-1.5 bg-slate-200/80 rounded-full mt-6 overflow-hidden relative">
          <div className="absolute inset-y-0 bg-gradient-to-r from-[#0D4728] via-[#E4B84D] to-[#0D4728] rounded-full w-24 animate-[shimmerWave_1.5s_infinite_ease-in-out]" />
        </div>

        {/* Bottom subtle security badge */}
        <div className="mt-8 pt-4 border-t border-slate-200/60 flex items-center gap-2 text-[11px] text-slate-400 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <span>Encrypted Session &bull; Ledo Tea Co. Secure Cloud</span>
        </div>

      </div>
    </div>
  );
}

/**
 * Metric Stat Counter Skeleton
 */
export function StatCounterSkeleton() {
  return (
    <div className="flex items-baseline gap-2.5">
      <Skeleton className="w-9 h-9 rounded-full shrink-0" />
      <div className="space-y-1.5">
        <Skeleton className="w-24 h-8 rounded-lg" />
        <Skeleton className="w-14 h-3 rounded-md" />
      </div>
    </div>
  );
}

/**
 * Retailer Card Skeleton matching SalesClient grid view
 */
export function RetailerCardSkeleton() {
  return (
    <div className="p-5 sm:p-6 border border-slate-200/80 rounded-[26px] bg-white flex flex-col justify-between space-y-4">
      <div>
        {/* Top: Monogram Avatar, Title & Territory */}
        <div className="flex items-start gap-3.5 mb-3.5">
          <Skeleton className="w-11 h-11 rounded-2xl shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="flex justify-between items-center gap-2">
              <Skeleton className="w-32 h-5 rounded-md" />
              <Skeleton className="w-16 h-5 rounded-full shrink-0" />
            </div>
            <Skeleton className="w-24 h-3.5 rounded-md" />
          </div>
        </div>

        {/* Details Rows */}
        <div className="space-y-2.5 pt-3 border-t border-slate-100">
          <Skeleton className="w-36 h-4 rounded-md" />
          <Skeleton className="w-full h-4 rounded-md" />
          <Skeleton className="w-44 h-3.5 rounded-md" />
          <Skeleton className="w-full h-7 rounded-xl" />
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2.5">
        <Skeleton className="w-24 h-9 rounded-full" />
        <Skeleton className="w-24 h-9 rounded-full" />
      </div>
    </div>
  );
}

/**
 * Table Row Skeleton for directory or ledger tables
 */
export function TableRowSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <tr className="border-b border-slate-100/80">
      <td className="py-4 px-6">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
          <div className="space-y-1.5">
            <Skeleton className="w-28 h-4 rounded-md" />
            <Skeleton className="w-20 h-3 rounded-md" />
          </div>
        </div>
      </td>
      {Array.from({ length: columns - 2 }).map((_, i) => (
        <td key={i} className="py-4 px-6">
          <Skeleton className="w-24 h-4 rounded-md" />
        </td>
      ))}
      <td className="py-4 px-6 text-right">
        <Skeleton className="w-20 h-8 rounded-full ml-auto" />
      </td>
    </tr>
  );
}

/**
 * Complete Sales & Retailers Page Skeleton
 */
export function SalesPageSkeleton() {
  return (
    <div className="space-y-7 animate-in fade-in duration-200">
      
      {/* 1. Header & Metrics Bar */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6 pb-2">
        <div className="space-y-3">
          <div className="space-y-2">
            <Skeleton className="w-64 sm:w-80 h-10 sm:h-12 rounded-xl" />
            <Skeleton className="w-72 sm:w-96 h-4 rounded-md" />
          </div>

          {/* Segmented Capsule Tabs Skeleton */}
          <div className="inline-flex p-1 bg-white/80 rounded-full border border-slate-200/80 gap-1">
            <Skeleton className="w-40 h-10 rounded-full" />
            <Skeleton className="w-32 h-10 rounded-full" />
          </div>
        </div>

        {/* Metrics & Action Buttons */}
        <div className="flex items-center flex-wrap gap-5 sm:gap-7">
          <StatCounterSkeleton />
          <div className="hidden sm:block">
            <StatCounterSkeleton />
          </div>
          <div className="flex items-center gap-2.5">
            <Skeleton className="w-32 h-11 rounded-full" />
            <Skeleton className="w-32 h-11 rounded-full" />
          </div>
        </div>
      </div>

      {/* 2. Main Curved Canvas Container Skeleton */}
      <div className="bg-white border border-slate-200/80 rounded-[28px] overflow-hidden shadow-xs flex flex-col min-h-[560px]">
        {/* Command Toolbar */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
            <Skeleton className="w-full max-w-md h-10 rounded-full" />
            <div className="flex items-center gap-3">
              <Skeleton className="w-32 h-8 rounded-full" />
              <Skeleton className="w-24 h-4 rounded-md" />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Skeleton className="w-16 h-4 rounded-md" />
            <Skeleton className="w-24 h-7 rounded-full" />
            <Skeleton className="w-24 h-7 rounded-full" />
            <Skeleton className="w-24 h-7 rounded-full" />
          </div>
        </div>

        {/* Grid Cards Area */}
        <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <RetailerCardSkeleton />
          <RetailerCardSkeleton />
          <RetailerCardSkeleton />
          <RetailerCardSkeleton />
          <RetailerCardSkeleton />
          <RetailerCardSkeleton />
        </div>
      </div>

    </div>
  );
}

/**
 * Complete User Management Page Skeleton
 */
export function UsersPageSkeleton() {
  return (
    <div className="space-y-7 animate-in fade-in duration-200">
      
      {/* Header & Metrics */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6 pb-2">
        <div className="space-y-3">
          <div className="space-y-2">
            <Skeleton className="w-64 sm:w-80 h-10 sm:h-12 rounded-xl" />
            <Skeleton className="w-72 sm:w-96 h-4 rounded-md" />
          </div>
          <div className="inline-flex p-1 bg-white/80 rounded-full border border-slate-200/80 gap-1">
            <Skeleton className="w-24 h-9 rounded-full" />
            <Skeleton className="w-24 h-9 rounded-full" />
            <Skeleton className="w-24 h-9 rounded-full" />
          </div>
        </div>

        <div className="flex items-center gap-6">
          <StatCounterSkeleton />
          <Skeleton className="w-36 h-11 rounded-full" />
        </div>
      </div>

      {/* Main Curved Table Container */}
      <div className="bg-white border border-slate-200/80 rounded-[28px] overflow-hidden shadow-xs flex flex-col min-h-[480px]">
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center gap-4">
          <Skeleton className="w-full max-w-sm h-10 rounded-full" />
          <Skeleton className="w-28 h-4 rounded-md" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100">
                <th className="py-4 px-6"><Skeleton className="w-24 h-4 rounded-md" /></th>
                <th className="py-4 px-6"><Skeleton className="w-20 h-4 rounded-md" /></th>
                <th className="py-4 px-6"><Skeleton className="w-20 h-4 rounded-md" /></th>
                <th className="py-4 px-6 text-right"><Skeleton className="w-16 h-4 rounded-md ml-auto" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <TableRowSkeleton columns={4} />
              <TableRowSkeleton columns={4} />
              <TableRowSkeleton columns={4} />
              <TableRowSkeleton columns={4} />
              <TableRowSkeleton columns={4} />
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

/**
 * Complete Dashboard Overview Page Skeleton
 */
export function OverviewPageSkeleton() {
  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      
      {/* Hero Welcome Bar */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
        <div className="space-y-2">
          <Skeleton className="w-72 sm:w-96 h-12 rounded-xl" />
          <Skeleton className="w-64 sm:w-80 h-4 rounded-md" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="w-32 h-11 rounded-full" />
          <Skeleton className="w-36 h-11 rounded-full" />
        </div>
      </div>

      {/* 4 Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-slate-200/80 rounded-[24px] p-6 shadow-xs space-y-3">
            <div className="flex justify-between items-start">
              <Skeleton className="w-10 h-10 rounded-full" />
              <Skeleton className="w-14 h-5 rounded-full" />
            </div>
            <Skeleton className="w-28 h-8 rounded-lg" />
            <Skeleton className="w-20 h-3 rounded-md" />
          </div>
        ))}
      </div>

      {/* Big Canvas Container with Charts & Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200/80 rounded-[28px] p-6 shadow-xs space-y-4">
          <div className="flex justify-between items-center">
            <Skeleton className="w-40 h-6 rounded-md" />
            <Skeleton className="w-24 h-8 rounded-full" />
          </div>
          <Skeleton className="w-full h-64 rounded-2xl" />
        </div>

        <div className="bg-white border border-slate-200/80 rounded-[28px] p-6 shadow-xs space-y-4">
          <Skeleton className="w-36 h-6 rounded-md" />
          <div className="space-y-3 pt-2">
            <Skeleton className="w-full h-14 rounded-2xl" />
            <Skeleton className="w-full h-14 rounded-2xl" />
            <Skeleton className="w-full h-14 rounded-2xl" />
          </div>
        </div>
      </div>

    </div>
  );
}

/**
 * Complete Logs Page Skeleton
 */
export function LogsPageSkeleton() {
  return (
    <div className="space-y-7 animate-in fade-in duration-200">
      <div className="space-y-2">
        <Skeleton className="w-64 h-10 rounded-xl" />
        <Skeleton className="w-80 h-4 rounded-md" />
      </div>

      <div className="bg-white border border-slate-200/80 rounded-[28px] overflow-hidden shadow-xs flex flex-col min-h-[480px]">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center gap-4">
          <Skeleton className="w-full max-w-sm h-10 rounded-full" />
          <Skeleton className="w-32 h-8 rounded-full" />
        </div>
        <div className="p-6 space-y-3">
          <Skeleton className="w-full h-12 rounded-xl" />
          <Skeleton className="w-full h-12 rounded-xl" />
          <Skeleton className="w-full h-12 rounded-xl" />
          <Skeleton className="w-full h-12 rounded-xl" />
          <Skeleton className="w-full h-12 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/**
 * Settings Page Skeleton
 */
export function SettingsPageSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
      <div className="space-y-2">
        <Skeleton className="w-48 h-8 rounded-xl" />
        <Skeleton className="w-72 h-4 rounded-md" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200/80 rounded-[28px] p-6 space-y-4">
          <Skeleton className="w-14 h-14 rounded-2xl" />
          <Skeleton className="w-32 h-5 rounded-md" />
          <Skeleton className="w-44 h-4 rounded-md" />
          <Skeleton className="w-20 h-6 rounded-full" />
        </div>
        <div className="md:col-span-2 bg-white border border-slate-200/80 rounded-[28px] p-6 space-y-4">
          <Skeleton className="w-40 h-6 rounded-md" />
          <Skeleton className="w-full h-10 rounded-full" />
          <Skeleton className="w-full h-10 rounded-full" />
          <Skeleton className="w-32 h-10 rounded-full" />
        </div>
      </div>
    </div>
  );
}
