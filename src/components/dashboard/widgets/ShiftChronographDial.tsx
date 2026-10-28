'use client';

import { DIAL_TICKS } from '../constants';

interface ShiftChronographDialProps {
  activeShift: any;
  timerSeconds: number;
  getTimerParts: (totalSec: number) => { hours: string; minutes: string; seconds: string };
}

export function ShiftChronographDial({
  activeShift,
  timerSeconds,
  getTimerParts
}: ShiftChronographDialProps) {
  // 8-hour progress ratio (0.0 to 1.0)
  const eightHourProgress = activeShift ? Math.min(1, timerSeconds / 28800) : 0;
  const progressDegrees = eightHourProgress * 360;

  // Chronograph Dial Geometry
  const dialRadius = 58.5; // Centers in tick marks (inner radius 54.5, outer radius 62.5)
  const strokeWidth = 8.5; // Perfectly covers tick marks with 0.5px margin on each side
  const halfStroke = strokeWidth / 2;

  // Angular offset for rounded linecap (4.25 / 58.5 * 180 / PI ≈ 4.163 deg)
  const capAngleOffset = (halfStroke / dialRadius) * (180 / Math.PI);
  const hourCircumference = +(2 * Math.PI * dialRadius).toFixed(2); // 367.57

  // Dash length along circumference
  const hourDashLength = eightHourProgress >= 1
    ? hourCircumference
    : Math.max(0.1, ((Math.max(0, progressDegrees - capAngleOffset * 2)) / 360) * hourCircumference);

  // Outer Seconds Dialer (0.0 to 1.0, sweeps every 60s)
  const secondsProgress = activeShift ? (timerSeconds % 60) / 60 : 0;
  const secondsCircumference = 452.39; // 2 * PI * 72
  const secondsDashoffset = secondsCircumference * (1 - secondsProgress);
  const secAngle = secondsProgress * 360 - 90;
  const secRad = (secAngle * Math.PI) / 180;
  const secPointerX = +(80 + 72 * Math.cos(secRad)).toFixed(2);
  const secPointerY = +(80 + 72 * Math.sin(secRad)).toFixed(2);

  const { hours, minutes, seconds } = activeShift
    ? getTimerParts(timerSeconds)
    : { hours: '00', minutes: '00', seconds: '00' };

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-48 h-48 sm:w-52 sm:h-52 flex items-center justify-center">

        {/* Circular Dial SVG (viewBox: 0 0 160 160) */}
        <svg className="w-full h-full overflow-visible" viewBox="0 0 160 160">
          <defs>
            {/* Mask to reveal only active seconds on the outer dashed ring */}
            <mask id="secondsProgressMask">
              <circle
                cx="80"
                cy="80"
                r="72"
                fill="none"
                stroke="white"
                strokeWidth="8"
                strokeDasharray={secondsCircumference}
                strokeDashoffset={secondsDashoffset}
                transform="rotate(-90 80 80)"
                className="transition-all duration-300 ease-linear"
              />
            </mask>
          </defs>

          {/* 1. OUTER SECONDS DIALER (Dashed Circle for 60s) */}
          <circle
            cx="80"
            cy="80"
            r="72"
            fill="none"
            stroke="#E2E8F0"
            strokeWidth="2.5"
            strokeDasharray="2.5 5.04"
          />

          {/* Active Seconds Dashed Highlighter Arc */}
          {activeShift && timerSeconds > 0 && (
            <circle
              cx="80"
              cy="80"
              r="72"
              fill="none"
              stroke={activeShift.status === 'active' ? '#0D4728' : '#F59E0B'}
              strokeWidth="2.5"
              strokeDasharray="2.5 5.04"
              mask="url(#secondsProgressMask)"
            />
          )}

          {/* Leading Second Pointer Dot on the Outer Dashed Ring */}
          {activeShift && timerSeconds > 0 && (
            <circle
              cx={secPointerX}
              cy={secPointerY}
              r="3"
              fill={activeShift.status === 'active' ? '#0D4728' : '#F59E0B'}
              stroke="#ffffff"
              strokeWidth="1"
              className="transition-all duration-300"
            />
          )}

          {/* 2. INNER 8-HOUR DIALER */}
          {/* Background Radial Chronograph Tick Marks (48 ticks) */}
          {DIAL_TICKS.map((t) => {
            const isCovered =
              activeShift &&
              timerSeconds > 0 &&
              (eightHourProgress >= 1 ||
                t.angle <= Math.max(7.5, progressDegrees + 1));

            if (isCovered) return null;

            return (
              <line
                key={t.id}
                x1={t.x1}
                y1={t.y1}
                x2={t.x2}
                y2={t.y2}
                stroke="#0f172a"
                strokeWidth="1.25"
                strokeLinecap="round"
                opacity={0.88}
              />
            );
          })}

          {/* Glowing Vibrant Sunshine Yellow 8-Hour Progress Arc */}
          {activeShift && timerSeconds > 0 && (
            <circle
              cx="80"
              cy="80"
              r={dialRadius}
              fill="none"
              stroke={activeShift.status === 'active' ? '#FDC841' : '#F59E0B'}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={`${hourDashLength} ${hourCircumference}`}
              strokeDashoffset={0}
              transform={`rotate(${-90 + (eightHourProgress < 1 ? capAngleOffset : 0)} 80 80)`}
              className="transition-all duration-500 ease-out"
            />
          )}
        </svg>

        {/* Inner Time Display & Subtitle */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none pointer-events-none px-4 translate-y-1 sm:translate-y-1.5">
          <div className="flex items-baseline justify-center">
            <span className="text-3xl sm:text-4xl font-normal text-slate-900 tracking-tight font-sans tabular-nums">
              {hours}:{minutes}
            </span>
            <span className="text-xs sm:text-sm font-medium text-slate-400 font-mono tabular-nums ml-0.5">
              :{seconds}
            </span>
          </div>
          <span className="text-xs text-slate-500 font-medium mt-0.5 tracking-tight">
            {activeShift ? 'Work Time' : 'Not Started'}
          </span>
        </div>
      </div>

      {/* Chronograph Dual Dial Legend */}
      <div className="flex items-center justify-center gap-3 text-[10px] text-slate-400 font-medium mt-2">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FDC841]" />
          <span>Inner: 8h Shift Dial</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0D4728]" />
          <span>Outer: 60s Dial</span>
        </span>
      </div>
    </div>
  );
}
