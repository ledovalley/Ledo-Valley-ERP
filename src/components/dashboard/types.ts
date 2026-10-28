import type { DailyOperationalTargets, DailyPriorityItem } from '@/app/dashboard/actions';

export interface DashboardStats {
  staffCount: number;
  retailerCount: number;
  salesCount: number;
  totalRevenue: number;
  userId?: string;
  userName: string;
  userRole: string;
  userDistrict?: string;
}

export interface ActiveFieldDevice {
  id: string;
  shiftId: string;
  userId: string;
  userName: string;
  userRole: string;
  deviceName: string;
  territory: string;
  vehicleType: string;
  odometerStart: number;
  startLocation?: string;
  startTime: string;
  status: 'active' | 'paused' | 'completed' | 'ended';
  ordersCount: number;
  cashCollected: number;
}

export interface TerritoryDistributionItem {
  name: string;
  percentage: number;
}

export interface FieldActivityEvent {
  id: string;
  type: 'shift_start' | 'shift_end' | 'order_booked';
  timestamp: string;
  timeFormatted: string;
  dateKey: string;
  title: string;
  subtitle: string;
  userName: string;
  userMonogram: string;
  badge?: string;
  amount?: number;
  retailerName?: string;
}

export interface WeeklyProgressDay {
  dayLetter: string;
  fullDayName: string;
  dateKey: string;
  dateNum: number;
  isToday: boolean;
  isPresent: boolean;
  isAbsent: boolean;
  hours: number;
  distanceKm: number;
  salesAmount: number;
}

export interface WeeklyProgressData {
  totalHours: number;
  totalDistanceKm: number;
  totalSales: number;
  days: WeeklyProgressDay[];
}

export type { DailyOperationalTargets, DailyPriorityItem };
