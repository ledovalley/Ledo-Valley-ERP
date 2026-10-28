'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import {
  startShift,
  pauseShift,
  resumeShift,
  endShift,
  saveDailyOperationalTargets,
  type DailyOperationalTargets,
} from '@/app/dashboard/actions';
import { DashboardStats, DailyPriorityItem } from './types';
import { DEFAULT_ROUTES } from './constants';
import { DashboardHeroHeader } from './header/DashboardHeroHeader';
import { Column1StatsAndAccordions } from './columns/Column1StatsAndAccordions';
import { Column2FieldShiftTracker } from './columns/Column2FieldShiftTracker';
import { Column3OperationsDeck } from './columns/Column3OperationsDeck';
import { StartShiftModal } from './modals/StartShiftModal';
import { EndShiftModal } from './modals/EndShiftModal';
import { TargetMilestonesModal } from './modals/TargetMilestonesModal';

export default function DashboardOverviewClient({
  stats,
  initialActiveShift,
  initialRecentRoutes = [],
  initialActiveDevices = [],
  initialTargetProgress,
  initialTerritoryDistribution = [],
  initialFieldActivities = [],
  initialWeeklyProgress,
  initialDailyTasks = [],
  initialDailyTargets,
  initialTodayShift,
}: {
  stats: DashboardStats;
  initialActiveShift?: any;
  initialRecentRoutes?: string[];
  initialActiveDevices?: any[];
  initialTargetProgress?: any;
  initialTerritoryDistribution?: any[];
  initialFieldActivities?: any[];
  initialWeeklyProgress?: any;
  initialDailyTasks?: any[];
  initialDailyTargets?: DailyOperationalTargets;
  initialTodayShift?: any;
}) {
  const [territories] = useState<any[]>(initialTerritoryDistribution || []);
  const [fieldActivities, setFieldActivities] = useState<any[]>(initialFieldActivities || []);
  const [weeklyProgressData] = useState<any>(initialWeeklyProgress || null);
  const [hoveredProgressDay, setHoveredProgressDay] = useState<number | null>(null);
  const [activeShift, setActiveShift] = useState<any>(initialActiveShift || null);
  const [todayCompletedShift, setTodayCompletedShift] = useState<any>(
    initialTodayShift && (initialTodayShift.status === 'completed' || initialTodayShift.status === 'ended')
      ? initialTodayShift
      : null
  );
  const [dailyTargets, setDailyTargets] = useState<DailyOperationalTargets>(
    initialDailyTargets || {
      min_shift_hours: 6,
      target_visits: 5,
      target_orders: 3,
      target_distance_km: 15,
    }
  );
  const [isTargetsModalOpen, setIsTargetsModalOpen] = useState(false);
  const [targetForm, setTargetForm] = useState<DailyOperationalTargets>(
    initialDailyTargets || {
      min_shift_hours: 6,
      target_visits: 5,
      target_orders: 3,
      target_distance_km: 15,
    }
  );
  const [isSavingTargets, setIsSavingTargets] = useState(false);
  const [targetsFeedback, setTargetsFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const userRole = (stats.userRole || '').toLowerCase();
  const isManagement = userRole === 'admin' || userRole === 'manager';
  const canManageTargets = isManagement;
  const [targetProgress] = useState<any>(
    initialTargetProgress || {
      month: new Date().toISOString().slice(0, 7),
      sales: { actual: 0, target: 0, pct: 0 },
      reach: { actual: 0, target: 0, pct: 0 },
      orders: { actual: 0, target: 0, pct: 0 },
    }
  );
  const [isShiftPending, startShiftTransition] = useTransition();
  const [shiftError, setShiftError] = useState('');

  // Active Field Devices state
  const [activeDevices, setActiveDevices] = useState<any[]>(() => {
    const list = [...initialActiveDevices];
    if (initialActiveShift && (initialActiveShift.status === 'active' || initialActiveShift.status === 'paused')) {
      const exists = list.some((d) => d.shiftId === initialActiveShift.id || d.id === initialActiveShift.id);
      if (!exists) {
        list.unshift({
          id: initialActiveShift.id,
          shiftId: initialActiveShift.id,
          userId: initialActiveShift.user_id,
          userName: stats.userName,
          userRole: stats.userRole,
          deviceName: `Mobile Field GPS #01`,
          territory: initialActiveShift.territory || stats.userDistrict || 'Dibrugarh',
          vehicleType: initialActiveShift.vehicle_type || 'Motorcycle / Bike',
          odometerStart: initialActiveShift.odometer_start,
          startLocation: initialActiveShift.start_location,
          startTime: initialActiveShift.start_time,
          status: initialActiveShift.status,
          ordersCount: initialActiveShift.orders_count || 0,
          cashCollected: initialActiveShift.cash_collected || 0,
        });
      }
    }
    return list;
  });

  const displayDevices = activeDevices;

  // Reactively synchronize activeDevices when user starts, pauses, resumes, or ends shift
  useEffect(() => {
    if (activeShift && (activeShift.status === 'active' || activeShift.status === 'paused')) {
      setActiveDevices((prev) => {
        const idx = prev.findIndex((d) => d.shiftId === activeShift.id || d.id === activeShift.id);
        const userDevice = {
          id: activeShift.id,
          shiftId: activeShift.id,
          userId: activeShift.user_id,
          userName: stats.userName,
          userRole: stats.userRole,
          deviceName: idx >= 0 ? prev[idx].deviceName : `Mobile Field GPS #01`,
          territory: activeShift.territory || stats.userDistrict || 'Dibrugarh',
          vehicleType: activeShift.vehicle_type || 'Motorcycle / Bike',
          odometerStart: activeShift.odometer_start,
          startLocation: activeShift.start_location,
          startTime: activeShift.start_time,
          status: activeShift.status,
          ordersCount: activeShift.orders_count || 0,
          cashCollected: activeShift.cash_collected || 0,
        };
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], ...userDevice };
          return updated;
        }
        return [userDevice, ...prev];
      });
    } else if (!activeShift) {
      setActiveDevices((prev) => prev.filter((d) => (stats.userId ? d.userId !== stats.userId : true) && d.userName !== stats.userName));
    }
  }, [activeShift, stats.userName, stats.userRole, stats.userId]);

  // User-specific recent routes & dynamic suggestions
  const [userRecentRoutes, setUserRecentRoutes] = useState<string[]>(initialRecentRoutes || []);

  const [suggestedRoutes, setSuggestedRoutes] = useState<string[]>(() => {
    const primary = stats.userDistrict ? [stats.userDistrict] : [];
    const userList = (initialRecentRoutes || [])
      .filter(Boolean)
      .filter((r) => !primary.some((p) => p.toLowerCase() === r.toLowerCase()))
      .slice(0, 3);
    const combined = [...primary, ...userList];
    const needed = 4 - combined.length;
    const unused = DEFAULT_ROUTES.filter((d) => !combined.some((u) => u.toLowerCase() === d.toLowerCase()));
    return [...combined, ...unused.slice(0, needed)];
  });

  // Start Shift Modal State
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [startTerritory, setStartTerritory] = useState(
    stats.userDistrict ||
    (initialRecentRoutes && initialRecentRoutes.length > 0 ? initialRecentRoutes[0] : 'Dibrugarh')
  );
  const [startVehicle] = useState('Motorcycle / Bike');
  const [startOdo, setStartOdo] = useState('');
  const [startLoc, setStartLoc] = useState('');
  const [startLocStatus, setStartLocStatus] = useState<'idle' | 'requesting' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (isStartModalOpen) {
      const primary = stats.userDistrict ? [stats.userDistrict] : [];
      const userList = (userRecentRoutes || [])
        .filter(Boolean)
        .filter((r) => !primary.some((p) => p.toLowerCase() === r.toLowerCase()))
        .slice(0, 3);
      const combined = [...primary, ...userList];
      const needed = 4 - combined.length;
      const unused = DEFAULT_ROUTES.filter((d) => !combined.some((u) => u.toLowerCase() === d.toLowerCase()));
      const shuffled = [...unused].sort(() => 0.5 - Math.random()).slice(0, needed);
      setSuggestedRoutes([...combined, ...shuffled]);
    }
  }, [isStartModalOpen, userRecentRoutes, stats.userDistrict]);

  // End Shift Modal State
  const [isEndModalOpen, setIsEndModalOpen] = useState(false);
  const [endOdo, setEndOdo] = useState('');
  const [cashDeposited, setCashDeposited] = useState('');
  const [endNotes, setEndNotes] = useState('');
  const [endLoc, setEndLoc] = useState('');
  const [endLocStatus, setEndLocStatus] = useState<'idle' | 'requesting' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (initialActiveShift) {
      setActiveShift(initialActiveShift);
    }
  }, [initialActiveShift]);

  // Live timer for active shift
  const [timerSeconds, setTimerSeconds] = useState(0);

  useEffect(() => {
    if (!activeShift || !activeShift.start_time) {
      setTimerSeconds(0);
      return;
    }

    const calcElapsed = () => {
      const startMs = new Date(activeShift.start_time).getTime();
      const now = Date.now();
      const totalPaused = Number(activeShift.total_paused_seconds) || 0;

      if (activeShift.status === 'paused') {
        const pausedMs = activeShift.paused_at ? new Date(activeShift.paused_at).getTime() : now;
        return Math.max(0, Math.floor((pausedMs - startMs) / 1000) - totalPaused);
      }

      return Math.max(0, Math.floor((now - startMs) / 1000) - totalPaused);
    };

    setTimerSeconds(calcElapsed());

    if (activeShift.status === 'active') {
      const interval = setInterval(() => {
        setTimerSeconds(calcElapsed());
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [activeShift]);

  const getTimerParts = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return {
      hours: String(hrs).padStart(2, '0'),
      minutes: String(mins).padStart(2, '0'),
      seconds: String(secs).padStart(2, '0'),
    };
  };

  // Live weekly progress calculation incorporating active shift timer
  const liveWeeklyProgress = useMemo(() => {
    const daysLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const fullDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const fallbackDays = daysLabels.map((letter, idx) => ({
      dayLetter: letter,
      fullDayName: fullDays[idx],
      dateKey: '',
      dateNum: idx + 11,
      isToday: idx === 2,
      isPresent: idx === 2 && Boolean(activeShift),
      isAbsent: !(idx === 2 && Boolean(activeShift)),
      hours: 0,
      distanceKm: 0,
      salesAmount: 0,
    }));

    const base = weeklyProgressData || {
      totalHours: 0,
      totalDistanceKm: 0,
      totalSales: 0,
      days: fallbackDays,
    };

    const additionalHoursToday =
      activeShift && (activeShift.status === 'active' || activeShift.status === 'paused') && timerSeconds > 0
        ? +(timerSeconds / 3600).toFixed(1)
        : 0;

    const days = (base.days || fallbackDays).map((d: any) => {
      if (d.isToday && activeShift) {
        const computedHours = Math.max(Number(d.hours) || 0, additionalHoursToday);
        return {
          ...d,
          isPresent: true,
          isAbsent: false,
          hours: +computedHours.toFixed(1),
          distanceKm: d.distanceKm > 0 ? d.distanceKm : activeShift.odometer_start || 0,
        };
      }
      return d;
    });

    const totalHours = +days.reduce((acc: number, curr: any) => acc + (Number(curr.hours) || 0), 0).toFixed(1);

    return {
      ...base,
      totalHours,
      days,
    };
  }, [weeklyProgressData, activeShift, timerSeconds]);

  // Auto-acquire starting GPS location whenever start modal opens
  useEffect(() => {
    if (isStartModalOpen && typeof window !== 'undefined' && navigator.geolocation) {
      setStartLocStatus('requesting');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setStartLoc(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`);
          setStartLocStatus('success');
        },
        (err) => {
          console.warn('Silent GPS lookup:', err);
          setStartLocStatus('error');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    }
  }, [isStartModalOpen]);

  // Auto-acquire ending GPS location whenever end modal opens
  useEffect(() => {
    if (isEndModalOpen && typeof window !== 'undefined' && navigator.geolocation) {
      setEndLocStatus('requesting');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setEndLoc(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`);
          setEndLocStatus('success');
        },
        (err) => {
          console.warn('Silent End GPS lookup:', err);
          setEndLocStatus('error');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    }
  }, [isEndModalOpen]);

  // Shift action handlers
  const handleStartShiftSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShiftError('');
    startShiftTransition(async () => {
      let loc = startLoc;
      if (!loc && typeof window !== 'undefined' && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 3000,
              maximumAge: 30000,
            });
          });
          loc = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
          setStartLoc(loc);
        } catch (e) {
          console.warn('Silent GPS fallback:', e);
        }
      }

      const formData = new FormData();
      formData.append('territory', startTerritory);
      formData.append('vehicle_type', startVehicle);
      formData.append('odometer_start', startOdo);
      formData.append('start_location', loc || '');

      const res = await startShift(formData);
      if (res?.error) {
        setShiftError(res.error);
      } else {
        setIsStartModalOpen(false);
        setActiveShift(res.shift);
        setStartOdo('');
        if (res.shift) {
          const newShiftEvent = {
            id: `shift-start-${res.shift.id}`,
            type: 'shift_start',
            timestamp: res.shift.start_time || new Date().toISOString(),
            timeFormatted: new Date()
              .toLocaleTimeString('en-US', {
                timeZone: 'Asia/Kolkata',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
              })
              .toLowerCase(),
            dateKey: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
            title: 'Shift Commenced',
            subtitle: `${res.shift.territory || startTerritory} • ${res.shift.vehicle_type || startVehicle} • ${res.shift.odometer_start || startOdo || 0} km`,
            userName: stats.userName,
            userMonogram: (stats.userName || 'FS').slice(0, 2).toUpperCase(),
            badge: 'Active Shift',
          };
          setFieldActivities((prev) => [newShiftEvent, ...prev]);
        }
        if (startTerritory?.trim()) {
          const trimmed = startTerritory.trim();
          setUserRecentRoutes((prev) => {
            const filtered = prev.filter((r) => r.toLowerCase() !== trimmed.toLowerCase());
            return [trimmed, ...filtered].slice(0, 4);
          });
        }
      }
    });
  };

  const handlePauseShift = () => {
    if (!activeShift) return;
    const nowIso = new Date().toISOString();
    setActiveShift((prev: any) => ({
      ...prev,
      status: 'paused',
      paused_at: nowIso,
    }));
    startShiftTransition(async () => {
      const res = await pauseShift(activeShift.id);
      if (res?.shift) {
        setActiveShift(res.shift);
      }
    });
  };

  const handleResumeShift = () => {
    if (!activeShift) return;
    const now = Date.now();
    let additionalPaused = 0;
    if (activeShift.paused_at) {
      const pausedMs = new Date(activeShift.paused_at).getTime();
      additionalPaused = Math.max(0, Math.floor((now - pausedMs) / 1000));
    }
    const currentTotalPaused = Number(activeShift.total_paused_seconds) || 0;
    const newTotalPaused = currentTotalPaused + additionalPaused;

    setActiveShift((prev: any) => ({
      ...prev,
      status: 'active',
      paused_at: null,
      total_paused_seconds: newTotalPaused,
    }));

    startShiftTransition(async () => {
      const res = await resumeShift(activeShift.id);
      if (res?.shift) {
        setActiveShift(res.shift);
      }
    });
  };

  const handleEndShiftSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShiftError('');
    if (!activeShift) return;

    startShiftTransition(async () => {
      let loc = endLoc;
      if (!loc && typeof window !== 'undefined' && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 3000,
              maximumAge: 30000,
            });
          });
          loc = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
          setEndLoc(loc);
        } catch (e) {
          console.warn('Silent End GPS fallback:', e);
        }
      }

      const formData = new FormData();
      formData.append('shift_id', activeShift.id);
      formData.append('odometer_end', endOdo);
      formData.append('cash_deposited', cashDeposited);
      formData.append('end_location', loc || '');
      formData.append('notes', endNotes);

      const res = await endShift(formData);
      if (res?.error) {
        setShiftError(res.error);
      } else {
        setIsEndModalOpen(false);
        if (res?.shift) {
          setTodayCompletedShift(res.shift);
        }
        if (activeShift) {
          const endShiftEvent = {
            id: `shift-end-${activeShift.id}`,
            type: 'shift_end',
            timestamp: new Date().toISOString(),
            timeFormatted: new Date()
              .toLocaleTimeString('en-US', {
                timeZone: 'Asia/Kolkata',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
              })
              .toLowerCase(),
            dateKey: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
            title: 'Shift Concluded',
            subtitle: `Distance: ${Math.max(0, (parseFloat(endOdo) || 0) - (activeShift.odometer_start || 0))} km • Cash Deposited: ₹${(parseFloat(cashDeposited) || 0).toLocaleString('en-IN')}`,
            userName: stats.userName,
            userMonogram: (stats.userName || 'FS').slice(0, 2).toUpperCase(),
            badge: 'Completed',
          };
          setFieldActivities((prev) => [endShiftEvent, ...prev]);
        }
        if (activeShift?.territory?.trim()) {
          const trimmed = activeShift.territory.trim();
          setUserRecentRoutes((prev) => {
            const filtered = prev.filter((r) => r.toLowerCase() !== trimmed.toLowerCase());
            return [trimmed, ...filtered].slice(0, 4);
          });
        }
        setActiveShift(null);
        setEndOdo('');
        setCashDeposited('');
        setEndNotes('');
      }
    });
  };

  // Accordion state
  const [openAccordion, setOpenAccordion] = useState<string | null>('territory');
  const toggleAccordion = (id: string) => {
    setOpenAccordion(openAccordion === id ? null : id);
  };

  // Territory Distribution Carousel state
  const [territoryPage, setTerritoryPage] = useState(0);
  const [isTerritoryPaused, setIsTerritoryPaused] = useState(false);
  const totalTerritoryPages = Math.max(1, Math.ceil(territories.length / 5));

  useEffect(() => {
    if (isTerritoryPaused || openAccordion !== 'territory' || totalTerritoryPages <= 1) return;
    const timer = setInterval(() => {
      setTerritoryPage((prev) => (prev + 1) % totalTerritoryPages);
    }, 4000);
    return () => clearInterval(timer);
  }, [isTerritoryPaused, openAccordion, totalTerritoryPages]);

  useEffect(() => {
    if (territoryPage >= totalTerritoryPages) {
      setTerritoryPage(0);
    }
  }, [totalTerritoryPages, territoryPage]);

  // Active Field Devices Carousel state
  const DEVICES_PER_PAGE = 3;
  const [devicePage, setDevicePage] = useState(0);
  const [isDevicePaused, setIsDevicePaused] = useState(false);
  const totalDevicePages = Math.max(1, Math.ceil(displayDevices.length / DEVICES_PER_PAGE));

  useEffect(() => {
    if (isDevicePaused || openAccordion !== 'devices' || totalDevicePages <= 1) return;
    const timer = setInterval(() => {
      setDevicePage((prev) => (prev + 1) % totalDevicePages);
    }, 4000);
    return () => clearInterval(timer);
  }, [isDevicePaused, openAccordion, totalDevicePages]);

  useEffect(() => {
    if (devicePage >= totalDevicePages) {
      setDevicePage(0);
    }
  }, [totalDevicePages, devicePage]);

  // Dynamic Weekly Operations Timeline
  const getTodayDateKey = () => {
    const now = new Date();
    return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  };

  const [selectedDateKey, setSelectedDateKey] = useState<string>(getTodayDateKey);

  const weekDays = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.getFullYear(), now.getMonth(), diffToMonday);

    const days: { dateKey: string; dayName: string; dayNum: number; isToday: boolean }[] = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      const dateKey = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNum = d.getDate();
      const isToday = dateKey === getTodayDateKey();
      days.push({ dateKey, dayName, dayNum, isToday });
    }
    return days;
  }, []);

  const currentMonthYear = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, []);

  const dayActivities = useMemo(() => {
    return fieldActivities.filter((a) => a.dateKey === selectedDateKey);
  }, [fieldActivities, selectedDateKey]);

  // Automated Operational Priorities calculated dynamically from live shift and milestone targets
  const tasks = useMemo<DailyPriorityItem[]>(() => {
    const currentShift = activeShift || todayCompletedShift;
    const isShiftActive = activeShift && (activeShift.status === 'active' || activeShift.status === 'paused');
    const isShiftCompleted = currentShift && (currentShift.status === 'completed' || currentShift.status === 'ended');

    // 1. Start Shift Task
    let currentShiftElapsedSeconds = 0;
    if (timerSeconds > 0) {
      currentShiftElapsedSeconds = timerSeconds;
    } else if (currentShift) {
      const startMs = new Date(currentShift.start_time || currentShift.created_at).getTime();
      const endMs = isShiftCompleted
        ? new Date(currentShift.end_time || currentShift.updated_at).getTime()
        : Date.now();
      const pausedSec = Number(currentShift.total_paused_seconds || 0);
      currentShiftElapsedSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000) - pausedSec);
    }

    const elapsedHours = +(currentShiftElapsedSeconds / 3600).toFixed(1);
    const shiftHoursFloor = Math.floor(currentShiftElapsedSeconds / 3600);
    const shiftMinsFloor = Math.floor((currentShiftElapsedSeconds % 3600) / 60);
    const isShiftTimeMet = Boolean(currentShift && currentShiftElapsedSeconds >= dailyTargets.min_shift_hours * 3600);

    let shiftLabel = `Pending shift start (0 / ${dailyTargets.min_shift_hours}h)`;
    if (isShiftTimeMet) {
      shiftLabel = `${shiftHoursFloor}h ${shiftMinsFloor}m elapsed (≥${dailyTargets.min_shift_hours}h goal met)`;
    } else if (isShiftActive) {
      shiftLabel = `In Progress · ${shiftHoursFloor}h ${shiftMinsFloor}m / ${dailyTargets.min_shift_hours}h`;
    } else if (isShiftCompleted) {
      shiftLabel = `Shift Ended · ${shiftHoursFloor}h ${shiftMinsFloor}m / ${dailyTargets.min_shift_hours}h`;
    }

    // 2. Retailer Visits Task
    const baseVisits = Number(initialDailyTasks.find((t: any) => t.type === 'retailer')?.current || 0);
    const shiftVisits = Number(currentShift?.visits_count || 0);
    const totalVisits = Math.max(baseVisits, shiftVisits);
    const isVisitsMet = totalVisits >= dailyTargets.target_visits;

    // 3. Retailer Orders Task
    const serverOrders = Number(initialDailyTasks.find((t: any) => t.type === 'sales')?.current || 0);
    const shiftOrders = Number(currentShift?.orders_count || 0);
    const totalOrders = Math.max(serverOrders, shiftOrders);
    const isOrdersMet = totalOrders >= dailyTargets.target_orders;

    // 4. GPS Distance Task
    const serverGps = Number(initialDailyTasks.find((t: any) => t.type === 'gps')?.current || 0);
    const shiftGps = Number(currentShift?.distance_traveled_km || currentShift?.total_distance || 0);
    const totalDistance = Math.max(serverGps, shiftGps);
    const isGpsMet = totalDistance >= dailyTargets.target_distance_km;

    // 5. Last Cash Settlement Task
    const serverCollected = Number(
      initialDailyTasks.find((t: any) => t.type === 'cash')?.collected ??
      initialDailyTasks.find((t: any) => t.type === 'cash')?.target ??
      0
    );
    const shiftCollected = Number(currentShift?.cash_collected || 0);
    const totalCashCollected = Math.max(serverCollected, shiftCollected);
    const deposited = Number(currentShift?.cash_deposited || 0);

    let isCashMet = false;
    let cashLabel = '';

    if (isShiftCompleted) {
      if (totalCashCollected > 0) {
        isCashMet = deposited >= totalCashCollected;
        if (isCashMet) {
          cashLabel = `₹${deposited.toLocaleString('en-IN')} / ₹${totalCashCollected.toLocaleString('en-IN')} submitted (Fully settled)`;
        } else {
          const remaining = totalCashCollected - deposited;
          cashLabel = `₹${deposited.toLocaleString('en-IN')} / ₹${totalCashCollected.toLocaleString('en-IN')} submitted (₹${remaining.toLocaleString('en-IN')} pending)`;
        }
      } else {
        isCashMet = true;
        cashLabel = `₹0 / ₹0 (No cash collected today)`;
      }
    } else if (isShiftActive) {
      isCashMet = false;
      if (totalCashCollected > 0) {
        cashLabel = `₹0 / ₹${totalCashCollected.toLocaleString('en-IN')} (Pending shift end handover)`;
      } else {
        cashLabel = `₹0 collected · Shift in progress`;
      }
    } else {
      isCashMet = false;
      cashLabel =
        totalCashCollected > 0
          ? `₹0 / ₹${totalCashCollected.toLocaleString('en-IN')} (Pending shift start)`
          : `₹0 collected · Pending shift start`;
    }

    return [
      {
        id: 1,
        title: 'Start Shift',
        time: shiftLabel,
        done: Boolean(isShiftTimeMet),
        icon: 'navigation' as const,
        type: 'shift' as const,
        current: elapsedHours,
        target: dailyTargets.min_shift_hours,
      },
      {
        id: 2,
        title: 'Retailer Visit',
        time: `${totalVisits} / ${dailyTargets.target_visits} visits completed`,
        done: Boolean(isVisitsMet),
        icon: 'store' as const,
        type: 'retailer' as const,
        current: totalVisits,
        target: dailyTargets.target_visits,
      },
      {
        id: 3,
        title: 'Retailer Order',
        time: `${totalOrders} / ${dailyTargets.target_orders} orders booked`,
        done: Boolean(isOrdersMet),
        icon: 'package' as const,
        type: 'sales' as const,
        current: totalOrders,
        target: dailyTargets.target_orders,
      },
      {
        id: 4,
        title: 'GPS Distance',
        time: `${totalDistance} / ${dailyTargets.target_distance_km} km tracked`,
        done: Boolean(isGpsMet),
        icon: 'navigation' as const,
        type: 'gps' as const,
        current: totalDistance,
        target: dailyTargets.target_distance_km,
      },
      {
        id: 5,
        title: 'Last Cash Settlement',
        time: cashLabel,
        done: Boolean(isCashMet),
        icon: 'trending' as const,
        type: 'cash' as const,
        current: deposited,
        target: totalCashCollected,
        collected: totalCashCollected,
        deposited: deposited,
      },
    ];
  }, [timerSeconds, activeShift, todayCompletedShift, dailyTargets, initialDailyTasks]);

  const completedCount = tasks.filter((t) => t.done).length;

  const handleSaveTargets = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingTargets(true);
    setTargetsFeedback(null);

    try {
      const res = await saveDailyOperationalTargets(targetForm);
      if (res?.error) {
        setTargetsFeedback({ type: 'error', message: res.error });
      } else {
        setDailyTargets(targetForm);
        setTargetsFeedback({ type: 'success', message: 'Milestone thresholds updated successfully!' });
        setTimeout(() => {
          setIsTargetsModalOpen(false);
          setTargetsFeedback(null);
        }, 1200);
      }
    } catch (err: any) {
      setTargetsFeedback({ type: 'error', message: err.message || 'Failed to update targets' });
    } finally {
      setIsSavingTargets(false);
    }
  };

  // Live Operational Target metrics from real employee targets and sales data
  const overallTargetPct = useMemo(() => {
    if (
      targetProgress &&
      (targetProgress.sales?.target > 0 || targetProgress.reach?.target > 0 || targetProgress.orders?.target > 0)
    ) {
      const pcts = [targetProgress.sales?.pct, targetProgress.reach?.pct, targetProgress.orders?.pct].filter(
        (p) => typeof p === 'number'
      );
      if (pcts.length > 0) {
        return Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
      }
    }
    return 0;
  }, [targetProgress]);

  const salesTargetPct = targetProgress?.sales?.pct ?? 0;
  const reachTargetPct = targetProgress?.reach?.pct ?? 0;
  const ordersTargetPct = targetProgress?.orders?.pct ?? 0;

  return (
    <div className="space-y-6">
      {/* 1. HERO HEADER & KEY COUNTERS */}
      <DashboardHeroHeader stats={stats} targetProgress={targetProgress} />

      {/* 2. MAIN 3-COLUMN DASHBOARD GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">
        {/* COLUMN 1: Spotlight Card & Accordions */}
        <Column1StatsAndAccordions
          className={isManagement ? 'order-1 lg:order-none' : 'order-2 lg:order-none'}
          stats={stats}
          territories={territories}
          openAccordion={openAccordion}
          toggleAccordion={toggleAccordion}
          territoryPage={territoryPage}
          setTerritoryPage={setTerritoryPage}
          totalTerritoryPages={totalTerritoryPages}
          setIsTerritoryPaused={setIsTerritoryPaused}
          displayDevices={displayDevices}
          devicePage={devicePage}
          setDevicePage={setDevicePage}
          totalDevicePages={totalDevicePages}
          setIsDevicePaused={setIsDevicePaused}
        />

        {/* COLUMN 2: Shift Tracker, Weekly Progress & Field Operations Log */}
        <Column2FieldShiftTracker
          className={isManagement ? 'order-3 lg:order-none' : 'order-1 lg:order-none'}
          isManagement={isManagement}
          activeShift={activeShift}
          timerSeconds={timerSeconds}
          getTimerParts={getTimerParts}
          onStartShiftClick={() => {
            setShiftError('');
            setIsStartModalOpen(true);
          }}
          onPauseShift={handlePauseShift}
          onResumeShift={handleResumeShift}
          onEndShiftClick={() => {
            setShiftError('');
            setIsEndModalOpen(true);
          }}
          isShiftPending={isShiftPending}
          liveWeeklyProgress={liveWeeklyProgress}
          hoveredProgressDay={hoveredProgressDay}
          setHoveredProgressDay={setHoveredProgressDay}
          currentMonthYear={currentMonthYear}
          weekDays={weekDays}
          selectedDateKey={selectedDateKey}
          setSelectedDateKey={setSelectedDateKey}
          fieldActivities={fieldActivities}
          dayActivities={dayActivities}
        />

        {/* COLUMN 3: Operational Target Ruler & Daily Priorities Deck */}
        <Column3OperationsDeck
          className={isManagement ? 'order-2 lg:order-none' : 'order-3 lg:order-none'}
          targetProgress={targetProgress}
          overallTargetPct={overallTargetPct}
          salesTargetPct={salesTargetPct}
          reachTargetPct={reachTargetPct}
          ordersTargetPct={ordersTargetPct}
          tasks={tasks}
          completedCount={completedCount}
          canManageTargets={canManageTargets}
          onOpenTargetsModal={() => {
            setTargetForm(dailyTargets);
            setTargetsFeedback(null);
            setIsTargetsModalOpen(true);
          }}
        />
      </div>

      {/* 3. MODALS */}
      <StartShiftModal
        isOpen={isStartModalOpen}
        onClose={() => setIsStartModalOpen(false)}
        startTerritory={startTerritory}
        setStartTerritory={setStartTerritory}
        suggestedRoutes={suggestedRoutes}
        userRecentRoutes={userRecentRoutes}
        startOdo={startOdo}
        setStartOdo={setStartOdo}
        startLoc={startLoc}
        startLocStatus={startLocStatus}
        shiftError={shiftError}
        isShiftPending={isShiftPending}
        onSubmit={handleStartShiftSubmit}
      />

      <EndShiftModal
        isOpen={isEndModalOpen}
        onClose={() => setIsEndModalOpen(false)}
        activeShift={activeShift}
        endOdo={endOdo}
        setEndOdo={setEndOdo}
        cashDeposited={cashDeposited}
        setCashDeposited={setCashDeposited}
        endNotes={endNotes}
        setEndNotes={setEndNotes}
        endLoc={endLoc}
        endLocStatus={endLocStatus}
        shiftError={shiftError}
        isShiftPending={isShiftPending}
        onSubmit={handleEndShiftSubmit}
      />

      <TargetMilestonesModal
        isOpen={isTargetsModalOpen}
        onClose={() => setIsTargetsModalOpen(false)}
        canManageTargets={canManageTargets}
        targetForm={targetForm}
        setTargetForm={setTargetForm}
        isSavingTargets={isSavingTargets}
        targetsFeedback={targetsFeedback}
        onSubmit={handleSaveTargets}
      />
    </div>
  );
}
