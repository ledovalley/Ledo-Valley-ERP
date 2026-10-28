'use client';

import React from 'react';
import Link from 'next/link';
import {
  MapPin,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Smartphone,
  FileText,
} from 'lucide-react';
import { DashboardStats, TerritoryDistributionItem, ActiveFieldDevice } from '../types';
import { DeviceUnitCard } from '../widgets/DeviceUnitCard';

const DEVICES_PER_PAGE = 3;

interface Column1StatsAndAccordionsProps {
  stats: DashboardStats;
  territories: TerritoryDistributionItem[];
  openAccordion: string | null;
  toggleAccordion: (panel: string) => void;
  territoryPage: number;
  setTerritoryPage: React.Dispatch<React.SetStateAction<number>>;
  totalTerritoryPages: number;
  setIsTerritoryPaused: (val: boolean) => void;
  displayDevices: ActiveFieldDevice[];
  devicePage: number;
  setDevicePage: React.Dispatch<React.SetStateAction<number>>;
  totalDevicePages: number;
  setIsDevicePaused: (val: boolean) => void;
  className?: string;
}

export function Column1StatsAndAccordions({
  stats,
  territories,
  openAccordion,
  toggleAccordion,
  territoryPage,
  setTerritoryPage,
  totalTerritoryPages,
  setIsTerritoryPaused,
  displayDevices,
  devicePage,
  setDevicePage,
  totalDevicePages,
  setIsDevicePaused,
  className,
}: Column1StatsAndAccordionsProps) {
  return (
    <div className={`lg:col-span-4 xl:col-span-3 space-y-2 ${className || ''}`}>
      {/* Spotlight Card */}
      <div className="bg-white rounded-[24px] sm:rounded-[28px] p-4 sm:p-6 shadow-sm border border-slate-100/80 relative overflow-hidden flex flex-col justify-between min-h-[220px] sm:min-h-[260px]">
        {/* Soft decorative background leaf gradient in Ledo Valley colors */}
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-[#0D4728]/5 blur-2xl pointer-events-none" />

        {/* Top: Monogram Avatar & Badges */}
        <div className="flex items-start justify-between relative z-10">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-[#0D4728] to-[#167a44] p-1 flex items-center justify-center shadow-md">
            <div className="w-full h-full rounded-xl border border-[#FFF9CD]/30 flex flex-col items-center justify-center text-[#FFF9CD]">
              <span className="text-xl sm:text-2xl font-bold tracking-wider">LV</span>
              <span className="text-[8px] sm:text-[9px] uppercase tracking-widest text-[#FFF9CD]/80 font-semibold">Estate</span>
            </div>
          </div>

          <span className="px-3 py-0.5 sm:px-3.5 sm:py-1 rounded-full bg-[#E4B84D]/15 text-[#96741d] font-semibold text-xs border border-[#E4B84D]/25">
            Active
          </span>
        </div>

        {/* Bottom info */}
        <div className="mt-3.5 sm:mt-4 relative z-10">
          <h3 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug">
            {stats.userName || 'Ledo Valley HQ'}
          </h3>
          <p className="text-xs sm:text-sm font-medium text-slate-500 capitalize mt-0.5">
            {stats.userRole} &bull; {stats.userDistrict ? `${stats.userDistrict} Division` : 'Assam Division'}
          </p>

          {/* Total Sales Pill */}
          <div className="mt-3.5 sm:mt-4 pt-3 sm:pt-3.5 border-t border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-[11px] sm:text-xs uppercase tracking-wider text-slate-400 font-bold">
                {['admin', 'manager'].includes((stats.userRole || '').toLowerCase()) ? 'Total Sales' : 'My Total Sales'}
              </p>
              <p className="text-xl sm:text-2xl font-bold text-slate-900">
                ₹{Number(stats.totalRevenue || 0).toLocaleString('en-IN')}
              </p>
            </div>
            <Link
              href="/dashboard/sales"
              className="px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full bg-[#0D4728] text-[#FFF9CD] text-xs sm:text-sm font-semibold hover:bg-[#167a44] transition-colors shadow-xs"
            >
              View Sales
            </Link>
          </div>
        </div>
      </div>

      {/* Accordion Panels */}
      <div className="bg-white rounded-[24px] sm:rounded-[28px] p-3.5 sm:p-5 shadow-sm border border-slate-100/80 space-y-1.5">
        {/* Accordion 1: Territory Distribution */}
        <div className="border-b border-slate-100 last:border-none pb-2.5 pt-1">
          <button
            onClick={() => toggleAccordion('territory')}
            className="w-full flex items-center justify-between py-2 text-left font-semibold text-slate-800 text-sm hover:text-[#0D4728] transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <MapPin className="w-4 h-4 text-[#0D4728]" />
              <span>Territory Distribution</span>
            </div>
            {openAccordion === 'territory' ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {openAccordion === 'territory' && (
            <div
              className="py-2.5 pl-2 sm:pl-6.5 pr-1 sm:pr-2 space-y-2 text-sm text-slate-600 animate-in fade-in duration-150"
              onMouseEnter={() => setIsTerritoryPaused(true)}
              onMouseLeave={() => setIsTerritoryPaused(false)}
            >
              {territories.length === 0 ? (
                <div className="p-4 bg-slate-50 rounded-2xl text-center text-xs text-slate-400 border border-dashed border-slate-200">
                  <p className="font-semibold text-slate-600">No territory records found</p>
                  <p className="text-[11px] mt-0.5">Start shifts or log sales to see exact distribution.</p>
                </div>
              ) : territories.length <= 5 ? (
                <div className="space-y-2 py-1">
                  {territories.map((item) => (
                    <div key={item.name} className="flex justify-between items-center py-1">
                      <span className="font-medium text-slate-700">{item.name}</span>
                      <span className="font-bold text-slate-900">{item.percentage}%</span>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="relative w-full overflow-hidden">
                    <div
                      className="flex transition-transform duration-500 ease-in-out"
                      style={{ transform: `translateX(-${territoryPage * 100}%)` }}
                    >
                      {Array.from({ length: totalTerritoryPages }).map((_, pageIdx) => {
                        const pageItems = territories.slice(pageIdx * 5, pageIdx * 5 + 5);
                        return (
                          <div key={pageIdx} className="w-full min-w-full shrink-0 space-y-2">
                            {pageItems.map((item) => (
                              <div key={item.name} className="flex justify-between items-center py-1">
                                <span className="font-medium text-slate-700">{item.name}</span>
                                <span className="font-bold text-slate-900">{item.percentage}%</span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Paging Controls */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-400">
                    <div className="flex items-center gap-1.5">
                      {Array.from({ length: totalTerritoryPages }).map((_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setTerritoryPage(idx)}
                          className={`h-1.5 rounded-full transition-all ${territoryPage === idx
                            ? 'w-4 bg-[#0D4728]'
                            : 'w-1.5 bg-slate-200 hover:bg-slate-300'
                            }`}
                          title={`Page ${idx + 1}`}
                        />
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400">
                      <span>
                        Page {territoryPage + 1} of {totalTerritoryPages}
                      </span>
                      <div className="flex items-center gap-1 ml-1">
                        <button
                          type="button"
                          onClick={() =>
                            setTerritoryPage((prev) => (prev - 1 + totalTerritoryPages) % totalTerritoryPages)
                          }
                          className="p-1.5 sm:p-0.5 rounded-lg hover:bg-slate-100 active:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
                          title="Previous territories"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setTerritoryPage((prev) => (prev + 1) % totalTerritoryPages)}
                          className="p-1.5 sm:p-0.5 rounded-lg hover:bg-slate-100 active:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
                          title="Next territories"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Accordion 2: Field Devices */}
        <div className="border-b border-slate-100 last:border-none pb-2.5 pt-1">
          <button
            onClick={() => toggleAccordion('devices')}
            className="w-full flex items-center justify-between py-2 text-left font-semibold text-slate-800 text-sm hover:text-[#0D4728] transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <Smartphone className="w-4 h-4 text-[#0D4728]" />
              <span>
                {['admin', 'manager'].includes((stats.userRole || '').toLowerCase())
                  ? 'Active Field Devices'
                  : 'My Active Device'}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                {displayDevices.length} Active
              </span>
            </div>
            {openAccordion === 'devices' ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {openAccordion === 'devices' && (
            <div
              className="py-2.5 pl-2 sm:pl-6.5 pr-1 sm:pr-2 text-sm text-slate-600 animate-in fade-in duration-150 space-y-2.5"
              onMouseEnter={() => setIsDevicePaused(true)}
              onMouseLeave={() => setIsDevicePaused(false)}
            >
              {displayDevices.length === 0 ? (
                <div className="p-4 bg-slate-50 rounded-2xl text-center text-xs text-slate-400 border border-dashed border-slate-200">
                  <p className="font-semibold text-slate-600">
                    {['admin', 'manager'].includes((stats.userRole || '').toLowerCase())
                      ? 'No active devices in field'
                      : 'No active shift device'}
                  </p>
                  <p className="text-[11px] mt-0.5">
                    {['admin', 'manager'].includes((stats.userRole || '').toLowerCase())
                      ? 'Team members will appear here once they begin shifts.'
                      : 'Start a shift above to track your unit live.'}
                  </p>
                </div>
              ) : displayDevices.length <= DEVICES_PER_PAGE ? (
                <div className="space-y-2.5">
                  {displayDevices.map((device, idx) => (
                    <DeviceUnitCard key={`${device.id || device.shiftId}-${idx}`} device={device} />
                  ))}
                </div>
              ) : (
                <>
                  <div className="relative w-full overflow-hidden">
                    <div
                      className="flex transition-transform duration-500 ease-in-out"
                      style={{ transform: `translateX(-${devicePage * 100}%)` }}
                    >
                      {Array.from({ length: totalDevicePages }).map((_, pageIdx) => {
                        const pageDevices = displayDevices.slice(
                          pageIdx * DEVICES_PER_PAGE,
                          pageIdx * DEVICES_PER_PAGE + DEVICES_PER_PAGE
                        );
                        return (
                          <div key={pageIdx} className="w-full min-w-full shrink-0 space-y-2.5">
                            {pageDevices.map((device, idx) => (
                              <DeviceUnitCard
                                key={`${device.id || device.shiftId}-${pageIdx}-${idx}`}
                                device={device}
                              />
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Paging Controls */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-400">
                    <div className="flex items-center gap-1.5">
                      {Array.from({ length: totalDevicePages }).map((_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setDevicePage(idx)}
                          className={`h-1.5 rounded-full transition-all ${devicePage === idx
                            ? 'w-4 bg-[#0D4728]'
                            : 'w-1.5 bg-slate-200 hover:bg-slate-300'
                            }`}
                          title={`Page ${idx + 1}`}
                        />
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400">
                      <span>
                        Page {devicePage + 1} of {totalDevicePages}
                      </span>
                      <div className="flex items-center gap-1 ml-1">
                        <button
                          type="button"
                          onClick={() =>
                            setDevicePage((prev) => (prev - 1 + totalDevicePages) % totalDevicePages)
                          }
                          className="p-1.5 sm:p-0.5 rounded-lg hover:bg-slate-100 active:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
                          title="Previous devices"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDevicePage((prev) => (prev + 1) % totalDevicePages)}
                          className="p-1.5 sm:p-0.5 rounded-lg hover:bg-slate-100 active:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
                          title="Next devices"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Accordion 3: Operational Policies */}
        <div className="last:border-none pt-1">
          <button
            onClick={() => toggleAccordion('policies')}
            className="w-full flex items-center justify-between py-2 text-left font-semibold text-slate-800 text-sm hover:text-[#0D4728] transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <FileText className="w-4 h-4 text-[#0D4728]" />
              <span>Compliance & Protocols</span>
            </div>
            {openAccordion === 'policies' ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>
          {openAccordion === 'policies' && (
            <div className="py-2.5 pl-2 sm:pl-6.5 pr-1 sm:pr-2 space-y-1 text-xs text-slate-600 animate-in fade-in duration-150 leading-relaxed">
              <p className="text-xs text-slate-500">
                Strict adherence to Tea Board of India batch packaging regulations and daily GPS territory logging.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
