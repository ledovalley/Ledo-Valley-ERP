'use client';

import React from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Play,
  Pause,
  CheckCircle,
  Loader2,
  Clock,
} from 'lucide-react';
import { WeeklyProgressData, FieldActivityEvent } from '../types';
import { ShiftChronographDial } from '../widgets/ShiftChronographDial';

interface WeekDayItem {
  dateKey: string;
  dayName: string;
  dayNum: number;
}

interface Column2FieldShiftTrackerProps {
  activeShift: any;
  timerSeconds: number;
  getTimerParts: (totalSec: number) => { hours: string; minutes: string; seconds: string };
  onStartShiftClick: () => void;
  onPauseShift: () => void;
  onResumeShift: () => void;
  onEndShiftClick: () => void;
  isShiftPending: boolean;
  liveWeeklyProgress: WeeklyProgressData;
  hoveredProgressDay: number | null;
  setHoveredProgressDay: (val: number | null) => void;
  currentMonthYear: string;
  weekDays: WeekDayItem[];
  selectedDateKey: string;
  setSelectedDateKey: (key: string) => void;
  fieldActivities: FieldActivityEvent[];
  dayActivities: FieldActivityEvent[];
  isManagement?: boolean;
  className?: string;
}

export function Column2FieldShiftTracker({
  activeShift,
  timerSeconds,
  getTimerParts,
  onStartShiftClick,
  onPauseShift,
  onResumeShift,
  onEndShiftClick,
  isShiftPending,
  liveWeeklyProgress,
  hoveredProgressDay,
  setHoveredProgressDay,
  currentMonthYear,
  weekDays,
  selectedDateKey,
  setSelectedDateKey,
  fieldActivities,
  dayActivities,
  isManagement = false,
  className,
}: Column2FieldShiftTrackerProps) {
  const [showFullDial, setShowFullDial] = React.useState(false);
  return (
    <div className={`lg:col-span-8 xl:col-span-6 space-y-2 ${className || ''}`}>
      {/* Top 2 Cards: Progress + Shift Tracker (Split Row) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {/* Card A: Progress Card (Dynamic Weekly Route Analytics) */}
        <div
          className={`bg-white rounded-[24px] sm:rounded-[28px] p-4 sm:p-6 shadow-sm border border-slate-100/80 flex flex-col justify-between h-full ${
            !isManagement ? 'order-2 sm:order-1' : 'order-1'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-base font-bold text-slate-900">Progress</span>
            <Link
              href="/dashboard/sales"
              className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-[#0D4728] transition-colors"
              title="View Detailed Sales & Progress"
            >
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Main Metric & Summary Chips */}
          <div className="space-y-2 mt-1 mb-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-light text-slate-900 tracking-tight">
                {liveWeeklyProgress.totalHours} h
              </span>
              <span className="text-sm text-slate-400 font-medium">Route Time / wk</span>
            </div>

            <div className="flex items-center gap-2 text-[11px]">
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-100/80 font-medium">
                📍 {liveWeeklyProgress.totalDistanceKm} km
              </span>
              <span className="px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200/80 font-medium">
                ₹{liveWeeklyProgress.totalSales.toLocaleString('en-IN')} Sales
              </span>
            </div>
          </div>

          {/* Dynamic Resizable Weekly Pill Bar Chart (S M T W T F S) */}
          <div className="pt-2 flex-1 flex flex-col justify-end min-h-[145px]">
            <div className="relative flex items-end justify-between gap-1.5 h-full w-full px-1">
              {liveWeeklyProgress.days.map((day, idx) => {
                const maxHours = Math.max(
                  8,
                  ...liveWeeklyProgress.days.map((d) => d.hours || 0)
                );

                let barHeightPercent = 18;
                if (day.isPresent || (day.isToday && activeShift)) {
                  barHeightPercent = Math.min(92, Math.max(35, Math.round(((day.hours || 1) / maxHours) * 92)));
                } else if (day.isToday) {
                  barHeightPercent = 28;
                }

                let barBgClass = 'bg-slate-200';
                let dayTextClass = 'text-slate-400 font-medium';

                if (day.isToday) {
                  barBgClass = 'bg-[#E4B84D] shadow-xs';
                  dayTextClass = 'text-slate-900 font-extrabold';
                } else if (day.isPresent) {
                  barBgClass = 'bg-[#0D4728]';
                  dayTextClass = 'text-[#0D4728] font-bold';
                }

                return (
                  <div
                    key={`${day.dayLetter}-${idx}`}
                    className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end relative group cursor-pointer"
                    onMouseEnter={() => setHoveredProgressDay(idx)}
                    onMouseLeave={() => setHoveredProgressDay(null)}
                  >
                    {/* Dynamic Tooltip on Hover */}
                    {hoveredProgressDay === idx && (
                      <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 z-30 pointer-events-none whitespace-nowrap bg-slate-900/95 backdrop-blur-md text-white text-[11px] py-2 px-3 rounded-xl shadow-xl border border-slate-700/60 animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center gap-1.5 font-bold mb-1 border-b border-white/10 pb-1">
                          <span>{day.fullDayName}</span>
                          <span className="text-slate-400 font-mono text-[10px]">{day.dateNum} Oct</span>
                          {day.isToday && (
                            <span className="bg-[#E4B84D] text-slate-900 text-[9px] px-1.5 py-0.2 rounded font-extrabold uppercase">
                              Today
                            </span>
                          )}
                        </div>
                        <div className="space-y-0.5 text-[10px] text-slate-300">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-slate-400">Status:</span>
                            <span className={`font-semibold ${day.isPresent ? 'text-emerald-400' : 'text-slate-400'}`}>
                              {day.isPresent ? 'Present' : 'Absent'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-slate-400">Sales:</span>
                            <span className="font-bold text-[#FFF9CD]">
                              ₹{day.salesAmount.toLocaleString('en-IN')}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-slate-400">Distance:</span>
                            <span className="font-mono text-emerald-300 font-semibold">
                              {day.distanceKm} km
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-slate-400">Route Time:</span>
                            <span className="font-mono text-white">
                              {day.hours > 0 ? `${day.hours} h` : day.isPresent ? 'Active' : '0 h'}
                            </span>
                          </div>
                        </div>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900/95" />
                      </div>
                    )}

                    {/* Pill Bar */}
                    <div
                      className={`w-3 sm:w-3.5 rounded-full transition-all duration-300 group-hover:scale-y-105 group-hover:brightness-110 ${barBgClass}`}
                      style={{ height: `${barHeightPercent}%` }}
                    />

                    {/* Day Letter */}
                    <span className={`text-xs transition-colors ${dayTextClass}`}>
                      {day.dayLetter}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Card B: Shift / Work Tracker */}
        {isManagement && !activeShift && !showFullDial ? (
          <div className="bg-white rounded-[24px] sm:rounded-[28px] p-5 sm:p-6 shadow-sm border border-slate-100/80 flex flex-col justify-between h-full min-h-[160px] order-2">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-base font-bold text-slate-900">Personal Shift</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  <span>Standby</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Management mode active. Field fleet and live operations are prioritized below.
              </p>
            </div>

            <div className="pt-4 flex items-center justify-between gap-2 border-t border-slate-100 mt-3">
              <button
                type="button"
                onClick={onStartShiftClick}
                className="flex items-center justify-center gap-1.5 bg-[#0D4728] hover:bg-[#167a44] text-[#FFF9CD] py-2 px-3.5 rounded-full text-xs font-bold transition-all shadow-xs"
              >
                <Play className="w-3.5 h-3.5 fill-[#FFF9CD]" />
                <span>Start Shift</span>
              </button>
              <button
                type="button"
                onClick={() => setShowFullDial(true)}
                className="text-[11px] font-medium text-slate-500 hover:text-slate-800 px-2.5 py-1.5 rounded-xl hover:bg-slate-100 transition-colors"
              >
                Show Dial &darr;
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`bg-white rounded-[24px] sm:rounded-[28px] p-4 sm:p-6 shadow-sm border border-slate-100/80 flex flex-col justify-between h-full ${
              !isManagement ? 'order-1 sm:order-2' : 'order-2'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <div>
                <span className="text-base font-bold text-slate-900">Shift Tracker</span>
                {activeShift?.odometer_start !== undefined && (
                  <p className="text-[11px] text-slate-400 font-medium">
                    Start Meter: {activeShift.odometer_start} km
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {isManagement && !activeShift && showFullDial && (
                  <button
                    type="button"
                    onClick={() => setShowFullDial(false)}
                    className="text-[11px] text-slate-400 hover:text-slate-600 px-2 py-0.5 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    Hide Dial &uarr;
                  </button>
                )}
                {/* Status Pill Badge */}
                {activeShift?.status === 'active' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-[11px] font-bold text-emerald-800">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>On Route</span>
                  </span>
                ) : activeShift?.status === 'paused' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200/80 text-[11px] font-bold text-amber-800">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span>Paused</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-[11px] font-semibold text-slate-500">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    <span>Offline</span>
                  </span>
                )}
              </div>
            </div>

            {/* Chronograph Dial */}
            <div className="my-2 sm:my-3">
              <ShiftChronographDial
                activeShift={activeShift}
                timerSeconds={timerSeconds}
                getTimerParts={getTimerParts}
              />
            </div>

            {/* Shift Achievement Mini Counters (if active) */}
            {activeShift && (
              <div className="grid grid-cols-3 gap-1.5 py-2 px-2.5 bg-slate-50/80 rounded-2xl border border-slate-100 text-center text-xs mb-2 animate-in fade-in">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Visits</span>
                  <p className="font-bold text-slate-800">{activeShift.visits_count || 0}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Orders</span>
                  <p className="font-bold text-slate-800">{activeShift.orders_count || 0}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Cash</span>
                  <p className="font-bold text-[#0D4728] font-mono">
                    ₹{Number(activeShift.cash_collected || 0).toLocaleString('en-IN')}
                  </p>
                </div>
              </div>
            )}

            {/* Shift Controls */}
            <div className="pt-1">
              {!activeShift ? (
                <button
                  type="button"
                  onClick={onStartShiftClick}
                  className="w-full flex items-center justify-center gap-2 bg-[#0D4728] hover:bg-[#167a44] text-[#FFF9CD] py-2.5 px-4 rounded-full text-xs font-bold transition-all shadow-xs"
                >
                  <Play className="w-3.5 h-3.5 fill-[#FFF9CD]" />
                  <span>Start Field Shift</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  {activeShift.status === 'active' ? (
                    <button
                      type="button"
                      onClick={onPauseShift}
                      disabled={isShiftPending}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 py-2 px-3 rounded-full text-xs font-semibold transition-all disabled:opacity-50"
                    >
                      {isShiftPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
                      <span>Pause</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onResumeShift}
                      disabled={isShiftPending}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 py-2 px-3 rounded-full text-xs font-semibold transition-all disabled:opacity-50"
                    >
                      {isShiftPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-emerald-800" />
                      )}
                      <span>Resume</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={onEndShiftClick}
                    disabled={isShiftPending}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-red-700 text-white py-2 px-3 rounded-full text-xs font-semibold transition-all shadow-xs disabled:opacity-50"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>End Shift</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Card: Live Field Operations Timeline */}
      <div className="bg-white rounded-[24px] sm:rounded-[28px] p-4 sm:p-6 shadow-sm border border-slate-100/80 space-y-3.5 sm:space-y-4 mb-1">
        {/* Header: Month & Live Indicator */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Field Log</span>
          <span className="text-sm sm:text-base font-bold text-slate-900">{currentMonthYear}</span>
          <span className="text-[11px] sm:text-xs font-semibold text-slate-700 px-2.5 sm:px-3 py-1 bg-slate-50 rounded-full border border-slate-200/90 flex items-center gap-1.5 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live Operations
          </span>
        </div>

        {/* Days Column Header with dynamic date selection */}
        <div className="grid grid-cols-5 gap-1 sm:gap-2 text-center text-xs pb-2 border-b border-slate-100">
          {weekDays.map((day) => {
            const isSelected = selectedDateKey === day.dateKey;
            const countForDay = fieldActivities.filter((a) => a.dateKey === day.dateKey).length;
            return (
              <button
                key={day.dateKey}
                type="button"
                onClick={() => setSelectedDateKey(day.dateKey)}
                className={`py-2 sm:py-1.5 px-0.5 sm:px-1 min-h-[46px] sm:min-h-0 rounded-xl transition-all relative flex flex-col items-center justify-center cursor-pointer active:scale-95 ${isSelected
                  ? 'bg-[#0D4728]/10 text-[#0D4728] ring-1 ring-[#0D4728]/20'
                  : 'hover:bg-slate-50 text-slate-600'
                  }`}
              >
                <p className={`text-[10px] sm:text-xs ${isSelected ? 'text-[#0D4728] font-bold' : 'text-slate-400 font-medium'}`}>
                  {day.dayName}
                </p>
                <p className={`text-xs sm:text-sm ${isSelected ? 'font-extrabold text-[#0D4728]' : 'font-bold text-slate-800'}`}>
                  {day.dayNum}
                </p>
                {countForDay > 0 && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full mt-0.5 ${isSelected ? 'bg-[#0D4728]' : 'bg-emerald-500'}`}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Timeline Slots with Real Scheduled Events */}
        <div className="space-y-2.5 sm:space-y-3 pt-1">
          {dayActivities.length === 0 ? (
            <div className="py-7 px-4 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200 text-center">
              <Clock className="w-5 h-5 text-slate-300 mx-auto mb-1.5" />
              <p className="text-xs font-semibold text-slate-600">No field operations logged for this day</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Shift starts and retailer orders will appear here automatically.
              </p>
            </div>
          ) : (
            dayActivities.map((event) => {
              if (event.type === 'shift_start') {
                return (
                  <div key={event.id} className="flex items-start gap-2 sm:gap-3">
                    <span className="text-[10px] sm:text-xs font-semibold text-slate-400 w-14 sm:w-16 pt-2 shrink-0">
                      {event.timeFormatted}
                    </span>
                    <div className="flex-1 bg-[#15231B] text-white p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl shadow-sm border border-emerald-900/40 flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <p className="text-xs sm:text-sm font-semibold text-white truncate">{event.title}</p>
                        <p className="text-[11px] sm:text-xs text-emerald-200/70 mt-0.5 truncate">{event.subtitle}</p>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        {event.badge && (
                          <span className="text-[9px] px-1.5 sm:px-2 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                            {event.badge}
                          </span>
                        )}
                        <div
                          className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-emerald-700 text-white font-bold text-[9px] sm:text-[10px] flex items-center justify-center border-2 border-white/20"
                          title={event.userName}
                        >
                          {event.userMonogram}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              if (event.type === 'shift_end') {
                return (
                  <div key={event.id} className="flex items-start gap-2 sm:gap-3">
                    <span className="text-[10px] sm:text-xs font-semibold text-slate-400 w-14 sm:w-16 pt-2 shrink-0">
                      {event.timeFormatted}
                    </span>
                    <div className="flex-1 bg-slate-100/90 text-slate-800 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl shadow-2xs border border-slate-200 flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{event.title}</p>
                        <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 truncate">{event.subtitle}</p>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        <span className="text-[9px] px-1.5 sm:px-2 py-0.5 rounded-full font-bold bg-slate-200 text-slate-700">
                          Completed
                        </span>
                        <div
                          className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-700 text-white font-bold text-[9px] sm:text-[10px] flex items-center justify-center border-2 border-white"
                          title={event.userName}
                        >
                          {event.userMonogram}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              // Order Booked Event
              return (
                <div key={event.id} className="flex items-start gap-2 sm:gap-3">
                  <span className="text-[10px] sm:text-xs font-semibold text-slate-400 w-14 sm:w-16 pt-2 shrink-0">
                    {event.timeFormatted}
                  </span>
                  <div className="flex-1 bg-slate-50 border border-slate-200/90 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl shadow-2xs flex items-center justify-between transition-all hover:border-[#0D4728]/30">
                    <div className="min-w-0 pr-2">
                      <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{event.title}</p>
                      <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 truncate">{event.subtitle}</p>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                      {event.badge && (
                        <span
                          className={`text-[9px] px-1.5 sm:px-2 py-0.5 rounded-full font-bold uppercase ${event.badge === 'CREDIT'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : event.badge === 'PARTIAL'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                        >
                          {event.badge}
                        </span>
                      )}
                      <div
                        className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-[#0D4728] text-[#FFF9CD] font-bold text-[9px] sm:text-[10px] flex items-center justify-center border-2 border-white shadow-2xs"
                        title={event.userName}
                      >
                        {event.userMonogram}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
