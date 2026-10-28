'use client';

import { useState, useMemo } from 'react';
import {
  Award,
  Bike,
  Gauge,
  Wallet,
  IndianRupee,
  MapPin,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Package,
  Calendar,
  User,
  Search,
  Filter,
  Briefcase,
  Store,
  Coins,
  Utensils,
  PhoneCall,
  Moon,
  ChevronDown,
  ShieldCheck,
  ClipboardList,
  RotateCcw,
  X,
  SlidersHorizontal,
  UserCheck,
  Sparkles
} from 'lucide-react';
import Link from 'next/link';

interface LedgerClientProps {
  initialAudit: any;
  usersList?: any[];
  currentUserRole: string;
  currentUserId: string;
  currentUserName: string;
}

export default function LedgerClient({
  initialAudit,
  usersList = [],
  currentUserRole,
  currentUserId,
  currentUserName
}: LedgerClientProps) {
  // 1. Primary Filter States
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>(
    currentUserRole === 'admin' || currentUserRole === 'manager' ? 'all' : currentUserId
  );
  const [repSearchQuery, setRepSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [customDateFrom, setCustomDateFrom] = useState<string>('');
  const [customDateTo, setCustomDateTo] = useState<string>('');
  const [territoryFilter, setTerritoryFilter] = useState<string>('all');

  // 2. Table / Sub-Filter States
  const [shiftStatusFilter, setShiftStatusFilter] = useState<string>('all');
  const [cashFilter, setCashFilter] = useState<string>('all');
  const [visitTypeFilter, setVisitTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [activeTab, setActiveTab] = useState<'shifts' | 'visits'>('shifts');
  const [isRepSearchFocused, setIsRepSearchFocused] = useState<boolean>(false);

  // Helper: Get user details from usersList or fallback
  const getUserInfo = (userId?: string) => {
    if (!userId) {
      return {
        name: 'Field Team',
        role: 'staff',
        monogram: 'FT'
      };
    }
    if (userId === currentUserId && currentUserName) {
      const monogram = currentUserName.slice(0, 2).toUpperCase();
      return {
        name: currentUserName,
        role: currentUserRole || 'staff',
        monogram: monogram || 'U'
      };
    }
    const found = usersList.find((u: any) => u.id === userId);
    if (found) {
      const name =
        found.user_metadata?.name ||
        found.user_metadata?.full_name ||
        found.email?.split('@')[0] ||
        'Staff Member';
      const role = found.user_metadata?.role || 'staff';
      const monogram = name.slice(0, 2).toUpperCase();
      return {
        name,
        role,
        monogram
      };
    }
    return {
      name: 'Field Agent',
      role: 'staff',
      monogram: 'FA'
    };
  };

  // Date Range Checker
  const isDateInRange = (dateStr?: string, filter?: string, customFrom?: string, customTo?: string) => {
    if (!filter || filter === 'all') return true;
    if (!dateStr) return false;
    try {
      const itemDate = new Date(dateStr);
      if (isNaN(itemDate.getTime())) return true;

      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      if (filter === 'today') {
        return itemDate >= startOfToday && itemDate <= endOfToday;
      }

      if (filter === 'yesterday') {
        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);
        const endOfYesterday = new Date(startOfToday.getTime() - 1);
        return itemDate >= startOfYesterday && itemDate <= endOfYesterday;
      }

      if (filter === 'this_week') {
        const curr = new Date(now);
        const day = curr.getDay(); // 0 is Sunday
        const diff = curr.getDate() - day + (day === 0 ? -6 : 1);
        const startOfWeek = new Date(curr.setDate(diff));
        startOfWeek.setHours(0, 0, 0, 0);
        return itemDate >= startOfWeek;
      }

      if (filter === 'this_month') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return itemDate >= startOfMonth;
      }

      if (filter === 'custom') {
        if (customFrom) {
          const from = new Date(customFrom);
          from.setHours(0, 0, 0, 0);
          if (itemDate < from) return false;
        }
        if (customTo) {
          const to = new Date(customTo);
          to.setHours(23, 59, 59, 999);
          if (itemDate > to) return false;
        }
        return true;
      }

      return true;
    } catch {
      return true;
    }
  };

  // Dynamic unique territories collected from shifts and retailers
  const availableTerritories = useMemo(() => {
    const tSet = new Set<string>();
    (initialAudit.shifts || []).forEach((s: any) => {
      if (s.territory && s.territory.trim()) tSet.add(s.territory.trim());
    });
    (initialAudit.retailers || []).forEach((r: any) => {
      if (r.territory && r.territory.trim()) tSet.add(r.territory.trim());
    });
    return Array.from(tSet).sort();
  }, [initialAudit.shifts, initialAudit.retailers]);

  // Autocomplete suggestions for representative search
  const matchingUsers = useMemo(() => {
    if (!usersList || usersList.length === 0) return [];
    if (!repSearchQuery.trim()) return usersList;
    const q = repSearchQuery.toLowerCase();
    return usersList.filter((u: any) => {
      const name = u.user_metadata?.name || u.user_metadata?.full_name || u.email || '';
      const role = u.user_metadata?.role || '';
      return name.toLowerCase().includes(q) || role.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
    });
  }, [usersList, repSearchQuery]);

  // Selected user profile metadata (for wage/allowance display)
  const selectedUserProfile = useMemo(() => {
    if (selectedUserFilter !== 'all') {
      return usersList.find((u) => u.id === selectedUserFilter) || null;
    }
    if (repSearchQuery.trim()) {
      const exactMatch = usersList.find((u: any) => {
        const name = u.user_metadata?.name || u.user_metadata?.full_name || '';
        return name.toLowerCase() === repSearchQuery.trim().toLowerCase();
      });
      if (exactMatch) return exactMatch;
    }
    return null;
  }, [selectedUserFilter, repSearchQuery, usersList]);

  // Filtered shifts based on search, rep, role, date, territory, status, cash
  const filteredShifts = useMemo(() => {
    return (initialAudit.shifts || []).filter((s: any) => {
      const rep = getUserInfo(s.user_id);

      // Selected user ID
      if (selectedUserFilter !== 'all' && s.user_id !== selectedUserFilter) {
        return false;
      }

      // Rep Search (by name, monogram, role)
      if (repSearchQuery.trim()) {
        const q = repSearchQuery.toLowerCase();
        const matchName = rep.name.toLowerCase().includes(q);
        const matchMonogram = rep.monogram.toLowerCase().includes(q);
        const matchUserRole = rep.role.toLowerCase().includes(q);
        if (!matchName && !matchMonogram && !matchUserRole) return false;
      }

      // Role Filter
      if (roleFilter !== 'all') {
        if (rep.role.toLowerCase() !== roleFilter.toLowerCase()) return false;
      }

      // Date Range Filter
      if (!isDateInRange(s.start_time || s.created_at, dateFilter, customDateFrom, customDateTo)) {
        return false;
      }

      // Territory Filter
      if (territoryFilter !== 'all') {
        if (s.territory !== territoryFilter) return false;
      }

      // Shift Status Filter
      if (shiftStatusFilter !== 'all') {
        if (s.status !== shiftStatusFilter) return false;
      }

      // Cash Settlement Filter
      if (cashFilter !== 'all') {
        const discrepancy = Number(s.cash_discrepancy) || (Number(s.cash_collected) - Number(s.cash_deposited) || 0);
        if (cashFilter === 'pending' && discrepancy <= 0) return false;
        if (cashFilter === 'settled' && discrepancy > 0) return false;
      }

      // General Text Search (route, notes, vehicle, representative name)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchRoute = s.territory && s.territory.toLowerCase().includes(q);
        const matchNotes = s.notes && s.notes.toLowerCase().includes(q);
        const matchVehicle = s.vehicle_type && s.vehicle_type.toLowerCase().includes(q);
        const matchRep = rep.name.toLowerCase().includes(q);
        if (!matchRoute && !matchNotes && !matchVehicle && !matchRep) return false;
      }

      return true;
    });
  }, [
    initialAudit.shifts,
    selectedUserFilter,
    repSearchQuery,
    roleFilter,
    dateFilter,
    customDateFrom,
    customDateTo,
    territoryFilter,
    shiftStatusFilter,
    cashFilter,
    searchQuery,
    usersList
  ]);

  // Filtered visits
  const filteredVisits = useMemo(() => {
    return (initialAudit.visits || []).filter((v: any) => {
      const rep = getUserInfo(v.sales_person_id);
      const retailer = (initialAudit.retailers || []).find((r: any) => r.id === v.retailer_id);

      // Selected user ID
      if (selectedUserFilter !== 'all' && v.sales_person_id !== selectedUserFilter) {
        return false;
      }

      // Rep Search
      if (repSearchQuery.trim()) {
        const q = repSearchQuery.toLowerCase();
        const matchName = rep.name.toLowerCase().includes(q);
        const matchMonogram = rep.monogram.toLowerCase().includes(q);
        const matchUserRole = rep.role.toLowerCase().includes(q);
        if (!matchName && !matchMonogram && !matchUserRole) return false;
      }

      // Role Filter
      if (roleFilter !== 'all') {
        if (rep.role.toLowerCase() !== roleFilter.toLowerCase()) return false;
      }

      // Date Range Filter
      if (!isDateInRange(v.created_at, dateFilter, customDateFrom, customDateTo)) {
        return false;
      }

      // Territory Filter (matching retailer's territory)
      if (territoryFilter !== 'all') {
        if (retailer?.territory !== territoryFilter) return false;
      }

      // Visit Type Filter
      if (visitTypeFilter !== 'all') {
        if (v.visit_type !== visitTypeFilter) return false;
      }

      // General Text Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNotes = v.notes && v.notes.toLowerCase().includes(q);
        const matchReason = v.no_order_reason && v.no_order_reason.toLowerCase().includes(q);
        const matchShop = retailer?.shop_name && retailer.shop_name.toLowerCase().includes(q);
        const matchRep = rep.name.toLowerCase().includes(q);
        if (!matchNotes && !matchReason && !matchShop && !matchRep) return false;
      }

      return true;
    });
  }, [
    initialAudit.visits,
    initialAudit.retailers,
    selectedUserFilter,
    repSearchQuery,
    roleFilter,
    dateFilter,
    customDateFrom,
    customDateTo,
    territoryFilter,
    visitTypeFilter,
    searchQuery,
    usersList
  ]);

  // Filtered sales for dynamic metrics calculation
  const filteredSales = useMemo(() => {
    return (initialAudit.sales || []).filter((s: any) => {
      const rep = getUserInfo(s.sales_person_id);
      const retailer = (initialAudit.retailers || []).find((r: any) => r.id === s.retailer_id);

      if (selectedUserFilter !== 'all' && s.sales_person_id !== selectedUserFilter) {
        return false;
      }
      if (repSearchQuery.trim()) {
        const q = repSearchQuery.toLowerCase();
        const matchName = rep.name.toLowerCase().includes(q);
        if (!matchName) return false;
      }
      if (roleFilter !== 'all') {
        if (rep.role.toLowerCase() !== roleFilter.toLowerCase()) return false;
      }
      if (!isDateInRange(s.created_at || s.date, dateFilter, customDateFrom, customDateTo)) {
        return false;
      }
      if (territoryFilter !== 'all') {
        if (retailer?.territory !== territoryFilter) return false;
      }

      return true;
    });
  }, [
    initialAudit.sales,
    initialAudit.retailers,
    selectedUserFilter,
    repSearchQuery,
    roleFilter,
    dateFilter,
    customDateFrom,
    customDateTo,
    territoryFilter,
    usersList
  ]);

  // Dynamic metrics based on active filters
  const metrics = useMemo(() => {
    const shifts = filteredShifts;
    const sales = filteredSales;
    const visits = filteredVisits;

    const totalKmDriven = shifts.reduce((acc: number, curr: any) => acc + (Number(curr.total_distance) || 0), 0);
    const totalOrdersCount = sales.length;
    const totalRevenue = sales.reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);
    const totalCashCollected = sales.reduce((acc: number, curr: any) => acc + (Number(curr.cash_amount) || 0), 0);
    const totalOnlineCollected = sales.reduce((acc: number, curr: any) => acc + (Number(curr.online_amount) || 0), 0);
    const totalMarketDue = sales.reduce((acc: number, curr: any) => acc + (Number(curr.due_amount) || 0), 0);
    const totalCashDeposited = shifts.reduce((acc: number, curr: any) => acc + (Number(curr.cash_deposited) || 0), 0);
    const inHandCashBalance = Math.max(0, totalCashCollected - totalCashDeposited);

    const totalVisitsCount = visits.length;
    const noOrderVisitsCount = visits.filter((v: any) => v.visit_type === 'no_order').length;
    const orderVisitsCount = visits.filter((v: any) => v.visit_type === 'order').length;

    return {
      totalKmDriven,
      totalOrdersCount,
      totalRevenue,
      totalCashCollected,
      totalOnlineCollected,
      totalMarketDue,
      totalCashDeposited,
      inHandCashBalance,
      totalVisitsCount,
      noOrderVisitsCount,
      orderVisitsCount
    };
  }, [filteredShifts, filteredSales, filteredVisits]);

  // Is any filter currently applied?
  const isAnyFilterActive = useMemo(() => {
    const defaultUser = currentUserRole === 'admin' || currentUserRole === 'manager' ? 'all' : currentUserId;
    return (
      selectedUserFilter !== defaultUser ||
      repSearchQuery.trim() !== '' ||
      roleFilter !== 'all' ||
      dateFilter !== 'all' ||
      territoryFilter !== 'all' ||
      shiftStatusFilter !== 'all' ||
      cashFilter !== 'all' ||
      visitTypeFilter !== 'all' ||
      searchQuery.trim() !== '' ||
      customDateFrom !== '' ||
      customDateTo !== ''
    );
  }, [
    selectedUserFilter,
    currentUserRole,
    currentUserId,
    repSearchQuery,
    roleFilter,
    dateFilter,
    territoryFilter,
    shiftStatusFilter,
    cashFilter,
    visitTypeFilter,
    searchQuery,
    customDateFrom,
    customDateTo
  ]);

  // Reset all filters in one click
  const resetAllFilters = () => {
    setSelectedUserFilter(currentUserRole === 'admin' || currentUserRole === 'manager' ? 'all' : currentUserId);
    setRepSearchQuery('');
    setRoleFilter('all');
    setDateFilter('all');
    setCustomDateFrom('');
    setCustomDateTo('');
    setTerritoryFilter('all');
    setShiftStatusFilter('all');
    setCashFilter('all');
    setVisitTypeFilter('all');
    setSearchQuery('');
  };

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return 'N/A';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  const getRetailerName = (retailerId: string) => {
    const r = (initialAudit.retailers || []).find((ret: any) => ret.id === retailerId);
    return r ? `${r.shop_name} (${r.name})` : 'Registered Retailer';
  };

  return (
    <div className="space-y-6">
      
      {/* 1. HERO HEADER WITH AUDIT SCOPE BADGE */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-1">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#0D4728] text-[#FFF9CD] flex items-center justify-center shadow-xs">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-light text-slate-900 tracking-tight">
                Field Performance & <span className="font-semibold text-[#0D4728]">Payout Ledger</span>
              </h1>
              <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
                Audit odometer logs, retailer visits, cash in-hand balance & compensation
              </p>
            </div>
          </div>
        </div>

        {/* Scope Pill Badge */}
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white border border-slate-200/90 rounded-full text-xs font-semibold text-slate-700 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              Scope: {currentUserRole === 'admin' || currentUserRole === 'manager'
                ? (selectedUserFilter === 'all' && !repSearchQuery ? 'Organization Wide (All Team)' : (repSearchQuery || getUserInfo(selectedUserFilter).name))
                : `Personal Activity (${currentUserName})`}
            </span>
          </div>
        </div>
      </div>

      {/* 2. ADVANCED LEDGER FILTERS & SEARCH CONTROL DECK */}
      <div className="bg-white rounded-[28px] p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
        
        {/* Top Controls Grid */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${currentUserRole === 'admin' || currentUserRole === 'manager' ? 'lg:grid-cols-4' : 'lg:grid-cols-2'} gap-3 sm:gap-4`}>
          
          {/* Admin & Manager Only: Representative Search & Role Filter */}
          {(currentUserRole === 'admin' || currentUserRole === 'manager') && (
            <>
              {/* A. Search Representative by Name */}
              <div className="relative">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-[#0D4728]" />
                  <span>Search Representative</span>
                </label>
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={repSearchQuery}
                    onChange={(e) => {
                      setRepSearchQuery(e.target.value);
                      if (selectedUserFilter !== 'all') setSelectedUserFilter('all');
                    }}
                    onFocus={() => setIsRepSearchFocused(true)}
                    placeholder="Type rep name (e.g. Monish)..."
                    className="w-full bg-slate-50 border border-slate-200/90 rounded-full py-2.5 pl-10 pr-9 text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:bg-white transition-all"
                  />
                  {repSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setRepSearchQuery('');
                        setSelectedUserFilter('all');
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200/80 hover:bg-slate-300 text-slate-600 flex items-center justify-center transition-colors text-xs"
                      title="Clear representative search"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Quick Autocomplete Suggestions Dropdown */}
                {isRepSearchFocused && matchingUsers.length > 0 && (
                  <div 
                    className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white rounded-2xl shadow-xl border border-slate-200 max-h-56 overflow-y-auto p-1.5 space-y-0.5 animate-in fade-in"
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                      <span>Team Representatives ({matchingUsers.length})</span>
                      <button
                        type="button"
                        onClick={() => setIsRepSearchFocused(false)}
                        className="text-slate-400 hover:text-slate-600 text-xs font-semibold"
                      >
                        Close
                      </button>
                    </div>
                    {matchingUsers.map((u: any) => {
                      const name = u.user_metadata?.name || u.user_metadata?.full_name || u.email?.split('@')[0];
                      const role = u.user_metadata?.role || 'staff';
                      const initials = name.slice(0, 2).toUpperCase();

                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            setSelectedUserFilter(u.id);
                            setRepSearchQuery(name);
                            setIsRepSearchFocused(false);
                          }}
                          className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors text-left group"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-[#0D4728]/10 text-[#0D4728] font-bold text-[11px] flex items-center justify-center shrink-0">
                              {initials}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-slate-900 group-hover:text-[#0D4728] transition-colors">{name}</p>
                              <p className="text-[10px] text-slate-400 truncate max-w-[150px]">{u.email}</p>
                            </div>
                          </div>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase tracking-wider">
                            {role}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* B. Filter by Role */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#0D4728]" />
                  <span>Role Filter</span>
                </label>
                <div className="relative">
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="w-full appearance-none bg-slate-50 border border-slate-200/90 rounded-full py-2.5 pl-4 pr-9 text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:bg-white transition-all cursor-pointer"
                  >
                    <option value="all">All Roles (Team-Wide)</option>
                    <option value="sales">Sales Representatives</option>
                    <option value="manager">Managers</option>
                    <option value="admin">Administrators</option>
                    <option value="staff">Field Staff / Employees</option>
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </>
          )}

          {/* C. Filter by Date / Period */}
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#0D4728]" />
              <span>Period & Date Range</span>
            </label>
            <div className="relative">
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full appearance-none bg-slate-50 border border-slate-200/90 rounded-full py-2.5 pl-4 pr-9 text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:bg-white transition-all cursor-pointer"
              >
                <option value="all">All Time (Lifetime History)</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="this_week">This Week</option>
                <option value="this_month">This Month</option>
                <option value="custom">Custom Date Range...</option>
              </select>
              <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* D. Filter by Route / Territory */}
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#0D4728]" />
              <span>Territory / Route</span>
            </label>
            <div className="relative">
              <select
                value={territoryFilter}
                onChange={(e) => setTerritoryFilter(e.target.value)}
                className="w-full appearance-none bg-slate-50 border border-slate-200/90 rounded-full py-2.5 pl-4 pr-9 text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:bg-white transition-all cursor-pointer"
              >
                <option value="all">All Routes & Territories</option>
                {availableTerritories.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

        </div>

        {/* Custom Date Pickers (visible when dateFilter === 'custom') */}
        {dateFilter === 'custom' && (
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex flex-wrap items-center gap-4 animate-in fade-in">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <Calendar className="w-4 h-4 text-[#0D4728]" />
              <span>From Date:</span>
              <input
                type="date"
                value={customDateFrom}
                onChange={(e) => setCustomDateFrom(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20"
              />
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <span>To Date:</span>
              <input
                type="date"
                value={customDateTo}
                onChange={(e) => setCustomDateTo(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20"
              />
            </div>
          </div>
        )}

        {/* Active Filters Summary Bar + Clear All Button */}
        {isAnyFilterActive && (
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-400 font-medium">Active Filters:</span>
              
              {/* Rep Chip */}
              {(repSearchQuery || selectedUserFilter !== 'all') && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-900 border border-emerald-200 font-semibold">
                  <User className="w-3 h-3 text-[#0D4728]" />
                  <span>Rep: {repSearchQuery || getUserInfo(selectedUserFilter).name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setRepSearchQuery('');
                      setSelectedUserFilter('all');
                    }}
                    className="hover:text-emerald-700 ml-0.5 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {/* Role Chip */}
              {roleFilter !== 'all' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-900 border border-emerald-200 font-semibold capitalize">
                  <ShieldCheck className="w-3 h-3 text-[#0D4728]" />
                  <span>Role: {roleFilter}</span>
                  <button type="button" onClick={() => setRoleFilter('all')} className="hover:text-emerald-700 ml-0.5 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {/* Date Chip */}
              {dateFilter !== 'all' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-900 border border-emerald-200 font-semibold capitalize">
                  <Calendar className="w-3 h-3 text-[#0D4728]" />
                  <span>{dateFilter.replace('_', ' ')}</span>
                  <button type="button" onClick={() => setDateFilter('all')} className="hover:text-emerald-700 ml-0.5 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {/* Territory Chip */}
              {territoryFilter !== 'all' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-900 border border-emerald-200 font-semibold">
                  <MapPin className="w-3 h-3 text-[#0D4728]" />
                  <span>Route: {territoryFilter}</span>
                  <button type="button" onClick={() => setTerritoryFilter('all')} className="hover:text-emerald-700 ml-0.5 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {/* Contextual Sub-filter Chips */}
              {shiftStatusFilter !== 'all' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200 font-semibold capitalize">
                  <span>Status: {shiftStatusFilter}</span>
                  <button type="button" onClick={() => setShiftStatusFilter('all')} className="hover:text-slate-600 ml-0.5 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {cashFilter !== 'all' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200 font-semibold">
                  <span>Cash: {cashFilter === 'pending' ? 'In-Hand Pending' : 'Settled in Full'}</span>
                  <button type="button" onClick={() => setCashFilter('all')} className="hover:text-slate-600 ml-0.5 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {visitTypeFilter !== 'all' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200 font-semibold">
                  <span>Visit: {visitTypeFilter === 'order' ? 'Orders Placed' : 'No Order Visits'}</span>
                  <button type="button" onClick={() => setVisitTypeFilter('all')} className="hover:text-slate-600 ml-0.5 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {searchQuery && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200 font-semibold">
                  <span>Search: &quot;{searchQuery}&quot;</span>
                  <button type="button" onClick={() => setSearchQuery('')} className="hover:text-slate-600 ml-0.5 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={resetAllFilters}
              className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition-colors border border-rose-200/80 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset All Filters</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. COMPENSATION & ALLOWANCE DETAILS CARD (when a specific staff member is selected/searched) */}
      {selectedUserProfile && (
        <div className="p-5 sm:p-6 bg-gradient-to-r from-emerald-900 to-[#0D4728] text-[#FFF9CD] rounded-[28px] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5 animate-in fade-in">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-white font-bold text-lg border border-white/20 shrink-0">
              {(selectedUserProfile.user_metadata?.name || selectedUserProfile.email || 'U').charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white tracking-tight">
                  {selectedUserProfile.user_metadata?.name || 'Staff Member'}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[11px] font-semibold uppercase tracking-wider">
                  {selectedUserProfile.user_metadata?.role || 'staff'}
                </span>
              </div>
              <p className="text-xs text-emerald-200/80 mt-0.5">{selectedUserProfile.email}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 sm:gap-6 border-t md:border-t-0 pt-3 md:pt-0 border-white/15">
            <div>
              <span className="text-[10px] text-emerald-200 uppercase font-semibold">Wage Structure</span>
              <p className="text-sm font-bold text-white mt-0.5">
                {selectedUserProfile.user_metadata?.employment_type?.replace('_', ' ').toUpperCase() || 'MONTHLY SALARY'}
              </p>
              <p className="text-xs font-mono text-[#E4B84D] font-bold">
                ₹{Number(selectedUserProfile.user_metadata?.base_rate || 0).toLocaleString('en-IN')} base
              </p>
            </div>

            <div>
              <span className="text-[10px] text-emerald-200 uppercase font-semibold">Entitled Allowances</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {(selectedUserProfile.user_metadata?.allowances || []).length > 0 ? (
                  (selectedUserProfile.user_metadata?.allowances || []).map((a: any, idx: number) => {
                    const aId = typeof a === 'object' && a !== null ? a.id : a;
                    const aRate = typeof a === 'object' && a !== null && a.rate ? a.rate : null;
                    const isBike = aId === 'bike_allowance';
                    return (
                      <span key={idx} className="px-2.5 py-0.5 rounded-full bg-white/15 text-white text-[11px] font-medium border border-white/20">
                        {String(aId).replace(/_/g, ' ')}{aRate ? ` (₹${aRate}${isBike ? '/km' : ''})` : ''}
                      </span>
                    );
                  })
                ) : (
                  <span className="text-xs text-emerald-200/60 italic">No allowances configured</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. KEY COUNTERS ROW (Dynamically calculated based on active filter set) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Km Driven */}
        <div className="p-5 bg-white rounded-[24px] border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span>Distance Driven</span>
            <Bike className="w-4 h-4 text-[#0D4728]" />
          </div>
          <p className="text-2xl sm:text-3xl font-light text-slate-900 font-mono tracking-tight">
            {metrics.totalKmDriven.toFixed(1)} <span className="text-sm font-normal text-slate-500">km</span>
          </p>
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>{filteredShifts.length} logged shifts</span>
            {(() => {
              const bikeAllowance = (selectedUserProfile?.user_metadata?.allowances || []).find(
                (a: any) => (typeof a === 'object' && a !== null ? a.id : a) === 'bike_allowance'
              );
              const bikeRate = bikeAllowance && typeof bikeAllowance === 'object' ? Number(bikeAllowance.rate) || 0 : 0;
              if (bikeRate > 0 && metrics.totalKmDriven > 0) {
                const totalBikeClaim = Math.round(metrics.totalKmDriven * bikeRate);
                return (
                  <span className="text-[#0D4728] font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60 font-mono text-[11px]">
                    ₹{totalBikeClaim.toLocaleString('en-IN')} claim (@₹{bikeRate}/km)
                  </span>
                );
              }
              return null;
            })()}
          </div>
        </div>

        {/* Gross Revenue & Orders */}
        <div className="p-5 bg-white rounded-[24px] border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span>Orders Booked</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl sm:text-3xl font-light text-slate-900 font-mono tracking-tight">
            ₹{metrics.totalRevenue.toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-slate-500 font-medium">{metrics.totalOrdersCount} sales orders</p>
        </div>

        {/* Visits & Outlets */}
        <div className="p-5 bg-white rounded-[24px] border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span>Field Visits</span>
            <Store className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl sm:text-3xl font-light text-slate-900 tracking-tight">
            {metrics.totalVisitsCount}
          </p>
          <p className="text-xs text-slate-500 font-medium">
            {metrics.orderVisitsCount} orders • {metrics.noOrderVisitsCount} visits no order
          </p>
        </div>

        {/* Net In-Hand Balance */}
        <div className={`p-5 rounded-[24px] border shadow-xs space-y-1 ${
          metrics.inHandCashBalance > 0 
            ? 'bg-amber-50/70 border-amber-300' 
            : 'bg-emerald-50/70 border-emerald-300'
        }`}>
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
            <span className={metrics.inHandCashBalance > 0 ? 'text-amber-800' : 'text-emerald-800'}>
              Net Cash in Hand
            </span>
            <Wallet className={`w-4 h-4 ${metrics.inHandCashBalance > 0 ? 'text-amber-600' : 'text-emerald-600'}`} />
          </div>
          <p className={`text-2xl sm:text-3xl font-bold font-mono tracking-tight ${
            metrics.inHandCashBalance > 0 ? 'text-amber-900' : 'text-emerald-900'
          }`}>
            ₹{metrics.inHandCashBalance.toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-slate-600 font-medium">
            ₹{metrics.totalCashCollected.toLocaleString('en-IN')} collected • ₹{metrics.totalCashDeposited.toLocaleString('en-IN')} deposited
          </p>
        </div>
      </div>

      {/* 5. MAIN CARD: SHIFTS HISTORY & VISITS LOG */}
      <div className="bg-white border border-slate-200/80 rounded-[28px] overflow-hidden shadow-xs flex flex-col min-h-[500px]">
        
        {/* Command Bar: Tab Toggle + Contextual Sub-Filters + General Search */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-3.5">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-200/70 rounded-full text-xs font-semibold w-fit">
            <button
              onClick={() => setActiveTab('shifts')}
              className={`px-4 py-1.5 rounded-full transition-all cursor-pointer ${
                activeTab === 'shifts' 
                  ? 'bg-[#0D4728] text-[#FFF9CD] shadow-xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Field Shift Logs ({filteredShifts.length})
            </button>
            <button
              onClick={() => setActiveTab('visits')}
              className={`px-4 py-1.5 rounded-full transition-all cursor-pointer ${
                activeTab === 'visits' 
                  ? 'bg-[#0D4728] text-[#FFF9CD] shadow-xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Outlets Visits Audit ({filteredVisits.length})
            </button>
          </div>

          {/* Right side: Sub-filter dropdowns + Search Box */}
          <div className="flex flex-wrap items-center gap-2.5">
            {activeTab === 'shifts' ? (
              <>
                <select
                  value={shiftStatusFilter}
                  onChange={(e) => setShiftStatusFilter(e.target.value)}
                  className="bg-white border border-slate-200/90 rounded-full py-2 px-3 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 cursor-pointer shadow-2xs"
                >
                  <option value="all">All Shift Status</option>
                  <option value="completed">Completed Shifts</option>
                  <option value="active">Active (In-Progress)</option>
                </select>

                <select
                  value={cashFilter}
                  onChange={(e) => setCashFilter(e.target.value)}
                  className="bg-white border border-slate-200/90 rounded-full py-2 px-3 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 cursor-pointer shadow-2xs"
                >
                  <option value="all">All Cash Settlement</option>
                  <option value="pending">In-Hand Cash Pending (&gt; ₹0)</option>
                  <option value="settled">Settled in Full</option>
                </select>
              </>
            ) : (
              <select
                value={visitTypeFilter}
                onChange={(e) => setVisitTypeFilter(e.target.value)}
                className="bg-white border border-slate-200/90 rounded-full py-2 px-3 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 cursor-pointer shadow-2xs"
              >
                <option value="all">All Visit Outcomes</option>
                <option value="order">Orders Placed</option>
                <option value="no_order">No Order Visits</option>
              </select>
            )}

            {/* Keyword Search Box */}
            <div className="relative max-w-xs w-full sm:w-60">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notes, route..."
                className="w-full bg-white border border-slate-200 rounded-full py-2 pl-9 pr-8 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 shadow-2xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* TAB 1: SHIFTS HISTORY TABLE */}
        {activeTab === 'shifts' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100 font-semibold text-slate-500 uppercase tracking-wider text-xs">
                  <th className="py-4 px-6">Representative</th>
                  <th className="py-4 px-6">Shift Date & Time</th>
                  <th className="py-4 px-6">Route & Vehicle</th>
                  <th className="py-4 px-6">Odometer & Distance</th>
                  <th className="py-4 px-6">Outlets & Orders</th>
                  <th className="py-4 px-6">Cash Collected</th>
                  <th className="py-4 px-6">Cash Deposited</th>
                  <th className="py-4 px-6">Net In-Hand</th>
                  <th className="py-4 px-6 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredShifts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-20 text-center text-slate-400">
                      <Bike className="w-10 h-10 mx-auto mb-2 opacity-40 text-slate-400" />
                      <p className="text-sm font-semibold text-slate-700">No shifts match your filter criteria.</p>
                      <p className="text-xs text-slate-400 mt-1">Try broadening your search, changing the role, or clearing active filters.</p>
                      {isAnyFilterActive && (
                        <button
                          type="button"
                          onClick={resetAllFilters}
                          className="mt-3 px-4 py-1.5 rounded-full bg-[#0D4728]/10 hover:bg-[#0D4728]/20 text-[#0D4728] text-xs font-semibold transition-colors cursor-pointer"
                        >
                          Reset All Filters
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredShifts.map((s: any) => {
                    const discrepancy = Number(s.cash_discrepancy) || (Number(s.cash_collected) - Number(s.cash_deposited) || 0);
                    const rep = getUserInfo(s.user_id);

                    return (
                      <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                        {/* Representative (Clickable to isolate) */}
                        <td className="py-4 px-6">
                          <div
                            onClick={() => {
                              setSelectedUserFilter(s.user_id);
                              setRepSearchQuery(rep.name);
                            }}
                            className="flex items-center gap-2.5 cursor-pointer group"
                            title={`Click to filter by ${rep.name}`}
                          >
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#0D4728] to-[#1a5b36] text-[#FFF9CD] font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                              {rep.monogram}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 text-xs truncate max-w-[130px] group-hover:text-[#0D4728] transition-colors">{rep.name}</p>
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-semibold uppercase tracking-wider">
                                {rep.role}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Start Time */}
                        <td className="py-4 px-6">
                          <p className="font-semibold text-slate-900 text-xs">{formatDateTime(s.start_time)}</p>
                          {s.end_time && (
                            <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <Clock className="w-3 h-3" />
                              <span>Ended: {formatDateTime(s.end_time)}</span>
                            </p>
                          )}
                        </td>

                        {/* Route */}
                        <td className="py-4 px-6">
                          <div className="space-y-0.5">
                            <p className="font-bold text-slate-900 text-xs">{s.territory}</p>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-medium">
                              {s.vehicle_type || 'Bike'}
                            </span>
                          </div>
                        </td>

                        {/* Odometer */}
                        <td className="py-4 px-6">
                          <p className="font-mono font-bold text-slate-900 text-xs">
                            {Number(s.total_distance || 0).toFixed(1)} km
                          </p>
                          <p className="text-[11px] text-slate-400 font-mono">
                            {s.start_odometer || 0} → {s.end_odometer || s.start_odometer || 0}
                          </p>
                        </td>

                        {/* Orders & Visits */}
                        <td className="py-4 px-6">
                          <p className="font-bold text-slate-900 text-xs">{s.orders_count || 0} orders booked</p>
                          <p className="text-[11px] text-slate-500">{s.visits_count || 0} visits verified</p>
                        </td>

                        {/* Cash Collected */}
                        <td className="py-4 px-6 font-mono font-bold text-slate-900 text-xs">
                          ₹{Number(s.cash_collected || 0).toLocaleString('en-IN')}
                        </td>

                        {/* Cash Deposited */}
                        <td className="py-4 px-6 font-mono font-semibold text-emerald-700 text-xs">
                          ₹{Number(s.cash_deposited || 0).toLocaleString('en-IN')}
                        </td>

                        {/* In-Hand Discrepancy */}
                        <td className="py-4 px-6 font-mono font-bold text-xs">
                          {discrepancy > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-200">
                              <Clock className="w-3 h-3 text-amber-600" />
                              <span>₹{discrepancy.toLocaleString('en-IN')} in-hand</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[11px] font-medium">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Settled</span>
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-4 px-6 text-right">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
                            s.status === 'completed' 
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}>
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 2: VISITS AUDIT TABLE */}
        {activeTab === 'visits' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100 font-semibold text-slate-500 uppercase tracking-wider text-xs">
                  <th className="py-4 px-6">Visit Time</th>
                  <th className="py-4 px-6">Field Agent</th>
                  <th className="py-4 px-6">Retailer Shop</th>
                  <th className="py-4 px-6">Outcome / Reason</th>
                  <th className="py-4 px-6">Visit Notes</th>
                  <th className="py-4 px-6 text-right">GPS Audit Tag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredVisits.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-20 text-center text-slate-400">
                      <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-40 text-slate-400" />
                      <p className="text-sm font-semibold text-slate-700">No field visits match your filter criteria.</p>
                      <p className="text-xs text-slate-400 mt-1">Try broadening your search, changing the role, or clearing active filters.</p>
                      {isAnyFilterActive && (
                        <button
                          type="button"
                          onClick={resetAllFilters}
                          className="mt-3 px-4 py-1.5 rounded-full bg-[#0D4728]/10 hover:bg-[#0D4728]/20 text-[#0D4728] text-xs font-semibold transition-colors cursor-pointer"
                        >
                          Reset All Filters
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredVisits.map((v: any) => {
                    const rep = getUserInfo(v.sales_person_id);

                    return (
                      <tr key={v.id} className="hover:bg-slate-50/60 transition-colors">
                        {/* Time */}
                        <td className="py-4 px-6">
                          <p className="font-semibold text-slate-900 text-xs">{formatDateTime(v.created_at)}</p>
                        </td>

                        {/* Field Agent (Clickable to isolate) */}
                        <td className="py-4 px-6">
                          <div
                            onClick={() => {
                              setSelectedUserFilter(v.sales_person_id);
                              setRepSearchQuery(rep.name);
                            }}
                            className="flex items-center gap-2 cursor-pointer group"
                            title={`Click to filter by ${rep.name}`}
                          >
                            <div className="w-7 h-7 rounded-full bg-slate-800 text-white font-bold text-[10px] flex items-center justify-center shrink-0 group-hover:bg-[#0D4728] transition-colors">
                              {rep.monogram}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-900 truncate max-w-[120px] group-hover:text-[#0D4728] transition-colors">{rep.name}</p>
                              <span className="text-[9px] text-slate-400 capitalize">{rep.role}</span>
                            </div>
                          </div>
                        </td>

                        {/* Retailer */}
                        <td className="py-4 px-6 font-semibold text-slate-900 text-xs">
                          {getRetailerName(v.retailer_id)}
                        </td>

                        {/* Outcome */}
                        <td className="py-4 px-6">
                          {v.visit_type === 'order' ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Order Placed</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-200 text-xs font-semibold">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                              <span>No Order: {v.no_order_reason || 'Other'}</span>
                            </span>
                          )}
                        </td>

                        {/* Notes */}
                        <td className="py-4 px-6 text-xs text-slate-600 max-w-xs truncate">
                          {v.notes || 'No notes added'}
                        </td>

                        {/* GPS */}
                        <td className="py-4 px-6 text-right">
                          {v.geo_location ? (
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                              <MapPin className="w-3 h-3 text-[#0D4728]" />
                              <span>{v.geo_location}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">No GPS Tag</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

      </div>

    </div>
  );
}
