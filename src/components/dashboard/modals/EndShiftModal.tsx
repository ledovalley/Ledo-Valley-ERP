'use client';

import React from 'react';
import {
  ShieldCheck,
  X,
  Gauge,
  Bike,
  Wallet,
  CheckCircle2,
  AlertCircle,
  IndianRupee,
  MapPin,
  Loader2,
} from 'lucide-react';

interface EndShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeShift: any;
  endOdo: string;
  setEndOdo: (val: string) => void;
  cashDeposited: string;
  setCashDeposited: (val: string) => void;
  endNotes: string;
  setEndNotes: (val: string) => void;
  endLoc: string;
  endLocStatus: string;
  shiftError: string;
  isShiftPending: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export function EndShiftModal({
  isOpen,
  onClose,
  activeShift,
  endOdo,
  setEndOdo,
  cashDeposited,
  setCashDeposited,
  endNotes,
  setEndNotes,
  endLoc,
  endLocStatus,
  shiftError,
  isShiftPending,
  onSubmit,
}: EndShiftModalProps) {
  if (!isOpen || !activeShift) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[32px] w-full max-w-xl shadow-2xl border border-white/80 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-5 h-5 text-[#E4B84D]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">End Shift & Cash Handover</h3>
              <p className="text-xs text-slate-500">Auto aggregated sales, odometer audit & cash settlement</p>
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

        <form onSubmit={onSubmit} className="p-6 space-y-4 overflow-y-auto">
          {shiftError && (
            <div className="p-3 bg-red-50 border border-red-200/80 text-red-600 text-sm rounded-2xl font-medium animate-in fade-in">
              {shiftError}
            </div>
          )}

          {/* 1. Odometer Readings & Distance Driven */}
          <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span className="font-semibold text-slate-700">Vehicle Odometer Audit</span>
              <span className="font-mono">
                Start Meter: <strong className="text-slate-900">{activeShift.odometer_start || 0} km</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700">Bike Meter End (km) *</label>
                <div className="relative">
                  <Gauge className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="number"
                    required
                    min={activeShift.odometer_start || 0}
                    step="0.1"
                    value={endOdo}
                    onChange={(e) => setEndOdo(e.target.value)}
                    placeholder={`> ${activeShift.odometer_start || 0}`}
                    className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs sm:text-sm font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20"
                  />
                </div>
              </div>

              {/* Auto Calculated Distance Card */}
              <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Distance Driven</p>
                  <p className="text-sm font-extrabold text-[#0D4728] font-mono mt-0.5">
                    {Math.max(0, (parseFloat(endOdo) || 0) - (Number(activeShift.odometer_start) || 0)).toFixed(1)} km
                  </p>
                </div>
                <Bike className="w-5 h-5 text-slate-300" />
              </div>
            </div>
          </div>

          {/* 2. Read-Only Automated Achievements Summary */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800">Shift Performance Aggregation</label>
              <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Auto calculated from shift orders
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/70">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Outlets Visited</span>
                <p className="text-base font-bold text-slate-900 mt-0.5">{activeShift.visits_count || 0}</p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/70">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Orders Booked</span>
                <p className="text-base font-bold text-slate-900 mt-0.5">{activeShift.orders_count || 0}</p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/70">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Gross Order Value</span>
                <p className="text-base font-bold text-slate-900 font-mono mt-0.5">
                  ₹{Number(activeShift.total_order_value || 0).toLocaleString('en-IN')}
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200/70">
                <span className="text-[10px] text-emerald-800 uppercase font-bold">Cash Collected</span>
                <p className="text-base font-bold text-[#0D4728] font-mono mt-0.5">
                  ₹{Number(activeShift.cash_collected || 0).toLocaleString('en-IN')}
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-blue-50/70 border border-blue-200/70">
                <span className="text-[10px] text-blue-800 uppercase font-bold">Online UPI / Bank</span>
                <p className="text-base font-bold text-blue-900 font-mono mt-0.5">
                  ₹{Number(activeShift.online_collected || 0).toLocaleString('en-IN')}
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200/70">
                <span className="text-[10px] text-amber-800 uppercase font-bold">Market Credit Due</span>
                <p className="text-base font-bold text-amber-900 font-mono mt-0.5">
                  ₹{Number(activeShift.market_due || 0).toLocaleString('en-IN')}
                </p>
              </div>
            </div>
          </div>

          {/* 3. Cash Handover to Ledo Valley Office */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50/60 to-white border border-emerald-200/90 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5 text-[#0D4728]" />
                  <span>Cash Deposited to Ledo Valley HQ *</span>
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5">Amount handed over in cash to office cashier or manager</p>
              </div>
            </div>

            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₹</span>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={cashDeposited}
                onChange={(e) => setCashDeposited(e.target.value)}
                placeholder={`e.g. ${activeShift.cash_collected || 0}`}
                className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-8 pr-4 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20"
              />
            </div>

            {/* Handover Reconciliation Callout */}
            {(() => {
              const collected = Number(activeShift.cash_collected || 0);
              const deposited = parseFloat(cashDeposited) || 0;
              const discrepancy = collected - deposited;

              if (!cashDeposited) {
                return (
                  <p className="text-[11px] text-slate-500">
                    Enter deposited amount to calculate remaining balance in hand.
                  </p>
                );
              }

              if (discrepancy === 0) {
                return (
                  <div className="p-2.5 rounded-xl bg-emerald-100/70 border border-emerald-300 text-xs text-emerald-900 font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>All collected cash (₹{collected.toLocaleString('en-IN')}) successfully deposited. Net in-hand balance is ₹0.</span>
                  </div>
                );
              }

              if (discrepancy > 0) {
                return (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>
                      Retained balance in rep&apos;s hand: <strong className="font-mono">₹{discrepancy.toLocaleString('en-IN')}</strong> (will carry over to next shift ledger).
                    </span>
                  </div>
                );
              }

              return (
                <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-300 text-xs text-blue-900 font-medium flex items-center gap-2">
                  <IndianRupee className="w-4 h-4 text-blue-700 shrink-0" />
                  <span>
                    Deposit exceeds shift cash by <strong className="font-mono">₹{Math.abs(discrepancy).toLocaleString('en-IN')}</strong> (e.g. past credit collections).
                  </span>
                </div>
              );
            })()}
          </div>

          {/* 4. End Location Grabber & Notes */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#0D4728]" />
                <span className="text-xs font-semibold text-slate-700">Closing GPS Location</span>
              </div>
              <div>
                {endLoc ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {endLoc}
                  </span>
                ) : endLocStatus === 'requesting' ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                    <Loader2 className="w-3 h-3 animate-spin text-[#0D4728]" />
                    Acquiring live coordinates...
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50/70 px-2.5 py-0.5 rounded-full font-medium">
                    Auto-tagging on close
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Shift Notes / Remarks</label>
              <textarea
                rows={2}
                value={endNotes}
                onChange={(e) => setEndNotes(e.target.value)}
                placeholder="e.g. Dibrugarh route completed. Retailer in Digboi promised bulk tea reorder next Monday."
                className="w-full bg-slate-50/70 border border-slate-200 rounded-2xl p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 resize-none"
              />
            </div>
          </div>

          {/* Modal Actions */}
          <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100 shrink-0">
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
              className="flex items-center gap-2 bg-slate-900 hover:bg-[#0D4728] text-white px-6 py-2.5 rounded-full text-sm font-semibold transition-all disabled:opacity-50 shadow-xs"
            >
              {isShiftPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Confirm & Complete Shift Handover</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
