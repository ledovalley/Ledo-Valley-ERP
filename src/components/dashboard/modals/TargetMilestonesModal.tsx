'use client';

import React from 'react';
import {
  SlidersHorizontal,
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
  Store,
  Package,
  Navigation,
  IndianRupee,
  Loader2,
} from 'lucide-react';
import { DailyOperationalTargets } from '../types';

interface TargetMilestonesModalProps {
  isOpen: boolean;
  onClose: () => void;
  canManageTargets: boolean;
  targetForm: DailyOperationalTargets;
  setTargetForm: React.Dispatch<React.SetStateAction<DailyOperationalTargets>>;
  isSavingTargets: boolean;
  targetsFeedback: { type: 'success' | 'error'; message: string } | null;
  onSubmit: (e: React.FormEvent) => void;
}

export function TargetMilestonesModal({
  isOpen,
  onClose,
  canManageTargets,
  targetForm,
  setTargetForm,
  isSavingTargets,
  targetsFeedback,
  onSubmit,
}: TargetMilestonesModalProps) {
  if (!isOpen || !canManageTargets) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-[24px] sm:rounded-[32px] w-full max-w-lg shadow-2xl border border-white/80 overflow-hidden animate-in zoom-in-95 duration-150 max-h-[92dvh] flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0D4728] text-[#E4B84D] flex items-center justify-center shadow-xs">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">Daily Priority Thresholds</h3>
              <p className="text-[11px] sm:text-xs text-slate-500">Configure operational rules required to auto-mark daily priorities</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
          {targetsFeedback && (
            <div
              className={`p-3.5 rounded-2xl text-xs font-medium flex items-center gap-2.5 ${
                targetsFeedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {targetsFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{targetsFeedback.message}</span>
            </div>
          )}

          <div className="space-y-3.5 max-h-[60vh] overflow-y-auto pr-1">
            {/* 1. Min Shift Hours */}
            <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#0D4728]" />
                  Shift Duration Target (Hours)
                </label>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100/70 text-emerald-800">
                  Auto-marks &quot;Start Shift&quot;
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">
                Shift must cross this elapsed working time to be auto-completed (e.g. 6 hours).
              </p>
              <div className="relative mt-1">
                <input
                  type="number"
                  min={1}
                  max={24}
                  step={0.5}
                  required
                  value={targetForm.min_shift_hours}
                  onChange={(e) =>
                    setTargetForm((prev) => ({ ...prev, min_shift_hours: Number(e.target.value) || 1 }))
                  }
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 font-medium focus:outline-hidden focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728]"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-medium">hrs</span>
              </div>
            </div>

            {/* 2. Retailer Visits Target */}
            <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-[#0D4728]" />
                  Retailer Visits Target
                </label>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-100/70 text-blue-800">
                  Auto-marks &quot;Retailer Visit&quot;
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">
                Number of logged outlet visits required for the priority to auto-check (e.g. 5 visits).
              </p>
              <div className="relative mt-1">
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  required
                  value={targetForm.target_visits}
                  onChange={(e) =>
                    setTargetForm((prev) => ({ ...prev, target_visits: Number(e.target.value) || 1 }))
                  }
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 font-medium focus:outline-hidden focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728]"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-medium">visits</span>
              </div>
            </div>

            {/* 3. Retailer Orders Target */}
            <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-[#0D4728]" />
                  Retailer Orders Target
                </label>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-100/70 text-amber-800">
                  Auto-marks &quot;Retailer Order&quot;
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">
                Minimum sales orders booked today to auto-complete this priority (e.g. 3 orders).
              </p>
              <div className="relative mt-1">
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  required
                  value={targetForm.target_orders}
                  onChange={(e) =>
                    setTargetForm((prev) => ({ ...prev, target_orders: Number(e.target.value) || 1 }))
                  }
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 font-medium focus:outline-hidden focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728]"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-medium">orders</span>
              </div>
            </div>

            {/* 4. GPS Distance Target */}
            <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                  <Navigation className="w-3.5 h-3.5 text-[#0D4728]" />
                  GPS Distance Target (Kilometers)
                </label>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-100/70 text-purple-800">
                  Auto-marks &quot;GPS Distance&quot;
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">
                Field route odometer tracking threshold to auto-check GPS distance (e.g. 15 km).
              </p>
              <div className="relative mt-1">
                <input
                  type="number"
                  min={1}
                  max={500}
                  step={1}
                  required
                  value={targetForm.target_distance_km}
                  onChange={(e) =>
                    setTargetForm((prev) => ({ ...prev, target_distance_km: Number(e.target.value) || 1 }))
                  }
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 font-medium focus:outline-hidden focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728]"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-medium">km</span>
              </div>
            </div>

            {/* 5. Dynamic Cash Settlement Notice */}
            <div className="bg-emerald-50/60 p-3.5 rounded-2xl border border-emerald-200/80 space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-emerald-950 flex items-center gap-1.5">
                  <IndianRupee className="w-3.5 h-3.5 text-[#0D4728]" />
                  Cash Settlement Milestone
                </label>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  Auto-calculated Daily
                </span>
              </div>
              <p className="text-[11px] text-emerald-800/80 leading-relaxed">
                Calculated automatically from actual orders cash collected vs. cash submitted to office upon shift handover. If collected cash is fully deposited (e.g. ₹10,000 / ₹10,000), it auto-marks as completed.
              </p>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-full text-xs font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingTargets}
              className="flex items-center gap-2 bg-[#0D4728] hover:bg-[#072716] text-[#FFF9CD] px-6 py-2.5 rounded-full text-sm font-semibold transition-all disabled:opacity-50 shadow-md cursor-pointer active:scale-95"
            >
              {isSavingTargets && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save Milestones</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
