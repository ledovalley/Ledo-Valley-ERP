'use client';

import { useState, useTransition, useMemo } from 'react';
import {
  Package,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Layers,
  Tag,
  Info,
  Sparkles,
  ArrowRight,
  Edit2,
  X,
  Target,
  Users,
  Search,
  Filter,
  MapPin,
  Calendar,
  Save,
  CheckSquare,
  Square,
  TrendingUp,
  ShoppingBag,
  DollarSign,
  Store,
  Check,
  RefreshCw,
  SlidersHorizontal,
  ChevronRight
} from 'lucide-react';
import {
  createProduct,
  updateProduct,
  toggleProductStatus,
  deleteProduct,
  fetchTargetsForMonth,
  saveSingleTarget,
  saveBulkTargets,
  EligibleEmployee,
  EmployeeTarget
} from './actions';
import { ASSAM_DISTRICTS } from '@/utils/districts';

interface SettingsClientProps {
  products: any[];
  eligibleEmployees?: EligibleEmployee[];
  initialTargets?: EmployeeTarget[];
  initialMonth?: string;
  userRole: string;
  userName: string;
  userEmail: string;
}

export default function SettingsClient({
  products,
  eligibleEmployees = [],
  initialTargets = [],
  initialMonth = new Date().toISOString().slice(0, 7),
  userRole,
  userName,
  userEmail
}: SettingsClientProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Active top-level navigation tab
  const [activeTab, setActiveTab] = useState<'targets' | 'products'>('targets');

  // -------------------------------------------------------------
  // SETUP TARGETS STATES
  // -------------------------------------------------------------
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [targets, setTargets] = useState<EmployeeTarget[]>(initialTargets);
  const [isLoadingMonth, setIsLoadingMonth] = useState(false);

  // Row-level target values (userId -> { sales, reach, orders, isDirty, isSaving })
  const initialRowValues = useMemo(() => {
    const map: Record<string, { sales: string; reach: string; orders: string }> = {};
    eligibleEmployees.forEach(emp => {
      const existing = initialTargets.find(t => t.user_id === emp.id);
      map[emp.id] = {
        sales: existing ? String(existing.sales_target) : '50000',
        reach: existing ? String(existing.retailer_reach_target) : '10',
        orders: existing ? String(existing.orders_target) : '20'
      };
    });
    return map;
  }, [eligibleEmployees, initialTargets]);

  const [rowValues, setRowValues] = useState<Record<string, { sales: string; reach: string; orders: string }>>(initialRowValues);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  // Bulk setup inputs
  const [bulkSales, setBulkSales] = useState('50000');
  const [bulkReach, setBulkReach] = useState('10');
  const [bulkOrders, setBulkOrders] = useState('20');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  // Filters for employee list
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [districtFilter, setDistrictFilter] = useState('all');

  // -------------------------------------------------------------
  // PRODUCTS FORM & MODAL STATES (Admin)
  // -------------------------------------------------------------
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('kg');
  const [description, setDescription] = useState('');

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editUnit, setEditUnit] = useState('kg');
  const [editDescription, setEditDescription] = useState('');
  const [editError, setEditError] = useState('');

  // -------------------------------------------------------------
  // AUTHORIZATION GUARD
  // -------------------------------------------------------------
  const isAuthorized = userRole === 'admin' || userRole === 'manager';
  if (!isAuthorized) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4">
        <div className="bg-white border border-amber-200/80 rounded-[32px] p-8 sm:p-12 shadow-sm text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-100">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-light text-slate-900 tracking-tight">
            Settings Access <span className="font-semibold text-amber-700">Restricted</span>
          </h2>
          <p className="text-slate-500 text-sm max-w-md mx-auto leading-relaxed">
            The target setups and system controls are restricted exclusively to Enterprise <strong>Administrators</strong> and <strong>Managers</strong>. Your account role is <strong className="text-slate-800 font-semibold">{userRole}</strong>.
          </p>
          <div className="pt-4">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
              <ShieldCheck className="w-4 h-4 text-[#0D4728]" />
              Role Required: Admin or Manager
            </span>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // FILTERING LOGIC
  // -------------------------------------------------------------
  const availableRoles = useMemo(() => {
    const set = new Set<string>();
    eligibleEmployees.forEach(e => {
      if (e.role) set.add(e.role.toLowerCase());
    });
    return Array.from(set);
  }, [eligibleEmployees]);

  const filteredEmployees = useMemo(() => {
    return eligibleEmployees.filter(emp => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        emp.name.toLowerCase().includes(q) ||
        emp.email.toLowerCase().includes(q) ||
        emp.district.toLowerCase().includes(q);

      const matchesRole =
        roleFilter === 'all' || emp.role.toLowerCase() === roleFilter.toLowerCase();

      const matchesDistrict =
        districtFilter === 'all' || emp.district.toLowerCase() === districtFilter.toLowerCase();

      return matchesSearch && matchesRole && matchesDistrict;
    });
  }, [eligibleEmployees, searchQuery, roleFilter, districtFilter]);

  // Aggregate stats for the selected month
  const targetAggregates = useMemo(() => {
    let totalSales = 0;
    let totalReach = 0;
    let totalOrders = 0;
    let configuredCount = 0;

    eligibleEmployees.forEach(emp => {
      const t = targets.find(item => item.user_id === emp.id);
      if (t) {
        totalSales += Number(t.sales_target) || 0;
        totalReach += Number(t.retailer_reach_target) || 0;
        totalOrders += Number(t.orders_target) || 0;
        configuredCount++;
      }
    });

    return {
      totalSales,
      totalReach,
      totalOrders,
      configuredCount,
      totalEmployees: eligibleEmployees.length
    };
  }, [eligibleEmployees, targets]);

  // -------------------------------------------------------------
  // MONTH CHANGE HANDLER
  // -------------------------------------------------------------
  const handleMonthChange = async (newMonth: string) => {
    setSelectedMonth(newMonth);
    setIsLoadingMonth(true);
    try {
      const monthTargets = await fetchTargetsForMonth(newMonth);
      setTargets(monthTargets);

      // Refresh row inputs
      const newMap: Record<string, { sales: string; reach: string; orders: string }> = {};
      eligibleEmployees.forEach(emp => {
        const existing = monthTargets.find(t => t.user_id === emp.id);
        newMap[emp.id] = {
          sales: existing ? String(existing.sales_target) : '50000',
          reach: existing ? String(existing.retailer_reach_target) : '10',
          orders: existing ? String(existing.orders_target) : '20'
        };
      });
      setRowValues(newMap);
    } catch (e: any) {
      setError(e.message || 'Failed to load targets for month');
    } finally {
      setIsLoadingMonth(false);
    }
  };

  // -------------------------------------------------------------
  // SELECTION HANDLERS
  // -------------------------------------------------------------
  const isAllFilteredSelected =
    filteredEmployees.length > 0 &&
    filteredEmployees.every(emp => selectedUserIds.includes(emp.id));

  const toggleSelectAllFiltered = () => {
    if (isAllFilteredSelected) {
      // Unselect filtered
      const filteredIds = new Set(filteredEmployees.map(e => e.id));
      setSelectedUserIds(prev => prev.filter(id => !filteredIds.has(id)));
    } else {
      // Select all filtered
      const set = new Set(selectedUserIds);
      filteredEmployees.forEach(e => set.add(e.id));
      setSelectedUserIds(Array.from(set));
    }
  };

  const toggleSelectUser = (id: string) => {
    setSelectedUserIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // -------------------------------------------------------------
  // SAVE HANDLERS (SINGLE & BULK)
  // -------------------------------------------------------------
  const handleSaveSingle = async (empId: string) => {
    const val = rowValues[empId] || { sales: '50000', reach: '10', orders: '20' };
    setSavingUserId(empId);
    setError('');
    setSuccessMsg('');

    try {
      const res = await saveSingleTarget(
        empId,
        selectedMonth,
        Number(val.sales) || 0,
        Number(val.reach) || 0,
        Number(val.orders) || 0
      );

      if (res.error) {
        setError(res.error);
      } else {
        const emp = eligibleEmployees.find(e => e.id === empId);
        setSuccessMsg(`Target for ${emp?.name || 'Employee'} saved successfully.`);
        if (res.target) {
          setTargets(prev => {
            const next = prev.filter(t => t.user_id !== empId);
            return [...next, res.target];
          });
        }
        setTimeout(() => setSuccessMsg(''), 4000);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to save target.');
    } finally {
      setSavingUserId(null);
    }
  };

  const handleApplyBulk = async () => {
    if (selectedUserIds.length === 0) {
      setError('Please select at least one employee from the list below.');
      return;
    }

    setIsBulkSaving(true);
    setError('');
    setSuccessMsg('');

    try {
      const salesNum = Number(bulkSales) || 0;
      const reachNum = Number(bulkReach) || 0;
      const ordersNum = Number(bulkOrders) || 0;

      const res = await saveBulkTargets(
        selectedUserIds,
        selectedMonth,
        salesNum,
        reachNum,
        ordersNum
      );

      if (res.error) {
        setError(res.error);
      } else {
        // Update local state
        setRowValues(prev => {
          const updated = { ...prev };
          selectedUserIds.forEach(id => {
            updated[id] = {
              sales: String(salesNum),
              reach: String(reachNum),
              orders: String(ordersNum)
            };
          });
          return updated;
        });

        // Refresh targets from server for accuracy
        const updatedTargets = await fetchTargetsForMonth(selectedMonth);
        setTargets(updatedTargets);

        setSuccessMsg(`Successfully applied targets to ${selectedUserIds.length} employee(s) for ${selectedMonth}.`);
        setTimeout(() => setSuccessMsg(''), 4000);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to apply bulk targets.');
    } finally {
      setIsBulkSaving(false);
    }
  };

  // -------------------------------------------------------------
  // PRODUCT CATALOG HANDLERS (Admin Only)
  // -------------------------------------------------------------
  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!name.trim()) {
      setError('Please provide a category or product name.');
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('category', category.trim() || name.trim());
      formData.append('unit', unit.trim());
      formData.append('description', description.trim());

      const res = await createProduct(formData);
      if (res?.error) {
        setError(res.error);
      } else {
        setName('');
        setCategory('');
        setDescription('');
        setUnit('kg');
        setSuccessMsg(`"${name}" successfully registered in the product catalog.`);
        setTimeout(() => setSuccessMsg(''), 4000);
      }
    });
  };

  const handleUpdateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    setEditError('');

    if (!editName.trim()) {
      setEditError('Product name is required.');
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append('name', editName.trim());
      formData.append('category', editCategory.trim() || editName.trim());
      formData.append('unit', editUnit.trim());
      formData.append('description', editDescription.trim());

      const res = await updateProduct(editId, formData);
      if (res?.error) {
        setEditError(res.error);
      } else {
        setIsEditModalOpen(false);
        setSuccessMsg(`"${editName}" updated successfully.`);
        setTimeout(() => setSuccessMsg(''), 4000);
      }
    });
  };

  const openEditModal = (p: any) => {
    setEditId(p.id);
    setEditName(p.name || '');
    setEditCategory(p.category || p.name || '');
    setEditUnit(p.unit || 'kg');
    setEditDescription(p.description || '');
    setEditError('');
    setIsEditModalOpen(true);
  };

  const handleToggle = (id: string, currentStatus: boolean) => {
    startTransition(async () => {
      await toggleProductStatus(id, currentStatus);
    });
  };

  const handleDelete = (id: string, prodName: string) => {
    if (confirm(`Are you sure you want to delete the product category "${prodName}"?`)) {
      startTransition(async () => {
        await deleteProduct(id);
      });
    }
  };

  // Formatted Month Title e.g. "October 2026"
  const formattedMonthTitle = useMemo(() => {
    try {
      const [year, month] = selectedMonth.split('-');
      const d = new Date(parseInt(year), parseInt(month) - 1, 1);
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } catch {
      return selectedMonth;
    }
  }, [selectedMonth]);

  return (
    <div className="space-y-7 pb-12">

      {/* 1. Header Bar with Tabs */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0D4728]/10 text-[#0D4728] text-xs font-semibold mb-2">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{userRole === 'admin' ? 'Administrator & Manager Controls' : 'Manager Operations Hub'}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-light text-slate-900 tracking-tight">
            Settings & <span className="font-semibold text-[#0D4728]">Target Operations</span>
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">
            Configure monthly sales targets, retailer outreach goals, and catalog settings.
          </p>
        </div>

        {/* Tab Switcher & User Monogram */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center p-1 bg-slate-100 rounded-full border border-slate-200 shadow-2xs">
            <button
              onClick={() => setActiveTab('targets')}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all ${
                activeTab === 'targets'
                  ? 'bg-[#0D4728] text-[#FFF9CD] shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Target className="w-3.5 h-3.5" />
              <span>Setup Targets</span>
            </button>

            <button
              onClick={() => {
                if (userRole === 'admin') {
                  setActiveTab('products');
                } else {
                  alert('Product Catalog configuration is restricted to Administrator accounts.');
                }
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all ${
                activeTab === 'products'
                  ? 'bg-[#0D4728] text-[#FFF9CD] shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              } ${userRole !== 'admin' ? 'opacity-60 cursor-not-allowed' : ''}`}
              title={userRole !== 'admin' ? 'Admin only' : 'Manage products'}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Product Catalog</span>
              {userRole !== 'admin' && (
                <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">Admin</span>
              )}
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2.5 bg-white border border-slate-200/80 rounded-full pl-1.5 py-1.5 pr-4 shadow-2xs">
            <div className="w-7 h-7 rounded-full bg-[#0D4728] text-[#FFF9CD] font-bold text-xs flex items-center justify-center">
              {userEmail.charAt(0).toUpperCase()}
            </div>
            <div className="text-xs">
              <p className="font-bold text-slate-900 leading-none">{userName}</p>
              <p className="text-[10px] text-slate-400 capitalize">{userRole}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm rounded-2xl font-medium flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <XCircle className="w-4.5 h-4.5 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="p-1 hover:bg-red-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm rounded-2xl font-medium flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4.5 h-4.5 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="p-1 hover:bg-emerald-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 1: SETUP TARGETS (Admin & Manager) */}
      {/* ============================================================= */}
      {activeTab === 'targets' && (
        <div className="space-y-6">

          {/* Month Selector & Target Summary Header Card */}
          <div className="bg-white border border-slate-200/80 rounded-[32px] p-6 sm:p-8 shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-slate-100 pb-6">
              <div>
                <span className="text-xs font-bold text-[#0D4728] uppercase tracking-wider">Target Cycle</span>
                <h2 className="text-2xl sm:text-3xl font-light text-slate-900 tracking-tight mt-0.5">
                  Monthly Performance Targets for <span className="font-semibold text-[#0D4728]">{formattedMonthTitle}</span>
                </h2>
                <p className="text-slate-500 text-xs sm:text-sm mt-1">
                  Targets can be set individually or in bulk for field reps and staff below the Manager level.
                </p>
              </div>

              {/* Month Selector Controls */}
              <div className="flex items-center gap-2.5 bg-slate-50 p-2 rounded-2xl border border-slate-200/80 w-fit shrink-0">
                <Calendar className="w-4 h-4 text-slate-500 ml-2" />
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => handleMonthChange(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728]"
                />
                <button
                  type="button"
                  onClick={() => handleMonthChange(new Date().toISOString().slice(0, 7))}
                  className="px-3 py-1.5 bg-[#0D4728]/10 hover:bg-[#0D4728]/20 text-[#0D4728] rounded-xl text-xs font-semibold transition-colors"
                >
                  Current Month
                </button>
              </div>
            </div>

            {/* Target Aggregate Metric Counters */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6">
              {/* Metric 1: Total Sales Target */}
              <div className="p-4.5 rounded-2xl bg-gradient-to-br from-emerald-50/70 to-emerald-100/30 border border-emerald-200/60">
                <div className="flex items-center justify-between text-emerald-800 mb-1">
                  <span className="text-xs font-semibold">Total Sales Pipeline</span>
                  <DollarSign className="w-4 h-4 text-emerald-700" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-[#0D4728]">
                  ₹{targetAggregates.totalSales.toLocaleString('en-IN')}
                </div>
                <p className="text-[11px] text-emerald-700/80 mt-0.5">Cumulative monthly goal</p>
              </div>

              {/* Metric 2: Total Retailer Reach */}
              <div className="p-4.5 rounded-2xl bg-gradient-to-br from-amber-50/70 to-amber-100/30 border border-amber-200/60">
                <div className="flex items-center justify-between text-amber-800 mb-1">
                  <span className="text-xs font-semibold">Total Retailer Reach</span>
                  <Store className="w-4 h-4 text-amber-700" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-amber-900">
                  {targetAggregates.totalReach.toLocaleString('en-IN')} <span className="text-xs font-medium text-amber-700">Outlets</span>
                </div>
                <p className="text-[11px] text-amber-700/80 mt-0.5">Store visit targets</p>
              </div>

              {/* Metric 3: Total Orders Target */}
              <div className="p-4.5 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/60 border border-slate-200/80">
                <div className="flex items-center justify-between text-slate-700 mb-1">
                  <span className="text-xs font-semibold">Total Orders Target</span>
                  <ShoppingBag className="w-4 h-4 text-slate-600" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-slate-900">
                  {targetAggregates.totalOrders.toLocaleString('en-IN')} <span className="text-xs font-medium text-slate-500">Orders</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">Booked orders target</p>
              </div>

              {/* Metric 4: Personnel Coverage */}
              <div className="p-4.5 rounded-2xl bg-gradient-to-br from-blue-50/70 to-blue-100/30 border border-blue-200/60">
                <div className="flex items-center justify-between text-blue-800 mb-1">
                  <span className="text-xs font-semibold">Coverage Status</span>
                  <Users className="w-4 h-4 text-blue-700" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-blue-950">
                  {targetAggregates.configuredCount} / {targetAggregates.totalEmployees}
                </div>
                <p className="text-[11px] text-blue-700/80 mt-0.5">Employees configured</p>
              </div>
            </div>
          </div>

          {/* BULK TARGET ALLOCATION CARD */}
          <div className="bg-gradient-to-br from-[#0D4728]/5 via-white to-amber-50/30 border border-[#0D4728]/20 rounded-[32px] p-6 sm:p-7 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#0D4728] text-[#FFF9CD] flex items-center justify-center shadow-xs">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Bulk Target Allocation</h3>
                  <p className="text-xs text-slate-500">
                    Apply identical target amounts across all selected employees simultaneously.
                  </p>
                </div>
              </div>

              <div className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-700 w-fit">
                Selected for Bulk: <strong className="text-[#0D4728]">{selectedUserIds.length}</strong> of {eligibleEmployees.length}
              </div>
            </div>

            {/* Bulk Inputs and Apply Button */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-1">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Sales Target (₹)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-xs">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={bulkSales}
                    onChange={(e) => setBulkSales(e.target.value)}
                    placeholder="50000"
                    className="w-full bg-white border border-slate-200 rounded-full py-2 pl-7 pr-3 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-amber-700" />
                  <span>Retailer Reach (Shops)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={bulkReach}
                  onChange={(e) => setBulkReach(e.target.value)}
                  placeholder="10"
                  className="w-full bg-white border border-slate-200 rounded-full py-2 px-3.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 text-slate-600" />
                  <span>Orders Target (Bookings)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={bulkOrders}
                  onChange={(e) => setBulkOrders(e.target.value)}
                  placeholder="20"
                  className="w-full bg-white border border-slate-200 rounded-full py-2 px-3.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728]"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleApplyBulk}
                  disabled={selectedUserIds.length === 0 || isBulkSaving}
                  className="w-full h-9.5 flex items-center justify-center gap-2 bg-[#0D4728] hover:bg-[#167a44] text-[#FFF9CD] rounded-full text-xs font-semibold transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isBulkSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Applying...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Apply to {selectedUserIds.length} Selected</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* FILTERING & SEARCH TOOLBAR */}
          <div className="bg-white border border-slate-200/80 rounded-[28px] p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">

              {/* Search Field */}
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search employee name, email or district..."
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-full py-2.5 pl-10 pr-4 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all"
                />
              </div>

              {/* Role-based Filter */}
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="bg-slate-50/70 border border-slate-200 rounded-full py-2 px-3 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728]"
                >
                  <option value="all">All Roles</option>
                  {availableRoles.map(r => (
                    <option key={r} value={r}>
                      Role: {r.charAt(0).toUpperCase() + r.slice(1)}
                    </option>
                  ))}
                </select>

                {/* District-based Filter (Assam Districts) */}
                <select
                  value={districtFilter}
                  onChange={(e) => setDistrictFilter(e.target.value)}
                  className="bg-slate-50/70 border border-slate-200 rounded-full py-2 px-3 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728]"
                >
                  <option value="all">All Assam Districts</option>
                  {ASSAM_DISTRICTS.map(d => (
                    <option key={d} value={d}>
                      {d} District
                    </option>
                  ))}
                </select>
              </div>

            </div>

            {/* Quick Selection Status Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={toggleSelectAllFiltered}
                  className="flex items-center gap-1.5 font-semibold text-slate-700 hover:text-[#0D4728] transition-colors"
                >
                  {isAllFilteredSelected ? (
                    <CheckSquare className="w-4 h-4 text-[#0D4728]" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                  <span>
                    {isAllFilteredSelected ? 'Deselect All Filtered' : 'Select All Filtered'} ({filteredEmployees.length})
                  </span>
                </button>

                {selectedUserIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedUserIds([])}
                    className="text-xs text-slate-400 hover:text-slate-600 underline"
                  >
                    Clear Selection
                  </button>
                )}
              </div>

              <span>
                Showing <strong>{filteredEmployees.length}</strong> of {eligibleEmployees.length} eligible personnel
              </span>
            </div>
          </div>

          {/* ELIGIBLE EMPLOYEES TABLE WITH INLINE TARGET INPUTS */}
          <div className="bg-white border border-slate-200/80 rounded-[32px] overflow-hidden shadow-xs">
            {isLoadingMonth ? (
              <div className="py-20 text-center text-slate-400 space-y-2">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#0D4728]" />
                <p className="text-xs font-medium text-slate-600">Loading targets for {formattedMonthTitle}...</p>
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="py-20 text-center text-slate-400 space-y-2">
                <Users className="w-10 h-10 mx-auto opacity-40" />
                <p className="text-sm font-semibold text-slate-600">No eligible employees found.</p>
                <p className="text-xs text-slate-400">
                  {eligibleEmployees.length === 0
                    ? 'No employees below the manager level exist in the system.'
                    : 'Try clearing your search or district/role filters.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60 text-slate-500 font-semibold text-xs uppercase tracking-wider">
                      <th className="py-3.5 px-4 w-12 text-center">
                        <input
                          type="checkbox"
                          checked={isAllFilteredSelected}
                          onChange={toggleSelectAllFiltered}
                          className="rounded border-slate-300 text-[#0D4728] focus:ring-[#0D4728] cursor-pointer"
                        />
                      </th>
                      <th className="py-3.5 px-4">Employee</th>
                      <th className="py-3.5 px-4">Role & District</th>
                      <th className="py-3.5 px-4">Sales Target (₹)</th>
                      <th className="py-3.5 px-4">Retailer Reach</th>
                      <th className="py-3.5 px-4">Orders Target</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredEmployees.map(emp => {
                      const isSelected = selectedUserIds.includes(emp.id);
                      const currentVal = rowValues[emp.id] || { sales: '50000', reach: '10', orders: '20' };
                      const isSaving = savingUserId === emp.id;
                      const hasExisting = targets.some(t => t.user_id === emp.id);

                      return (
                        <tr
                          key={emp.id}
                          className={`hover:bg-slate-50/60 transition-colors ${
                            isSelected ? 'bg-emerald-50/40' : ''
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="py-4 px-4 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectUser(emp.id)}
                              className="rounded border-slate-300 text-[#0D4728] focus:ring-[#0D4728] cursor-pointer"
                            />
                          </td>

                          {/* Employee Monogram & Name */}
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-[#0D4728]/10 text-[#0D4728] font-bold text-xs flex items-center justify-center shrink-0 border border-[#0D4728]/20">
                                {emp.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-900 leading-tight">
                                  {emp.name}
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5">
                                  {emp.email}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Role & District */}
                          <td className="py-4 px-4">
                            <div className="flex flex-col gap-1 items-start">
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 capitalize">
                                {emp.role}
                              </span>
                              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-[#0D4728]" />
                                <span>{emp.district || 'Unassigned'}</span>
                              </span>
                            </div>
                          </td>

                          {/* Sales Target Input */}
                          <td className="py-4 px-4">
                            <div className="relative w-32">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">₹</span>
                              <input
                                type="number"
                                min="0"
                                step="1000"
                                value={currentVal.sales}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setRowValues(prev => ({
                                    ...prev,
                                    [emp.id]: { ...(prev[emp.id] || currentVal), sales: val }
                                  }));
                                }}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 pl-6 pr-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728]"
                              />
                            </div>
                          </td>

                          {/* Retailer Reach Input */}
                          <td className="py-4 px-4">
                            <div className="w-24">
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={currentVal.reach}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setRowValues(prev => ({
                                    ...prev,
                                    [emp.id]: { ...(prev[emp.id] || currentVal), reach: val }
                                  }));
                                }}
                                placeholder="10"
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728]"
                              />
                            </div>
                          </td>

                          {/* Orders Target Input */}
                          <td className="py-4 px-4">
                            <div className="w-24">
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={currentVal.orders}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setRowValues(prev => ({
                                    ...prev,
                                    [emp.id]: { ...(prev[emp.id] || currentVal), orders: val }
                                  }));
                                }}
                                placeholder="20"
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728]"
                              />
                            </div>
                          </td>

                          {/* Actions: Save & Status */}
                          <td className="py-4 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {hasExisting ? (
                                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                  Configured
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                  Default
                                </span>
                              )}

                              <button
                                type="button"
                                onClick={() => handleSaveSingle(emp.id)}
                                disabled={isSaving}
                                className="h-8 px-3 rounded-full bg-[#0D4728] hover:bg-[#167a44] text-[#FFF9CD] text-xs font-semibold transition-all flex items-center gap-1 shadow-xs disabled:opacity-50"
                                title="Save target for this employee"
                              >
                                {isSaving ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <>
                                    <Save className="w-3.5 h-3.5" />
                                    <span>Save</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 2: PRODUCT CATALOG (Admin Only) */}
      {/* ============================================================= */}
      {activeTab === 'products' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left Column: Create Product Category Form */}
          <div className="bg-white border border-slate-200/80 rounded-[28px] p-6 sm:p-7 shadow-xs h-fit space-y-5">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="w-10 h-10 rounded-2xl bg-[#0D4728]/10 text-[#0D4728] flex items-center justify-center">
                <Plus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">New Product Category</h3>
                <p className="text-xs text-slate-500">Add categories like Tea, Sauces, Soya Chunks</p>
              </div>
            </div>

            <form onSubmit={handleCreateProduct} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span>Category / Product Name *</span>
                  <span className="text-[11px] text-slate-400 font-normal">e.g. Tea, Sauces, Soya Chunks</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Tea"
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-full py-2.5 px-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Default Measurement Unit</label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-full py-2.5 px-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all"
                >
                  <option value="kg">kg (Kilograms)</option>
                  <option value="tons">tons (Metric Tons)</option>
                  <option value="bags">bags / sacks</option>
                  <option value="cases">cases / cartons</option>
                  <option value="bottles">bottles / jars</option>
                  <option value="packets">packets / pouches</option>
                  <option value="units">units (Custom)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Description / Specifications</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief category summary (e.g. Bulk Assam CTC & Orthodox tea batches)"
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-2xl py-2.5 px-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all resize-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full h-11 flex items-center justify-center gap-2 bg-[#0D4728] hover:bg-[#167a44] text-[#FFF9CD] rounded-full text-sm font-semibold transition-all shadow-xs disabled:opacity-50"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Registering...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Create Product Category</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="pt-4 border-t border-slate-100 flex items-start gap-2.5 text-xs text-slate-500 leading-relaxed">
              <Info className="w-4 h-4 text-[#0D4728] shrink-0 mt-0.5" />
              <span>
                Products registered here become immediately selectable in the <strong>Log Order</strong> multi-product picker for all field agents.
              </span>
            </div>
          </div>

          {/* Right Column: Existing Product Categories List */}
          <div className="lg:col-span-2 bg-white border border-slate-200/80 rounded-[28px] p-6 sm:p-7 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Active Product Catalog</h3>
                <p className="text-xs text-slate-500">Categories available for field order logging</p>
              </div>
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700 w-fit">
                {products.length} registered categories
              </span>
            </div>

            {products.length === 0 ? (
              <div className="text-center py-16 text-slate-400 space-y-2">
                <Package className="w-10 h-10 mx-auto opacity-40" />
                <p className="text-sm font-semibold text-slate-600">No products configured yet.</p>
                <p className="text-xs text-slate-400">Use the form on the left to add categories.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {products.map(p => {
                  const initials = p.name ? p.name.slice(0, 2).toUpperCase() : 'PR';

                  return (
                    <div
                      key={p.id}
                      className="p-5 border border-slate-200/80 rounded-[24px] bg-gradient-to-b from-white to-slate-50/30 hover:border-[#0D4728]/40 hover:shadow-xs transition-all flex flex-col justify-between space-y-4 group"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0D4728] to-[#185c37] text-[#FFF9CD] font-bold text-xs flex items-center justify-center shadow-2xs">
                              {initials}
                            </div>
                            <div>
                              <h4 className="font-bold text-slate-900 text-base group-hover:text-[#0D4728] transition-colors leading-tight">
                                {p.name}
                              </h4>
                              <span className="text-[11px] font-semibold text-slate-500">
                                Unit: <strong className="text-slate-800">{p.unit || 'kg'}</strong>
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleToggle(p.id, p.is_active)}
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-all border ${
                              p.is_active
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                            }`}
                            title="Click to toggle status"
                          >
                            {p.is_active ? 'Active' : 'Inactive'}
                          </button>
                        </div>

                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed pt-2 border-t border-slate-100">
                          {p.description || 'No description provided.'}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                        <span className="flex items-center gap-1.5 font-medium">
                          <Layers className="w-3.5 h-3.5 text-[#0D4728]" />
                          <span>Category: {p.category || p.name}</span>
                        </span>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(p)}
                            className="p-1.5 text-slate-400 hover:text-[#0D4728] hover:bg-[#0D4728]/10 rounded-lg transition-colors"
                            title="Edit Product Category"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(p.id, p.name)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete Category"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. EDIT PRODUCT CATEGORY MODAL */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl border border-white/80 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#0D4728]/10 text-[#0D4728] flex items-center justify-center">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Edit Product Category</h3>
                  <p className="text-xs text-slate-500">Update category specifications and unit</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateProduct} className="p-6 space-y-4">
              {editError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-xs rounded-2xl font-medium">
                  {editError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Category / Product Name *</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Tea"
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-full py-2.5 px-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Default Measurement Unit</label>
                <select
                  value={editUnit}
                  onChange={(e) => setEditUnit(e.target.value)}
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-full py-2.5 px-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all"
                >
                  <option value="kg">kg (Kilograms)</option>
                  <option value="tons">tons (Metric Tons)</option>
                  <option value="bags">bags / sacks</option>
                  <option value="cases">cases / cartons</option>
                  <option value="bottles">bottles / jars</option>
                  <option value="packets">packets / pouches</option>
                  <option value="units">units (Custom)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Description / Specifications</label>
                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Category specifications"
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-2xl py-2.5 px-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all resize-none"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-full text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex items-center gap-2 bg-[#0D4728] hover:bg-[#167a44] text-[#FFF9CD] px-6 py-2.5 rounded-full text-sm font-semibold transition-all disabled:opacity-50 shadow-xs"
                >
                  {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
