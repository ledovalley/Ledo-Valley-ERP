'use client';

import React from 'react';
import { Bike, Gauge, MapPin, Loader2, X } from 'lucide-react';

interface StartShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  startTerritory: string;
  setStartTerritory: (val: string) => void;
  suggestedRoutes: string[];
  userRecentRoutes: string[];
  startOdo: string;
  setStartOdo: (val: string) => void;
  startLoc: string;
  startLocStatus: string;
  shiftError: string;
  isShiftPending: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export function StartShiftModal({
  isOpen,
  onClose,
  startTerritory,
  setStartTerritory,
  suggestedRoutes,
  userRecentRoutes,
  startOdo,
  setStartOdo,
  startLoc,
  startLocStatus,
  shiftError,
  isShiftPending,
  onSubmit,
}: StartShiftModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[24px] sm:rounded-[32px] w-full max-w-lg shadow-2xl border border-white/80 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[92dvh] flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0D4728] text-[#FFF9CD] flex items-center justify-center shadow-xs">
              <Bike className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">Start Field Shift</h3>
              <p className="text-[11px] sm:text-xs text-slate-500">Route planning, odometer lock & GPS tagging</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
          {shiftError && (
            <div className="p-3 bg-red-50 border border-red-200/80 text-red-600 text-sm rounded-2xl font-medium animate-in fade-in">
              {shiftError}
            </div>
          )}

          {/* Territory / Route Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">Planned Route / Territory *</label>
              <span className="text-[11px] text-slate-400">
                {userRecentRoutes.length > 0 ? 'Your recent & suggested routes' : 'Quick route suggestions'}
              </span>
            </div>
            <input
              type="text"
              required
              value={startTerritory}
              onChange={(e) => setStartTerritory(e.target.value)}
              placeholder="e.g. Dibrugarh Route, Tinsukia Retail Belt"
              className="w-full bg-slate-50/70 border border-slate-200 rounded-full py-2.5 px-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all font-medium"
            />

            {/* Quick Route Suggestions (Max 4: user recent routes + random defaults) */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {suggestedRoutes.map((rt) => {
                const isSelected = startTerritory.trim().toLowerCase() === rt.trim().toLowerCase();
                const isUserRoute = userRecentRoutes.some(ur => ur.trim().toLowerCase() === rt.trim().toLowerCase());

                return (
                  <button
                    key={rt}
                    type="button"
                    onClick={() => setStartTerritory(rt)}
                    className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all border flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-[#0D4728] text-[#FFF9CD] border-[#0D4728] shadow-xs'
                        : 'bg-slate-100 hover:bg-[#0D4728]/10 hover:text-[#0D4728] text-slate-600 border-slate-200/70'
                    }`}
                    title={isUserRoute ? 'Your previously completed route' : 'Quick suggested route'}
                  >
                    <span>+ {rt}</span>
                    {isUserRoute && (
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase tracking-wider ${
                          isSelected ? 'bg-white/20 text-[#FFF9CD]' : 'bg-emerald-100/90 text-emerald-800'
                        }`}
                      >
                        Recent
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bike Meter Start (Motorcycle / Bike) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">Bike Meter Start (km) *</label>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200/80 text-[11px] font-semibold text-emerald-800">
                <Bike className="w-3.5 h-3.5 text-emerald-700" />
                Motorcycle / Bike
              </span>
            </div>
            <div className="relative">
              <Gauge className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="number"
                required
                min="0"
                step="0.1"
                value={startOdo}
                onChange={(e) => setStartOdo(e.target.value)}
                placeholder="e.g. 14250"
                className="w-full bg-slate-50/70 border border-slate-200 rounded-full py-2.5 pl-10 pr-4 text-sm font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20"
              />
            </div>
          </div>

          {/* GPS Starting Location: Silently Auto-Tagged in Background */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#0D4728]" />
              <span className="text-xs font-semibold text-slate-700">Starting GPS Location</span>
            </div>
            <div>
              {startLoc ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {startLoc}
                </span>
              ) : startLocStatus === 'requesting' ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                  <Loader2 className="w-3 h-3 animate-spin text-[#0D4728]" />
                  Acquiring live coordinates...
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50/70 px-2.5 py-0.5 rounded-full font-medium">
                  Auto-tagging on start
                </span>
              )}
            </div>
          </div>

          {/* Modal Actions */}
          <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-full text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isShiftPending}
              className="flex items-center gap-2 bg-[#0D4728] hover:bg-[#167a44] text-[#FFF9CD] px-6 py-2.5 rounded-full text-sm font-semibold transition-all disabled:opacity-50 shadow-xs"
            >
              {isShiftPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Start Shift</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
