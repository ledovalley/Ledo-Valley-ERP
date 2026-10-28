'use client';

import { MapPin } from 'lucide-react';
import type { ActiveFieldDevice } from '../types';

interface DeviceUnitCardProps {
  device: ActiveFieldDevice | any;
}

export function DeviceUnitCard({ device }: DeviceUnitCardProps) {
  const formatStartedAgo = (timeStr?: string) => {
    if (!timeStr) return 'Active now';
    const startMs = new Date(timeStr).getTime();
    const diffSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
    const hrs = Math.floor(diffSec / 3600);
    const mins = Math.floor((diffSec % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m ago`;
    if (mins > 0) return `${mins}m ago`;
    return `${diffSec}s ago`;
  };

  const isLive = device.status === 'active';
  const monogram = (device.userName || 'FP').slice(0, 2).toUpperCase();

  return (
    <div className="rounded-2xl p-3 bg-gradient-to-br from-[#0D4728] via-[#11502d] to-[#0A381F] text-white shadow-xs border border-emerald-600/30 transition-all hover:border-emerald-500/50">
      {/* Top Row: User Avatar, Name, Role & Status Indicator */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-[#FFF9CD] font-bold text-[10px] shrink-0">
            {monogram}
          </div>
          <div className="min-w-0">
            <span className="font-bold text-xs text-white truncate block leading-tight">
              {device.userName}
            </span>
            <span className="text-[10px] text-emerald-300 font-mono">
              {device.deviceName}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/15 text-emerald-100 uppercase font-semibold">
            {device.userRole || 'Sales'}
          </span>
          <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-emerald-400 ring-2 ring-emerald-300/40 animate-pulse' : 'bg-amber-400'}`} />
        </div>
      </div>

      {/* Route & Territory */}
      <div className="flex items-center gap-1.5 text-[11px] text-emerald-100 font-medium mt-2 pt-1.5 border-t border-white/10">
        <MapPin className="w-3 h-3 text-emerald-300 shrink-0" />
        <span className="truncate">{device.territory || 'General Route'}</span>
      </div>

      {/* Bottom Row: Vehicle & Time */}
      <div className="flex items-center justify-between text-[10px] text-emerald-200/90 pt-1 font-mono">
        <span className="truncate">🏍️ {device.vehicleType || 'Bike'} • {device.odometerStart || 0} km</span>
        <span className="shrink-0 text-[10px] text-emerald-300 font-semibold">{formatStartedAgo(device.startTime)}</span>
      </div>
    </div>
  );
}
