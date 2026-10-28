'use client';

import { useState, useTransition, useMemo } from 'react';
import { createUser, updateUser, deleteUser } from './actions';
import {
  Plus,
  Edit2,
  Trash2,
  ShieldCheck,
  Mail,
  Key,
  Loader2,
  Sparkles,
  User,
  RefreshCw,
  Search,
  Users,
  Shield,
  Briefcase,
  UserCheck,
  X,
  Filter,
  CheckCircle2,
  Check,
  Bike,
  Utensils,
  DollarSign,
  PhoneCall,
  Moon,
  Coins,
  MapPin
} from 'lucide-react';
import { TableRowSkeleton } from '@/components/ui/Skeleton';
import { ASSAM_DISTRICTS } from '@/utils/districts';

type SupabaseUser = any;

const ALLOWANCE_OPTIONS = [
  { id: 'bike_allowance', label: 'Bike Allowance', icon: Bike, hint: 'Fuel & Maintenance (₹ / km driven)' },
  { id: 'food_da', label: 'Food Allowance / DA', icon: Utensils, hint: 'Daily field meal DA (₹ / day)' },
  { id: 'daily_wages_component', label: 'Daily Wages Component', icon: Coins, hint: 'Daily wage add-on (₹ / day)' },
  { id: 'mobile_recharge', label: 'Mobile Recharge', icon: PhoneCall, hint: 'Cellular calling plan (₹ / month)' }
];

const EMPLOYMENT_TYPES = [
  { id: 'monthly_salary', label: 'Fixed Monthly Salary', unit: '/ month' },
  { id: 'daily_wages', label: 'Fixed Daily Wages', unit: '/ day' },
  { id: 'weekly_wages', label: 'Fixed Weekly Wages', unit: '/ week' },
  { id: 'commission', label: 'Commission Only', unit: '% target' }
];

export default function UsersClient({
  users,
  currentUserRole
}: {
  users: SupabaseUser[],
  currentUserRole: string
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('all');
  const [selectedDistrictFilter, setSelectedDistrictFilter] = useState<string>('all');

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('sales');
  const [district, setDistrict] = useState('Tinsukia');
  const [districtSearch, setDistrictSearch] = useState('');
  const [employmentType, setEmploymentType] = useState('monthly_salary');
  const [baseRate, setBaseRate] = useState('');
  type AllowanceEntry = { id: string; rate: string | number };
  const [selectedAllowances, setSelectedAllowances] = useState<AllowanceEntry[]>([]);
  const [error, setError] = useState('');

  // Stats calculation
  const stats = useMemo(() => {
    const total = users.length;
    const admins = users.filter(u => u.user_metadata?.role === 'admin').length;
    const managers = users.filter(u => u.user_metadata?.role === 'manager').length;
    const sales = users.filter(u => u.user_metadata?.role === 'sales').length;
    return { total, admins, managers, sales };
  }, [users]);

  // Filtered users list
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const uName = (u.user_metadata?.name || '').toLowerCase();
      const uEmail = (u.email || '').toLowerCase();
      const uRole = (u.user_metadata?.role || 'staff').toLowerCase();
      const uDistrict = (u.user_metadata?.district || '').toLowerCase();
      const matchesSearch = uName.includes(searchTerm.toLowerCase()) || uEmail.includes(searchTerm.toLowerCase()) || uDistrict.includes(searchTerm.toLowerCase());
      const matchesRole = selectedRoleFilter === 'all' || uRole === selectedRoleFilter;
      const matchesDistrict = selectedDistrictFilter === 'all' || uDistrict === selectedDistrictFilter.toLowerCase();
      return matchesSearch && matchesRole && matchesDistrict;
    });
  }, [users, searchTerm, selectedRoleFilter, selectedDistrictFilter]);

  const toggleAllowance = (id: string) => {
    setSelectedAllowances(prev => {
      const exists = prev.some(a => a.id === id);
      if (exists) {
        return prev.filter(a => a.id !== id);
      } else {
        return [...prev, { id, rate: '' }];
      }
    });
  };

  const updateAllowanceRate = (id: string, rateVal: string) => {
    setSelectedAllowances(prev =>
      prev.map(a => (a.id === id ? { ...a, rate: rateVal } : a))
    );
  };

  const openCreateModal = () => {
    setEditingId(null);
    setName('');
    setEmail('');
    setPassword('');
    setRole('sales');
    setDistrict('Tinsukia');
    setDistrictSearch('');
    setEmploymentType('monthly_salary');
    setBaseRate('0');
    setSelectedAllowances([]); // Start empty! No pre-marked allowances
    setError('');
    setIsModalOpen(true);
  };

  const openEditModal = (user: SupabaseUser) => {
    setEditingId(user.id);
    setName(user.user_metadata?.name || '');
    setEmail(user.email);
    setPassword('');
    setRole(user.user_metadata?.role || 'sales');
    setDistrict(user.user_metadata?.district || 'Tinsukia');
    setDistrictSearch('');
    setEmploymentType(user.user_metadata?.employment_type || 'monthly_salary');
    setBaseRate(user.user_metadata?.base_rate !== undefined && user.user_metadata?.base_rate !== null ? String(user.user_metadata.base_rate) : '');

    // Normalize allowances from metadata
    const raw = user.user_metadata?.allowances;
    if (Array.isArray(raw)) {
      setSelectedAllowances(raw.map((item: any) => {
        if (typeof item === 'object' && item !== null) {
          return { id: item.id, rate: item.rate !== undefined && item.rate !== null ? String(item.rate) : '' };
        }
        return { id: String(item), rate: '' };
      }));
    } else {
      setSelectedAllowances([]);
    }
    setError('');
    setIsModalOpen(true);
  };

  const generateEmail = () => {
    if (!name) return;
    const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    setEmail(`${cleanName}@ledovalley.com`);
  };

  const generatePassword = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let pass = "";
    for (let i = 0; i < 12; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(pass);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    startTransition(async () => {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('email', email);
      formData.append('role', role);
      formData.append('district', district);
      formData.append('employment_type', employmentType);
      formData.append('base_rate', baseRate);

      // Allowances are ONLY for commission-only users
      const isCommission = employmentType === 'commission';
      const allowancesToSave = isCommission
        ? selectedAllowances.map(a => ({
          id: a.id,
          rate: parseFloat(String(a.rate)) || 0
        }))
        : [];
      formData.append('allowances', JSON.stringify(allowancesToSave));

      if (password) formData.append('password', password);

      let res;
      if (editingId) {
        res = await updateUser(editingId, formData);
      } else {
        if (!password) {
          setError("Password is required for new users.");
          return;
        }
        res = await createUser(formData);
      }

      if (res?.error) {
        setError(res.error);
      } else {
        setIsModalOpen(false);
      }
    });
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to permanently delete this user?")) {
      startTransition(async () => {
        await deleteUser(id);
      });
    }
  };

  const getRoleBadge = (userRole: string) => {
    switch (userRole) {
      case 'admin':
        return 'bg-[#0D4728] text-[#FFF9CD] border-[#0D4728]';
      case 'manager':
        return 'bg-[#E4B84D]/20 text-[#8c6b16] border-[#E4B84D]/40';
      case 'sales':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-7">

      {/* 1. HERO HEADER & SUMMARY METRICS (Consistent with Dashboard) */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6 pb-2">

        {/* Left: Headline & Description */}
        <div className="space-y-3">
          <div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-light text-slate-900 tracking-tight">
              User <span className="font-semibold text-[#0D4728]">Management</span>
            </h1>
            <p className="text-slate-500 text-sm sm:text-base mt-1.5">
              Role-governed directory &bull; Administrator controls, managers, and field sales logins
            </p>
          </div>

          {/* Quick Filters Pill Segment */}
          <div className="inline-flex p-1 bg-white/80 backdrop-blur-md rounded-full border border-slate-200/80 shadow-xs gap-1">
            {[
              { id: 'all', label: 'All Users', count: stats.total },
              { id: 'admin', label: 'Admins', count: stats.admins },
              { id: 'manager', label: 'Warehouse Managers', count: stats.managers },
              { id: 'sales', label: 'Sales Persons', count: stats.sales },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setSelectedRoleFilter(f.id)}
                className={`flex items-center gap-2 px-4.5 py-2 rounded-full text-sm font-medium transition-all ${selectedRoleFilter === f.id
                  ? 'bg-[#0D4728] text-[#FFF9CD] font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                  }`}
              >
                <span>{f.label}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${selectedRoleFilter === f.id ? 'bg-white/20 text-[#FFF9CD]' : 'bg-slate-100 text-slate-600'
                  }`}>
                  {f.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Right: Action Button & Giant Metrics */}
        <div className="flex items-center gap-6 sm:gap-8 pt-2 xl:pt-0">

          {/* Total Staff Counter */}
          <div className="flex items-baseline gap-2.5">
            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 self-center">
              <Users className="w-4.5 h-4.5" />
            </div>
            <div>
              <span className="text-3xl sm:text-4xl lg:text-5xl font-light text-slate-900 tracking-tight">
                {stats.total}
              </span>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Members</p>
            </div>
          </div>

          {/* Add New User Pill Button */}
          <button
            onClick={openCreateModal}
            className="h-11 flex items-center gap-2 bg-[#0D4728] hover:bg-[#167a44] text-[#FFF9CD] px-5 rounded-full text-sm font-semibold transition-all shadow-xs hover:shadow-sm"
          >
            <Plus className="w-4.5 h-4.5" />
            <span>Add New User</span>
          </button>

        </div>
      </div>

      {/* 2. MAIN TABLE CARD (Curved Canvas Container) */}
      <div className="bg-white border border-slate-200/80 rounded-[28px] overflow-hidden shadow-xs flex flex-col">

        {/* Table Filter & Search Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 max-w-xl w-full">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search name, email, or district..."
                className="w-full bg-white border border-slate-200 rounded-full py-2.5 pl-11 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all shadow-2xs"
              />
            </div>
            
            {/* District Filter Dropdown */}
            <div className="flex items-center gap-1.5 shrink-0">
              <select
                value={selectedDistrictFilter}
                onChange={(e) => setSelectedDistrictFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-full py-2.5 px-3.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all shadow-2xs"
              >
                <option value="all">All Districts (Assam)</option>
                {ASSAM_DISTRICTS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-sm text-slate-500 font-medium">
            Showing <span className="font-bold text-slate-900">{filteredUsers.length}</span> of {users.length} accounts
          </div>
        </div>

        {/* Users Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 font-bold text-slate-500 uppercase tracking-wider text-xs">
                <th className="py-4 px-6">Member Profile</th>
                <th className="py-4 px-6">System Role</th>
                <th className="py-4 px-6">Compensation & Allowances</th>
                <th className="py-4 px-6">Joined Date</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isPending ? (
                <>
                  <TableRowSkeleton columns={5} />
                  <TableRowSkeleton columns={5} />
                  <TableRowSkeleton columns={5} />
                  <TableRowSkeleton columns={5} />
                </>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-14 text-center text-slate-400">
                    <User className="w-10 h-10 mx-auto mb-2 opacity-40 text-slate-400" />
                    <p className="text-sm font-medium text-slate-600">No users found matching your search.</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map(u => {
                  const uName = u.user_metadata?.name || 'No Name Set';
                  const uRole = u.user_metadata?.role || 'staff';
                  const initialLetter = uName !== 'No Name Set' ? uName.charAt(0).toUpperCase() : u.email.charAt(0).toUpperCase();

                  const uEmpType = u.user_metadata?.employment_type || 'monthly_salary';
                  const uBaseRate = u.user_metadata?.base_rate;
                  const rawAllowances = u.user_metadata?.allowances;
                  const uAllowances: Array<{ id: string; rate?: number }> = Array.isArray(rawAllowances)
                    ? rawAllowances.map((item: any) => typeof item === 'object' && item !== null ? item : { id: String(item), rate: 0 })
                    : [];
                  const empTypeObj = EMPLOYMENT_TYPES.find(t => t.id === uEmpType) || EMPLOYMENT_TYPES[0];

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/60 transition-colors group">

                      {/* Member Info */}
                      <td className="py-4 px-6 flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-full bg-[#0D4728] flex items-center justify-center text-[#FFF9CD] font-bold text-sm shadow-xs shrink-0">
                          {initialLetter}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 text-sm truncate">{uName}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-slate-500 truncate">{u.email}</span>
                            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200/60">
                              <MapPin className="w-2.5 h-2.5 text-emerald-600" />
                              {u.user_metadata?.district || 'Tinsukia'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Role Pill Badge */}
                      <td className="py-4 px-6">
                        <span className={`inline-flex items-center px-3.5 py-1 rounded-full border text-xs font-semibold capitalize tracking-wide ${getRoleBadge(uRole)}`}>
                          {uRole}
                        </span>
                      </td>

                      {/* Compensation & Allowances */}
                      <td className="py-4 px-6">
                        <div className="space-y-1.5">
                          {/* Wage / Salary pill */}
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200/80 text-xs font-semibold text-slate-800">
                            <span className="text-[#0D4728] font-bold">
                              {empTypeObj.label}:
                            </span>
                            <span className="font-mono">
                              {uBaseRate ? (uEmpType === 'commission' ? `${uBaseRate}%` : `₹${Number(uBaseRate).toLocaleString('en-IN')}`) : 'Not set'}
                            </span>
                          </div>

                          {/* Allowance Chips (Only for commission users) */}
                          {uEmpType === 'commission' ? (
                            uAllowances.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {uAllowances.map(a => {
                                  const aOpt = ALLOWANCE_OPTIONS.find(o => o.id === a.id);
                                  if (!aOpt) return null;
                                  return (
                                    <span
                                      key={a.id}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200/60 text-[10px] font-semibold text-emerald-800"
                                    >
                                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                      <span>{aOpt.label}</span>
                                      {Boolean(a.rate) && (
                                        <span className="font-mono text-[#0D4728] font-bold ml-0.5">
                                          (₹{a.rate}{a.id === 'bike_allowance' ? '/km' : ''})
                                        </span>
                                      )}
                                    </span>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-[11px] text-slate-400 italic">No allowances configured</p>
                            )
                          ) : (
                            <p className="text-[11px] text-slate-400 italic">Fixed salary model (No allowances)</p>
                          )}
                        </div>
                      </td>

                      {/* Joined Date */}
                      <td className="py-4 px-6 text-slate-600 font-mono text-xs">
                        {new Date(u.created_at).toISOString().split('T')[0]}
                      </td>

                      {/* Action Buttons */}
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(u)}
                            className="w-8.5 h-8.5 rounded-full bg-slate-100 hover:bg-[#0D4728]/10 hover:text-[#0D4728] text-slate-600 flex items-center justify-center transition-colors"
                            title="Edit User"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          {currentUserRole === 'admin' && (
                            <button
                              onClick={() => handleDelete(u.id)}
                              className="w-8.5 h-8.5 rounded-full bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-600 flex items-center justify-center transition-colors"
                              title="Delete User"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* 3. REDESIGNED USER MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[32px] w-full max-w-2xl shadow-2xl border border-white/80 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">

            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-[#0D4728] text-[#FFF9CD] flex items-center justify-center shadow-xs">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingId ? 'Update Account' : 'Create New Account'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {editingId ? 'Modify member credentials and role' : 'Provide details to invite team member'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-6 space-y-4.5 overflow-y-auto flex-1">
                {error && (
                  <div className="p-3.5 bg-red-50 border border-red-200/80 text-red-600 text-sm rounded-2xl font-medium animate-in fade-in">
                    {error}
                  </div>
                )}

                {/* Full Name */}
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-slate-50/70 border border-slate-200 rounded-full py-2.5 pl-11 pr-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all"
                      placeholder="e.g. Monish Ranjan"
                      required
                    />
                  </div>
                </div>

                {/* Email Address */}
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Email Address</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-slate-50/70 border border-slate-200 rounded-full py-2.5 pl-11 pr-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all"
                        placeholder="name@ledovalley.com"
                        required
                      />
                    </div>
                    <button
                      type="button"
                      onClick={generateEmail}
                      className="px-4.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0"
                      title="Generate @ledovalley.com from name"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Auto
                    </button>
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">
                    {editingId ? 'Change Password (leave blank to keep current)' : 'Account Password'}
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                      <input
                        type="text"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-slate-50/70 border border-slate-200 rounded-full py-2.5 pl-11 pr-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all"
                        placeholder="••••••••••••"
                        required={!editingId}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={generatePassword}
                      className="px-4.5 bg-[#E4B84D]/20 hover:bg-[#E4B84D]/30 text-[#8c6b16] rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0"
                      title="Generate secure random password"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Auto
                    </button>
                  </div>
                </div>

                {/* Assign Role */}
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Assign Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-full py-2.5 px-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all"
                  >
                    <option value="admin">Admin (Full Access & Portal)</option>
                    <option value="manager">Warehouse Manager (Factory & Blending Module Only)</option>
                    <option value="sales">Sales Person (Field Sales & ERP Dashboard)</option>
                  </select>
                </div>

                {/* Assigned District in Assam */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-[#0D4728]" />
                      <span>Assigned District (Assam)</span>
                    </label>
                    <span className="text-[11px] text-slate-400">35 Official Districts</span>
                  </div>
                  
                  {/* District Search & Quick Filter */}
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={districtSearch}
                        onChange={(e) => setDistrictSearch(e.target.value)}
                        placeholder="Search district (e.g. Tinsukia, Dibrugarh, Kamrup)..."
                        className="w-full bg-white border border-slate-200 rounded-full py-1.5 pl-9 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0D4728]"
                      />
                    </div>
                    <select
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      className="w-full bg-slate-50/70 border border-slate-200 rounded-2xl py-2 px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all"
                      size={4}
                    >
                      {ASSAM_DISTRICTS
                        .filter(d => d.toLowerCase().includes(districtSearch.toLowerCase()))
                        .map((d) => (
                          <option key={d} value={d} className="py-1 px-2 rounded-lg cursor-pointer hover:bg-emerald-50">
                            {d} District
                          </option>
                        ))}
                    </select>
                    <p className="text-[11px] text-emerald-800 font-semibold px-1 flex items-center gap-1">
                      <span>Selected:</span>
                      <span className="font-bold underline">{district} District</span>
                    </p>
                  </div>
                </div>

                {/* Compensation & Wage Model */}
                <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Wage Model & Base Rate
                    </label>
                    <span className="text-[11px] text-slate-400">Payroll & compensation terms</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">Employment Type</label>
                      <select
                        value={employmentType}
                        onChange={(e) => setEmploymentType(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-full py-2 px-3 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20"
                      >
                        {EMPLOYMENT_TYPES.map(t => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                        <span>Base Pay Rate (₹)</span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          {EMPLOYMENT_TYPES.find(t => t.id === employmentType)?.unit}
                        </span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={baseRate}
                          onChange={(e) => setBaseRate(e.target.value)}
                          placeholder="25,000"
                          className="w-full bg-white border border-slate-200 rounded-full py-2 pl-7 pr-3 text-xs sm:text-sm font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Allowances: ONLY FOR COMMISSION ONLY USERS */}
                  {employmentType === 'commission' ? (
                    <div className="space-y-3 pt-3 border-t border-slate-200/60 animate-in fade-in">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                            Entitled Field Allowances
                          </label>
                          <p className="text-[11px] text-slate-500">Pick allowances & enter daily/shift rate (₹)</p>
                        </div>
                        <span className="text-[11px] font-medium text-slate-400">
                          {selectedAllowances.length} selected
                        </span>
                      </div>

                      {/* Allowance Select Pills */}
                      <div className="flex flex-wrap gap-2">
                        {ALLOWANCE_OPTIONS.map(opt => {
                          const isSelected = selectedAllowances.some(a => a.id === opt.id);
                          const IconComp = opt.icon;

                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => toggleAllowance(opt.id)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${isSelected
                                ? 'bg-[#0D4728] text-[#FFF9CD] border-[#0D4728] shadow-xs'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                }`}
                              title={opt.hint}
                            >
                              <IconComp className="w-3.5 h-3.5 shrink-0" />
                              <span>{opt.label}</span>
                              {isSelected && <Check className="w-3 h-3 stroke-[3] ml-0.5" />}
                            </button>
                          );
                        })}
                      </div>

                      {/* Custom Rate Inputs for Selected Allowances */}
                      {selectedAllowances.length > 0 ? (
                        <div className="space-y-2 pt-2 bg-slate-50/90 p-3 rounded-2xl border border-slate-200">
                          <p className="text-[11px] font-semibold text-slate-700">Enter custom allowance rate per shift/day:</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {selectedAllowances.map(entry => {
                              const opt = ALLOWANCE_OPTIONS.find(o => o.id === entry.id);
                              if (!opt) return null;
                              const IconComp = opt.icon;

                              return (
                                <div key={entry.id} className="bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-xs space-y-1.5">
                                  <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                                    <span className="flex items-center gap-1.5 truncate">
                                      <IconComp className="w-3.5 h-3.5 text-[#0D4728] shrink-0" />
                                      <span className="truncate">{opt.label}</span>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => toggleAllowance(entry.id)}
                                      className="text-slate-400 hover:text-red-500 p-0.5 rounded transition-colors"
                                      title="Remove"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                  <div className="relative">
                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step={entry.id === 'bike_allowance' ? '0.5' : '1'}
                                      placeholder={entry.id === 'bike_allowance' ? 'Rate per km (e.g. 3)' : 'Enter rate (e.g. 250)'}
                                      value={entry.rate}
                                      onChange={(e) => updateAllowanceRate(entry.id, e.target.value)}
                                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 pl-6 pr-14 text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0D4728] focus:border-[#0D4728]"
                                    />
                                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400">
                                      {entry.id === 'bike_allowance' ? '/ km' : entry.id === 'mobile_recharge' ? '/ mo' : '/ day'}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400 italic">No allowances selected. Click any pill above to add and set its rate.</p>
                      )}
                    </div>
                  ) : (
                    <div className="p-2.5 bg-slate-100/60 rounded-xl border border-dashed border-slate-200 text-center">
                      <p className="text-[11px] text-slate-500">
                        Field allowances only apply to <span className="font-semibold text-slate-700">Commission Only</span> sales roles.
                      </p>
                    </div>
                  )}
                </div>

              </div>

              {/* Modal Actions Pinned Footer */}
              <div className="p-4 sm:p-5 px-6 flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/50 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-full text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex items-center gap-2 bg-[#0D4728] hover:bg-[#167a44] text-[#FFF9CD] px-6 py-2.5 rounded-full text-sm font-semibold transition-all disabled:opacity-50 shadow-xs"
                >
                  {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingId ? 'Save Changes' : 'Create Account'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
