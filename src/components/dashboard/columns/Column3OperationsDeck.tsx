'use client';

import React from 'react';
import {
  SlidersHorizontal,
  Check,
  Store,
  Package,
  TrendingUp,
  Navigation,
  CheckCircle2,
  ShieldCheck,
  Briefcase,
} from 'lucide-react';
import { DailyPriorityItem } from '../types';

interface TargetMetric {
  actual: number;
  target: number;
  pct: number;
}

interface Column3OperationsDeckProps {
  targetProgress: {
    sales: TargetMetric;
    reach: TargetMetric;
    orders: TargetMetric;
    overallPct: number;
  };
  overallTargetPct: number;
  salesTargetPct: number;
  reachTargetPct: number;
  ordersTargetPct: number;
  tasks: DailyPriorityItem[];
  completedCount: number;
  canManageTargets: boolean;
  onOpenTargetsModal: () => void;
  className?: string;
}

export function Column3OperationsDeck({
  targetProgress,
  overallTargetPct,
  salesTargetPct,
  reachTargetPct,
  ordersTargetPct,
  tasks,
  completedCount,
  canManageTargets,
  onOpenTargetsModal,
  className,
}: Column3OperationsDeckProps) {
  const renderTaskIcon = (iconName?: string, done?: boolean) => {
    const iconClass = done ? 'w-5 h-5 text-white/40' : 'w-5 h-5 text-slate-900';
    switch (iconName) {
      case 'store':
        return <Store className={iconClass} />;
      case 'package':
        return <Package className={iconClass} />;
      case 'trending':
        return <TrendingUp className={iconClass} />;
      case 'navigation':
        return <Navigation className={iconClass} />;
      case 'lab':
        return <CheckCircle2 className={iconClass} />;
      case 'shield':
        return <ShieldCheck className={iconClass} />;
      default:
        return <Briefcase className={iconClass} />;
    }
  };

  return (
    <div className={`lg:col-span-12 xl:col-span-3 ${className || ''}`}>
      {/* Unified Warm Container */}
      <div className="bg-white border border-slate-100/80 rounded-[28px] sm:rounded-[38px] p-4 sm:p-6 shadow-sm flex flex-col justify-between">
        {/* Top Area: Operational Target & Progress Ruler */}
        <div>
          {/* Header */}
          <div className="flex items-baseline justify-between mb-3.5 sm:mb-4">
            <h3 className="text-xl sm:text-[26px] font-normal text-slate-900 tracking-tight">
              Operational Target
            </h3>
            <span
              className="text-2xl sm:text-4xl font-light text-slate-900 font-mono tracking-tight"
              title={`Overall monthly targets achievement: ${overallTargetPct}%`}
            >
              {overallTargetPct}%
            </span>
          </div>

          {/* Progress Ruler Row with Percentages & Subtitle Labels */}
          <div className="relative mb-2">
            {/* Top Labels and Divider Lines Row */}
            <div className="flex items-start h-[38px] sm:h-[42px] relative gap-1 mb-1">
              {/* Sales Target % above Yellow Capsule */}
              <div className="w-[48%] pl-0.5">
                <span
                  className="text-sm sm:text-[18px] text-[#111814] font-semibold tracking-tight cursor-default"
                  title={`Sales Target: ₹${targetProgress?.sales?.actual?.toLocaleString('en-IN') || 0} of ₹${targetProgress?.sales?.target?.toLocaleString('en-IN') || 0} (${salesTargetPct}%)`}
                >
                  {salesTargetPct}%
                </span>
                <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 tracking-tight -mt-0.5">
                  Sales
                </p>
              </div>

              {/* Reach % with vertical line touching Black Capsule */}
              <div className="w-[36%] flex items-start h-full pl-0 relative">
                <div className="w-[1.25px] h-full bg-[#111814] shrink-0" />
                <div className="pl-1.5 sm:pl-2.5">
                  <span
                    className="text-sm sm:text-[18px] text-[#111814] font-semibold tracking-tight cursor-default"
                    title={`Retailer Reach: ${targetProgress?.reach?.actual || 0} of ${targetProgress?.reach?.target || 0} outlets (${reachTargetPct}%)`}
                  >
                    {reachTargetPct}%
                  </span>
                  <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 tracking-tight -mt-0.5">
                    Reach
                  </p>
                </div>
              </div>

              {/* Orders % with vertical line touching Gray Capsule */}
              <div className="w-[16%] flex items-start h-full pl-0 relative">
                <div className="w-[1.25px] h-full bg-[#111814] shrink-0" />
                <div className="pl-1.5 sm:pl-2">
                  <span
                    className="text-sm sm:text-[18px] text-[#111814] font-semibold tracking-tight cursor-default"
                    title={`Orders Target: ${targetProgress?.orders?.actual || 0} of ${targetProgress?.orders?.target || 0} orders (${ordersTargetPct}%)`}
                  >
                    {ordersTargetPct}%
                  </span>
                  <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 tracking-tight -mt-0.5">
                    Orders
                  </p>
                </div>
              </div>
            </div>

            {/* Squarish Rounded Capsules Bar */}
            <div className="flex items-center -mt-[1px] gap-1">
              {/* Yellow Capsule */}
              <div className="w-[48%]">
                <div
                  className="h-10 sm:h-[52px] bg-[#FED35C] rounded-xl sm:rounded-2xl shadow-2xs transition-all hover:brightness-105 cursor-default flex items-center px-3 sm:px-4"
                  title={`Sales Achievement: ₹${targetProgress?.sales?.actual?.toLocaleString('en-IN') || 0} / ₹${targetProgress?.sales?.target?.toLocaleString('en-IN') || 0} (${salesTargetPct}%)`}
                />
              </div>

              {/* Black Capsule */}
              <div className="w-[36%]">
                <div
                  className="h-10 sm:h-[52px] bg-[#222422] rounded-xl sm:rounded-2xl shadow-2xs transition-all hover:brightness-110 cursor-default"
                  title={`Retailer Coverage: ${targetProgress?.reach?.actual || 0} / ${targetProgress?.reach?.target || 0} shops (${reachTargetPct}%)`}
                />
              </div>

              {/* Gray Capsule */}
              <div className="w-[16%]">
                <div
                  className="h-10 sm:h-[52px] bg-[#898D8A] rounded-xl sm:rounded-2xl shadow-2xs transition-all hover:brightness-110 cursor-default"
                  title={`Orders Volume: ${targetProgress?.orders?.actual || 0} / ${targetProgress?.orders?.target || 0} orders (${ordersTargetPct}%)`}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Stacked Card Deck Section */}
        <div className="relative mt-5 sm:mt-6">
          {/* Layer 1: Topmost Back Card Peak */}
          <div className="mx-4 sm:mx-8 h-2 sm:h-2.5 bg-[#5a635e]/30 rounded-t-[18px] sm:rounded-t-[20px] shadow-xs relative z-0" />

          {/* Layer 2: Middle Card Peak */}
          <div className="mx-2 sm:mx-4 -mt-1 h-2.5 sm:h-3 bg-[#5A635E] rounded-t-[22px] sm:rounded-t-[24px] shadow-xs relative z-10" />

          {/* Layer 3: Front Dark Card */}
          <div className="-mt-1 bg-[#072716] text-white rounded-[24px] sm:rounded-[28px] p-4 sm:p-6 shadow-xl relative z-20 space-y-3.5 sm:space-y-4">
            {/* Header inside Dark Card */}
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-2">
                <h4 className="text-lg sm:text-[22px] font-normal text-white tracking-tight">
                  Daily Priorities
                </h4>
                {canManageTargets && (
                  <button
                    onClick={onOpenTargetsModal}
                    title="Configure Target Thresholds (Admin & Manager)"
                    className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <span className="text-2xl sm:text-4xl font-light text-white font-mono tracking-tight">
                {completedCount}/{tasks.length}
              </span>
            </div>

            {/* Task Checklist Items */}
            <div className="space-y-1">
              {tasks.map((task) => {
                const isDone = task.done;
                return (
                  <div
                    key={task.id}
                    className="flex items-center justify-between p-1.5 sm:p-2 rounded-xl sm:rounded-2xl hover:bg-white/5 active:bg-white/10 transition-all cursor-default select-none group"
                  >
                    {/* Left: Icon & Text */}
                    <div className="flex items-center gap-3 sm:gap-3.5 min-w-0 pr-2">
                      <div
                        className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center shrink-0 transition-all ${isDone ? 'bg-white/10 text-white/40' : 'bg-white text-slate-900 shadow-sm'
                          }`}
                      >
                        {renderTaskIcon(task.icon, isDone)}
                      </div>

                      <div className="min-w-0">
                        <p
                          className={`text-xs sm:text-sm tracking-tight transition-all truncate ${isDone ? 'line-through text-white/40 font-normal' : 'text-white font-medium'
                            }`}
                        >
                          {task.title}
                        </p>
                        <p
                          className={`text-[11px] sm:text-xs mt-0.5 transition-all truncate ${isDone ? 'text-white/30' : 'text-white/60'
                            }`}
                        >
                          {task.time}
                        </p>
                      </div>
                    </div>

                    {/* Right: Checkmark Indicator */}
                    <div
                      className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center shrink-0 transition-all ${isDone ? 'bg-[#E4B84D] text-[#0D4728]' : 'bg-white/10 border border-white/20'
                        }`}
                    >
                      {isDone && <Check className="w-3 sm:w-3.5 h-3 sm:h-3.5 stroke-[3]" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
