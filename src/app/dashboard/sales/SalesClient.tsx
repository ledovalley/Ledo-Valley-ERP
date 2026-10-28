'use client';

import { useState, useTransition, useMemo, useEffect } from 'react';
import { createRetailer, updateRetailer, createSaleRecord, logNoOrderVisit } from './actions';
import {
  Store,
  Plus,
  Search,
  MapPin,
  Phone,
  IndianRupee,
  Loader2,
  TrendingUp,
  Package,
  ShoppingBag,
  X,
  User,
  Navigation,
  ExternalLink,
  Clock,
  Crosshair,
  CheckCircle2,
  AlertCircle,
  LayoutGrid,
  List,
  Edit2,
  Trash2,
  Layers,
  Sparkles,
  Info,
  Check,
  ClipboardList,
  Wallet,
  CreditCard,
  Banknote
} from 'lucide-react';
import { RetailerCardSkeleton, TableRowSkeleton } from '@/components/ui/Skeleton';

// Hydration-safe helper to format ISO strings into readable Date and Time
const formatDateTime = (isoString?: string) => {
  if (!isoString) return { date: 'N/A', time: '', full: 'N/A' };
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return { date: isoString, time: '', full: isoString };

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = String(d.getDate()).padStart(2, '0');
    const month = months[d.getMonth()];
    const year = d.getFullYear();

    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strHours = String(hours).padStart(2, '0');

    return {
      date: `${day} ${month} ${year}`,
      time: `${strHours}:${minutes} ${ampm}`,
      full: `${day} ${month} ${year}, ${strHours}:${minutes} ${ampm}`
    };
  } catch {
    return { date: isoString || 'N/A', time: '', full: isoString || 'N/A' };
  }
};

export default function SalesClient({
  retailers,
  salesRecords,
  products = [],
  usersList = [],
  currentUserRole,
  currentUserId,
  currentUserName
}: {
  retailers: any[],
  salesRecords: any[],
  products?: any[],
  usersList?: any[],
  currentUserRole: string,
  currentUserId?: string,
  currentUserName?: string
}) {
  const [activeTab, setActiveTab] = useState<'retailers' | 'sales'>('retailers');
  const [isRetailerModalOpen, setIsRetailerModalOpen] = useState(false);
  const [isEditRetailerModalOpen, setIsEditRetailerModalOpen] = useState(false);
  const [isSalesModalOpen, setIsSalesModalOpen] = useState(false);
  const [viewingRetailer, setViewingRetailer] = useState<any | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const getUserInfo = (userId?: string) => {
    if (!userId) {
      return {
        name: 'Field Team',
        role: 'Sales',
        email: '',
        monogram: 'FT'
      };
    }
    if (userId === currentUserId && currentUserName) {
      const monogram = currentUserName.slice(0, 2).toUpperCase();
      return {
        name: currentUserName,
        role: currentUserRole || 'Sales',
        email: '',
        monogram: monogram || 'U'
      };
    }
    const found = (usersList || []).find((u: any) => u.id === userId);
    if (found) {
      const name = found.user_metadata?.name || found.user_metadata?.full_name || found.email?.split('@')[0] || 'Staff Member';
      const role = found.user_metadata?.role || 'Sales';
      const monogram = name.slice(0, 2).toUpperCase();
      return {
        name,
        role,
        email: found.email || '',
        monogram
      };
    }
    return {
      name: 'Field Representative',
      role: 'Sales',
      email: '',
      monogram: 'FR'
    };
  };

  const [searchTerm, setSearchTerm] = useState('');

  // Retailer Registration Form State
  const [rName, setRName] = useState('');
  const [rShop, setRShop] = useState('');
  const [rAddress, setRAddress] = useState('');
  const [rPhone, setRPhone] = useState('');
  const [rTerritory, setRTerritory] = useState('');
  const [rGeoLocation, setRGeoLocation] = useState('');
  const [geoStatus, setGeoStatus] = useState<'idle' | 'requesting' | 'success' | 'error'>('idle');
  const [geoErrorMsg, setGeoErrorMsg] = useState('');

  // Edit Retailer Form State
  const [editId, setEditId] = useState('');
  const [editName, setEditName] = useState('');
  const [editShop, setEditShop] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editTerritory, setEditTerritory] = useState('');
  const [editGeoLocation, setEditGeoLocation] = useState('');
  const [editGeoStatus, setEditGeoStatus] = useState<'idle' | 'requesting' | 'success' | 'error'>('idle');

  // Multi-Product Sales Form State
  const [sRetailerId, setSRetailerId] = useState('');
  const [sAmount, setSAmount] = useState('');
  const [orderItems, setOrderItems] = useState<Array<{ id: string, category: string, quantity: string }>>([
    { id: '1', category: 'Tea', quantity: '50 kg' }
  ]);

  // Payment Breakdown State (Zero-Math automated calculation)
  const [hasPaymentReceived, setHasPaymentReceived] = useState<boolean>(false);
  const [sCashAmount, setSCashAmount] = useState<string>('');
  const [sOnlineAmount, setSOnlineAmount] = useState<string>('');

  // No-Order Visit Modal State
  const [isNoOrderModalOpen, setIsNoOrderModalOpen] = useState(false);
  const [noOrderRetailer, setNoOrderRetailer] = useState<any | null>(null);
  const [noOrderReason, setNoOrderReason] = useState('Sufficient Stock');
  const [noOrderNotes, setNoOrderNotes] = useState('');
  const [noOrderGeo, setNoOrderGeo] = useState('');
  const [noOrderGeoStatus, setNoOrderGeoStatus] = useState<'idle' | 'requesting' | 'success' | 'error'>('idle');

  // Available categories (database products fallback to Tea, Sauces, Soya Chunks)
  const availableCategories = useMemo(() => {
    if (products && products.length > 0) return products;
    return [
      { id: '1', name: 'Tea', unit: 'kg' },
      { id: '2', name: 'Sauces', unit: 'cases' },
      { id: '3', name: 'Soya Chunks', unit: 'bags' }
    ];
  }, [products]);

  // Live timestamp for read-only display
  const [liveTimestamp, setLiveTimestamp] = useState<string>('');
  useEffect(() => {
    setLiveTimestamp(formatDateTime(new Date().toISOString()).full);
    const interval = setInterval(() => {
      setLiveTimestamp(formatDateTime(new Date().toISOString()).full);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Metrics summary
  const metrics = useMemo(() => {
    const totalRevenue = salesRecords.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
    const totalQty = salesRecords.reduce((acc, curr) => acc + (Number(curr.order_qty) || 0), 0);
    const totalRetailers = retailers.length;
    const totalOrders = salesRecords.length;
    return { totalRevenue, totalQty, totalRetailers, totalOrders };
  }, [salesRecords, retailers]);

  // Real browser geolocation acquisition with high-accuracy retry & user feedback
  const requestBrowserLocation = (isForEdit = false) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      if (isForEdit) setEditGeoStatus('error');
      else {
        setGeoStatus('error');
        setGeoErrorMsg('Geolocation is not supported by your browser.');
      }
      return;
    }

    if (isForEdit) setEditGeoStatus('requesting');
    else {
      setGeoStatus('requesting');
      setGeoErrorMsg('');
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);
        const loc = `${lat}, ${lng}`;
        if (isForEdit) {
          setEditGeoLocation(loc);
          setEditGeoStatus('success');
        } else {
          setRGeoLocation(loc);
          setGeoStatus('success');
        }
      },
      () => {
        // Fallback retry with standard accuracy
        navigator.geolocation.getCurrentPosition(
          (fallbackPos) => {
            const lat = fallbackPos.coords.latitude.toFixed(6);
            const lng = fallbackPos.coords.longitude.toFixed(6);
            const loc = `${lat}, ${lng}`;
            if (isForEdit) {
              setEditGeoLocation(loc);
              setEditGeoStatus('success');
            } else {
              setRGeoLocation(loc);
              setGeoStatus('success');
            }
          },
          (finalErr) => {
            if (isForEdit) {
              setEditGeoStatus('error');
            } else {
              setGeoStatus('error');
              if (finalErr.code === finalErr.PERMISSION_DENIED) {
                setGeoErrorMsg('Location permission was denied. Please allow location access in your browser.');
              } else if (finalErr.code === finalErr.POSITION_UNAVAILABLE) {
                setGeoErrorMsg('GPS location is unavailable on your device.');
              } else if (finalErr.code === finalErr.TIMEOUT) {
                setGeoErrorMsg('Location request timed out. You can enter coordinates manually.');
              } else {
                setGeoErrorMsg('Unable to retrieve location.');
              }
            }
          },
          { enableHighAccuracy: false, timeout: 12000 }
        );
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  // Open New Retailer Modal
  const openNewRetailerModal = () => {
    setRName('');
    setRShop('');
    setRAddress('');
    setRPhone('');
    setRTerritory('');
    setRGeoLocation('');
    setGeoStatus('idle');
    setGeoErrorMsg('');
    setError('');
    setIsRetailerModalOpen(true);
    requestBrowserLocation(false);
  };

  // Open Edit Retailer Modal
  const openEditRetailerModal = (retailer: any) => {
    setEditId(retailer.id);
    setEditName(retailer.name || '');
    setEditShop(retailer.shop_name || '');
    setEditAddress(retailer.address || '');
    setEditPhone(retailer.phone || '');
    setEditTerritory(retailer.territory || '');
    setEditGeoLocation(retailer.geo_location || '');
    setEditGeoStatus('idle');
    setError('');
    setIsEditRetailerModalOpen(true);
  };

  // Open Sales Modal
  const openNewSaleModal = (retailerId?: string) => {
    setSRetailerId(retailerId || (retailers.length > 0 ? retailers[0].id : ''));
    setSAmount('');
    setHasPaymentReceived(false);
    setSCashAmount('');
    setSOnlineAmount('');
    setOrderItems([
      { id: '1', category: availableCategories[0]?.name || 'Tea', quantity: '50 kg' }
    ]);
    setError('');
    setIsSalesModalOpen(true);
  };

  // Open No-Order Visit Modal
  const openNoOrderModal = (retailer: any) => {
    setNoOrderRetailer(retailer);
    setNoOrderReason('Sufficient Stock');
    setNoOrderNotes('');
    setNoOrderGeo(retailer.geo_location || '');
    setNoOrderGeoStatus(retailer.geo_location ? 'success' : 'idle');
    setError('');
    setIsNoOrderModalOpen(true);
  };

  // GPS grab for visit verification
  const requestNoOrderLocation = () => {
    if (!navigator.geolocation) {
      setNoOrderGeoStatus('error');
      return;
    }
    setNoOrderGeoStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNoOrderGeo(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`);
        setNoOrderGeoStatus('success');
      },
      (err) => {
        console.warn("GPS lock error:", err);
        setNoOrderGeoStatus('error');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Handle No-Order Visit Logging
  const handleLogNoOrderVisit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!noOrderRetailer) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.append('retailer_id', noOrderRetailer.id);
      formData.append('no_order_reason', noOrderReason);
      formData.append('notes', noOrderNotes);
      formData.append('geo_location', noOrderGeo);

      const res = await logNoOrderVisit(formData);
      if (res?.error) {
        setError(res.error);
      } else {
        setIsNoOrderModalOpen(false);
        setNoOrderRetailer(null);
        setNoOrderReason('Sufficient Stock');
        setNoOrderNotes('');
        setNoOrderGeo('');
        setNoOrderGeoStatus('idle');
      }
    });
  };

  // Multi-product line items handlers
  const handleAddOrderItem = () => {
    setOrderItems(prev => [
      ...prev,
      {
        id: Math.random().toString(),
        category: availableCategories[0]?.name || 'Tea',
        quantity: ''
      }
    ]);
  };

  const handleRemoveOrderItem = (id: string) => {
    if (orderItems.length > 1) {
      setOrderItems(prev => prev.filter(item => item.id !== id));
    }
  };

  const handleUpdateOrderItem = (id: string, field: 'category' | 'quantity', value: string) => {
    setOrderItems(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  // Function to open location on Maps based on client device & OS
  const openInMaps = (geoLocation: string, address: string, shopName: string) => {
    if (!geoLocation && !address) {
      alert("No location or address available for this retailer.");
      return;
    }

    const cleanCoords = geoLocation ? geoLocation.trim().replace(/\s+/g, '') : '';
    const isCoords = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(cleanCoords);
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const maxTouchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0;

    const isIOS = /iPhone|iPad|iPod/i.test(userAgent) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && maxTouchPoints > 1);
    const isAndroid = /Android/i.test(userAgent);

    let mapUrl = '';
    if (isIOS) {
      if (isCoords) {
        mapUrl = `https://maps.apple.com/?ll=${cleanCoords}&q=${encodeURIComponent(shopName)}`;
      } else {
        mapUrl = `https://maps.apple.com/?q=${encodeURIComponent(`${shopName}, ${address}`)}`;
      }
    } else if (isAndroid) {
      if (isCoords) {
        mapUrl = `geo:${cleanCoords}?q=${cleanCoords}(${encodeURIComponent(shopName)})`;
      } else {
        mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${shopName}, ${address}`)}`;
      }
    } else {
      if (isCoords) {
        mapUrl = `https://www.google.com/maps/search/?api=1&query=${cleanCoords}`;
      } else {
        mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${shopName}, ${address}`)}`;
      }
    }

    window.open(mapUrl, '_blank', 'noopener,noreferrer');
  };

  // Handle Retailer Creation
  const handleCreateRetailer = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    startTransition(async () => {
      const formData = new FormData();
      formData.append('name', rName);
      formData.append('shop_name', rShop);
      formData.append('address', rAddress);
      formData.append('phone', rPhone);
      formData.append('territory', rTerritory);
      formData.append('geo_location', rGeoLocation.trim());

      const res = await createRetailer(formData);
      if (res?.error) {
        setError(res.error);
      } else {
        setIsRetailerModalOpen(false);
        const registered = res.retailer || {
          id: Math.random().toString(),
          name: rName,
          shop_name: rShop,
          address: rAddress,
          phone: rPhone,
          territory: rTerritory,
          geo_location: rGeoLocation.trim(),
          created_at: new Date().toISOString()
        };
        setRName(''); setRShop(''); setRAddress(''); setRPhone(''); setRTerritory(''); setRGeoLocation('');
        // Immediately show the retailer with full data created!
        setViewingRetailer(registered);
      }
    });
  };

  // Handle Retailer Update
  const handleUpdateRetailer = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    startTransition(async () => {
      const formData = new FormData();
      formData.append('name', editName);
      formData.append('shop_name', editShop);
      formData.append('address', editAddress);
      formData.append('phone', editPhone);
      formData.append('territory', editTerritory);
      formData.append('geo_location', editGeoLocation.trim());

      const res = await updateRetailer(editId, formData);
      if (res?.error) {
        setError(res.error);
      } else {
        setIsEditRetailerModalOpen(false);
        if (res.retailer) {
          setViewingRetailer(res.retailer);
        }
      }
    });
  };

  // Handle Multi-Product Order Logging
  const handleCreateSale = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (orderItems.length === 0) {
      setError('Please add at least one product category to the order.');
      return;
    }

    const totalVal = parseFloat(sAmount) || 0;
    const cashVal = hasPaymentReceived ? (parseFloat(sCashAmount) || 0) : 0;
    const onlineVal = hasPaymentReceived ? (parseFloat(sOnlineAmount) || 0) : 0;
    const dueVal = Math.max(0, totalVal - cashVal - onlineVal);
    const paymentStatus = !hasPaymentReceived ? 'credit' : (dueVal === 0 ? 'paid' : 'partial');

    startTransition(async () => {
      const formData = new FormData();
      formData.append('retailer_id', sRetailerId);
      formData.append('amount', sAmount);
      formData.append('order_qty', orderItems.length.toString());

      // Save structured product items and human summary in notes
      const summary = orderItems
        .filter(i => i.quantity.trim())
        .map(i => `${i.category} (${i.quantity})`)
        .join(', ');

      const payload = {
        items: orderItems,
        summary: summary || `${orderItems.length} products`
      };

      formData.append('notes', JSON.stringify(payload));
      formData.append('payment_status', paymentStatus);
      formData.append('cash_amount', cashVal.toString());
      formData.append('online_amount', onlineVal.toString());
      formData.append('due_amount', dueVal.toString());

      const res = await createSaleRecord(formData);
      if (res?.error) {
        setError(res.error);
      } else {
        setIsSalesModalOpen(false);
        setSAmount('');
        setSRetailerId('');
        setHasPaymentReceived(false);
        setSCashAmount('');
        setSOnlineAmount('');
        setOrderItems([{ id: '1', category: availableCategories[0]?.name || 'Tea', quantity: '50 kg' }]);
      }
    });
  };

  const [selectedTerritory, setSelectedTerritory] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Compute unique territories dynamically
  const territories = useMemo(() => {
    const set = new Set<string>();
    retailers.forEach(r => {
      if (r.territory && r.territory.trim()) {
        set.add(r.territory.trim());
      }
    });
    return Array.from(set).sort();
  }, [retailers]);

  const getInitials = (name?: string) => {
    if (!name) return 'RT';
    const clean = name.trim();
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
  };

  const filteredRetailers = useMemo(() => {
    return retailers.filter(r => {
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        r.name.toLowerCase().includes(term) ||
        r.shop_name.toLowerCase().includes(term) ||
        (r.phone && r.phone.toLowerCase().includes(term)) ||
        (r.address && r.address.toLowerCase().includes(term)) ||
        (r.territory && r.territory.toLowerCase().includes(term));
      const matchesTerritory = selectedTerritory === 'all' || r.territory === selectedTerritory;
      return matchesSearch && matchesTerritory;
    });
  }, [retailers, searchTerm, selectedTerritory]);

  const filteredSales = useMemo(() => {
    return salesRecords.filter(s => {
      const term = searchTerm.toLowerCase();
      const shop = (s.retailers?.shop_name || '').toLowerCase();
      const owner = (s.retailers?.name || '').toLowerCase();
      const territory = (s.retailers?.territory || '').toLowerCase();
      const notes = (s.notes || '').toLowerCase();
      const matchesSearch = shop.includes(term) || owner.includes(term) || territory.includes(term) || notes.includes(term);
      const matchesTerritory = selectedTerritory === 'all' || s.retailers?.territory === selectedTerritory;
      return matchesSearch && matchesTerritory;
    });
  }, [salesRecords, searchTerm, selectedTerritory]);

  // Helper to parse product summary from sale notes
  const getSaleProductsSummary = (notes?: string) => {
    if (!notes) return null;
    try {
      const parsed = JSON.parse(notes);
      if (parsed.summary) return parsed.summary;
      if (Array.isArray(parsed.items)) {
        return parsed.items.map((i: any) => `${i.category} (${i.quantity})`).join(', ');
      }
    } catch {
      return notes;
    }
    return null;
  };

  return (
    <div className="space-y-5 sm:space-y-7">

      {/* 1. HERO HEADER & SUMMARY METRICS */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-5 sm:gap-6 pb-1 sm:pb-2">

        {/* Left: Headline & Segmented View Pills */}
        <div className="space-y-3">
          <div>
            <h1 className="text-2xl sm:text-4xl lg:text-5xl font-light text-slate-900 tracking-tight">
              {currentUserRole === 'admin' || currentUserRole === 'manager' ? (
                <>Sales & <span className="font-semibold text-[#0D4728]">Retailers</span></>
              ) : (
                <>My Field <span className="font-semibold text-[#0D4728]">Sales</span></>
              )}
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5 sm:mt-1">
              {currentUserRole === 'admin'
                ? 'Territory oversight, retailer network directory, and real-time revenue intake'
                : 'Log shop visits, register authorized retailers, and book multi-product sales records'}
            </p>
          </div>

          {/* Segmented Capsule Tabs (Retailers vs Sales) */}
          <div className="w-full grid grid-cols-2 sm:inline-flex sm:w-auto p-1 bg-white/80 backdrop-blur-md rounded-full border border-slate-200/80 shadow-xs gap-1">
            <button
              onClick={() => setActiveTab('retailers')}
              className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-medium transition-all ${
                activeTab === 'retailers'
                  ? 'bg-[#0D4728] text-[#FFF9CD] font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
              }`}
            >
              <Store className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="truncate">Retailers</span>
              <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full ${
                activeTab === 'retailers' ? 'bg-white/20 text-[#FFF9CD]' : 'bg-slate-100 text-slate-600 font-semibold'
              }`}>
                {metrics.totalRetailers}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('sales')}
              className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-medium transition-all ${
                activeTab === 'sales'
                  ? 'bg-[#0D4728] text-[#FFF9CD] font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="truncate">Orders</span>
              <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full ${
                activeTab === 'sales' ? 'bg-white/20 text-[#FFF9CD]' : 'bg-slate-100 text-slate-600 font-semibold'
              }`}>
                {metrics.totalOrders}
              </span>
            </button>
          </div>
        </div>

        {/* Right: Giant Minimalist Metrics + Action Pill Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between xl:justify-end gap-4 sm:gap-6 pt-1 xl:pt-0 w-full xl:w-auto">

          {/* Metric Counters (2-Column Grid on Mobile) */}
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-3.5 sm:gap-7 w-full sm:w-auto">
            {/* Total Revenue Counter */}
            <div className="flex items-center sm:items-baseline gap-2 sm:gap-2.5">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#E4B84D]/20 flex items-center justify-center text-[#9c7821] shrink-0">
                <IndianRupee className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              </div>
              <div className="min-w-0">
                <span className="text-2xl sm:text-4xl lg:text-5xl font-light text-slate-900 tracking-tight font-mono block truncate">
                  {metrics.totalRevenue.toLocaleString('en-IN')}
                </span>
                <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">Revenue</p>
              </div>
            </div>

            {/* Total Dispatched Orders Counter */}
            <div className="flex items-center sm:items-baseline gap-2 sm:gap-2.5">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                <Package className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              </div>
              <div className="min-w-0">
                <span className="text-2xl sm:text-4xl lg:text-5xl font-light text-slate-900 tracking-tight block truncate">
                  {metrics.totalOrders}
                </span>
                <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">Orders</p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-2.5 w-full sm:w-auto">
            <button
              onClick={openNewRetailerModal}
              className="h-10 sm:h-11 flex items-center justify-center gap-1.5 sm:gap-2 bg-white/90 hover:bg-white border border-[#0D4728]/30 text-[#0D4728] px-3 sm:px-5 rounded-full text-xs sm:text-sm font-semibold transition-all shadow-xs"
            >
              <Store className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>+ New Retailer</span>
            </button>
            <button
              onClick={() => openNewSaleModal()}
              className="h-10 sm:h-11 flex items-center justify-center gap-1.5 sm:gap-2 bg-[#0D4728] hover:bg-[#167a44] text-[#FFF9CD] px-3 sm:px-5 rounded-full text-xs sm:text-sm font-semibold transition-all shadow-xs hover:shadow-sm"
            >
              <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>+ Log Order</span>
            </button>
          </div>

        </div>
      </div>

      {/* 2. MAIN CARD CONTAINER (Curved Canvas) */}
      <div className="bg-white border border-slate-200/80 rounded-[24px] sm:rounded-[28px] overflow-hidden shadow-xs flex flex-col min-h-[500px]">

        {/* Search, Filter & View Mode Command Bar */}
        <div className="p-3.5 sm:p-5 border-b border-slate-100 bg-slate-50/50 space-y-3">

          {/* Top Filter Row: Search + View Toggle + Live Count */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative max-w-md w-full">
              <Search className="absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={activeTab === 'retailers' ? "Search shop name, owner, phone..." : "Search orders, owner, products..."}
                className="w-full bg-white border border-slate-200 rounded-full py-2 sm:py-2.5 pl-10 sm:pl-11 pr-9 sm:pr-10 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all shadow-2xs"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Right Controls: View Switcher (for Retailers tab) & Items Count */}
            <div className="flex items-center justify-between sm:justify-end gap-2.5 sm:gap-3.5">
              {activeTab === 'retailers' && (
                <div className="inline-flex p-0.5 sm:p-1 bg-white rounded-full border border-slate-200 shadow-2xs gap-0.5">
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs font-semibold transition-all ${
                      viewMode === 'grid'
                        ? 'bg-[#0D4728] text-[#FFF9CD] shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Grid Cards View"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>Cards</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs font-semibold transition-all ${
                      viewMode === 'table'
                        ? 'bg-[#0D4728] text-[#FFF9CD] shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Directory Table View"
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>Table</span>
                  </button>
                </div>
              )}

              <div className="text-[11px] sm:text-sm text-slate-500 font-medium whitespace-nowrap">
                Showing <span className="font-bold text-slate-900">
                  {activeTab === 'retailers' ? filteredRetailers.length : filteredSales.length}
                </span> items
              </div>
            </div>
          </div>

          {/* Territory Pills Strip */}
          {territories.length > 0 && (
            <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pt-0.5 pb-0.5 no-scrollbar">
              <span className="text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
                Territory:
              </span>
              <button
                type="button"
                onClick={() => setSelectedTerritory('all')}
                className={`px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                  selectedTerritory === 'all'
                    ? 'bg-[#0D4728] text-[#FFF9CD] shadow-2xs'
                    : 'bg-white border border-slate-200/90 text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
                }`}
              >
                All ({retailers.length})
              </button>
              {territories.map(t => {
                const count = retailers.filter(r => r.territory === t).length;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSelectedTerritory(t)}
                    className={`px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                      selectedTerritory === t
                        ? 'bg-[#0D4728] text-[#FFF9CD] shadow-2xs'
                        : 'bg-white border border-slate-200/90 text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
                    }`}
                  >
                    {t} ({count})
                  </button>
                );
              })}
            </div>
          )}

        </div>

        {/* Content Canvas */}
        <div className="p-3.5 sm:p-6 flex-1 flex flex-col">

          {/* TAB 1: RETAILERS DIRECTORY */}
          {activeTab === 'retailers' && (
            <div className="flex-1 flex flex-col">
              {isPending ? (
                viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    <RetailerCardSkeleton />
                    <RetailerCardSkeleton />
                    <RetailerCardSkeleton />
                    <RetailerCardSkeleton />
                    <RetailerCardSkeleton />
                    <RetailerCardSkeleton />
                  </div>
                ) : (
                  <div className="overflow-x-auto -mx-5 sm:-mx-6 flex-1">
                    <table className="w-full text-left border-collapse text-sm">
                      <tbody className="divide-y divide-slate-100">
                        <TableRowSkeleton columns={6} />
                        <TableRowSkeleton columns={6} />
                        <TableRowSkeleton columns={6} />
                        <TableRowSkeleton columns={6} />
                      </tbody>
                    </table>
                  </div>
                )
              ) : filteredRetailers.length === 0 ? (
                <div className="text-center py-20 text-slate-400 flex flex-col items-center justify-center my-auto">
                  <div className="w-14 h-14 rounded-2xl bg-[#0D4728]/10 text-[#0D4728] flex items-center justify-center mb-3">
                    <Store className="w-7 h-7" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-800">No retailers found</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm">
                    {searchTerm || selectedTerritory !== 'all'
                      ? 'No registered shops match your current filter criteria.'
                      : 'No retailers have been added yet. Register an authorized shop to begin tracking sales.'}
                  </p>
                  <button
                    onClick={openNewRetailerModal}
                    className="mt-4 px-4 py-2 rounded-full bg-[#0D4728] text-[#FFF9CD] text-xs font-semibold hover:bg-[#167a44] transition-all shadow-xs"
                  >
                    + Register First Retailer
                  </button>
                </div>
              ) : viewMode === 'grid' ? (
                /* ELEVATED RETAILER CARDS VIEW */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filteredRetailers.map(r => {
                    const dt = formatDateTime(r.created_at);
                    const initials = getInitials(r.shop_name);
                    const creator = getUserInfo(r.sales_person_id);

                    return (
                      <div
                        key={r.id}
                        className="p-5 sm:p-6 border border-slate-200/80 rounded-[26px] bg-gradient-to-b from-white via-white to-slate-50/40 hover:border-[#0D4728]/40 hover:shadow-[0_8px_30px_rgba(13,71,40,0.06)] transition-all group flex flex-col justify-between"
                      >
                        <div>
                          {/* Top: Monogram Avatar, Shop Name & Territory Badge */}
                          <div className="flex items-start gap-3.5 mb-3.5">
                            {/* Brand Initials Avatar */}
                            <div 
                              onClick={() => setViewingRetailer(r)}
                              className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#0D4728] to-[#1a5b36] text-[#FFF9CD] font-bold text-sm flex items-center justify-center shadow-xs shrink-0 group-hover:scale-105 transition-transform tracking-wider cursor-pointer"
                              title="Click to view full retailer details"
                            >
                              {initials}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <h4 
                                  onClick={() => setViewingRetailer(r)}
                                  className="font-bold text-slate-900 text-base group-hover:text-[#0D4728] transition-colors leading-snug truncate cursor-pointer" 
                                  title="View full profile"
                                >
                                  {r.shop_name}
                                </h4>
                                <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/70 px-2.5 py-0.5 rounded-full shrink-0">
                                  {r.territory || 'General'}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
                                <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>Owner: <strong className="text-slate-800 font-semibold">{r.name}</strong></span>
                              </p>
                            </div>
                          </div>

                          {/* Contact & Address Rows */}
                          <div className="space-y-2.5 text-xs text-slate-600 pt-3 border-t border-slate-100">
                            {/* Phone with click-to-call link */}
                            <a
                              href={`tel:${r.phone}`}
                              className="flex items-center gap-2 font-medium text-slate-700 hover:text-[#0D4728] transition-colors group/tel w-fit"
                              title={`Call ${r.phone}`}
                            >
                              <Phone className="w-3.5 h-3.5 text-slate-400 group-hover/tel:text-[#0D4728] shrink-0" />
                              <span className="font-semibold underline decoration-dotted decoration-slate-300 underline-offset-2">{r.phone}</span>
                            </a>

                            {/* Address */}
                            <p className="flex items-start gap-2 leading-relaxed">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                              <span className="line-clamp-2 text-slate-600">{r.address}</span>
                            </p>

                            {/* Exact Registration Date & Time */}
                            <p className="flex items-center gap-2 text-slate-400 pt-1">
                              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>Registered: <strong className="text-slate-700 font-semibold">{dt.full}</strong></span>
                            </p>

                            {/* Onboarded By */}
                            <div className="flex items-center gap-2 text-xs text-slate-600 pt-0.5">
                              <div className="w-5 h-5 rounded-full bg-[#0D4728]/10 text-[#0D4728] font-bold text-[9px] flex items-center justify-center shrink-0 border border-[#0D4728]/20" title={creator.role}>
                                {creator.monogram}
                              </div>
                              <span className="truncate">Onboarded by: <strong className="text-slate-800 font-semibold">{creator.name}</strong> <span className="text-[10px] text-slate-400 font-normal">({creator.role})</span></span>
                            </div>

                            {/* GPS Status Chip */}
                            {r.geo_location ? (
                              <div className="flex items-center gap-2 text-[11px] text-slate-600 bg-slate-50/90 border border-slate-200/80 rounded-xl px-3 py-1.5 mt-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                                <span className="text-slate-400 font-medium">GPS:</span>
                                <span className="font-mono text-slate-700 truncate">{r.geo_location}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 bg-slate-50/50 border border-dashed border-slate-200/80 rounded-xl px-3 py-1.5 mt-1.5">
                                <Navigation className="w-3 h-3 text-slate-300 shrink-0" />
                                <span>No GPS coordinates tagged</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Card Action Bar */}
                        <div className="pt-3.5 sm:pt-4 mt-3.5 sm:mt-4 border-t border-slate-100 flex flex-wrap sm:flex-nowrap items-center justify-between gap-1.5 sm:gap-2">
                          {/* View Profile details button */}
                          <button
                            type="button"
                            onClick={() => setViewingRetailer(r)}
                            className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full bg-slate-100 hover:bg-slate-200/70 text-slate-700 text-xs font-semibold transition-all border border-slate-200/70"
                            title="View full retailer profile"
                          >
                            Details
                          </button>

                          <div className="flex items-center gap-1.5 sm:gap-2">
                            {/* View Map Button */}
                            <button
                              type="button"
                              onClick={() => openInMaps(r.geo_location, r.address, r.shop_name)}
                              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full bg-slate-100 hover:bg-[#0D4728]/10 text-slate-700 hover:text-[#0D4728] text-xs font-semibold transition-all group/btn border border-slate-200/70"
                              title="Open on Maps"
                            >
                              <Navigation className="w-3.5 h-3.5 text-[#0D4728]" />
                              <span>Map</span>
                            </button>

                            {/* Visit (No Order) Button */}
                            <button
                              type="button"
                              onClick={() => openNoOrderModal(r)}
                              className="px-2.5 py-1.5 sm:py-2 rounded-full bg-slate-100 hover:bg-amber-50 text-slate-700 hover:text-amber-800 text-xs font-semibold transition-all border border-slate-200/70"
                              title="Mark Visit (No Order)"
                            >
                              Visit
                            </button>

                            {/* Quick Record Sale Button */}
                            <button
                              type="button"
                              onClick={() => openNewSaleModal(r.id)}
                              className="px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-full bg-[#0D4728] hover:bg-[#167a44] text-[#FFF9CD] text-xs font-semibold transition-all shadow-xs flex items-center gap-1"
                            >
                              <TrendingUp className="w-3.5 h-3.5" />
                              <span>Order</span>
                            </button>
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              ) : (
                /* ELEVATED RETAILERS DIRECTORY TABLE VIEW */
                <div className="overflow-x-auto -mx-3.5 sm:-mx-6 flex-1 px-3.5 sm:px-6">
                  <table className="w-full min-w-[720px] text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-100 font-semibold text-slate-500 uppercase tracking-wider text-xs">
                        <th className="py-4 px-6">Shop & Retailer</th>
                        <th className="py-4 px-6">Territory</th>
                        <th className="py-4 px-6">Contact & Address</th>
                        <th className="py-4 px-6">GPS / Location</th>
                        <th className="py-4 px-6">Registered Date & By</th>
                        <th className="py-4 px-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRetailers.map(r => {
                        const dt = formatDateTime(r.created_at);
                        const initials = getInitials(r.shop_name);
                        const creator = getUserInfo(r.sales_person_id);

                        return (
                          <tr key={r.id} className="hover:bg-slate-50/60 transition-colors group">
                            {/* Shop Name & Owner */}
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-3">
                                <div 
                                  onClick={() => setViewingRetailer(r)}
                                  className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0D4728] to-[#1a5b36] text-[#FFF9CD] font-bold text-xs flex items-center justify-center shadow-2xs shrink-0 cursor-pointer"
                                >
                                  {initials}
                                </div>
                                <div>
                                  <p 
                                    onClick={() => setViewingRetailer(r)}
                                    className="font-bold text-slate-900 group-hover:text-[#0D4728] transition-colors text-sm cursor-pointer"
                                  >
                                    {r.shop_name}
                                  </p>
                                  <p className="text-xs text-slate-500 flex items-center gap-1">
                                    <User className="w-3 h-3 text-slate-400" />
                                    <span>Owner: {r.name}</span>
                                  </p>
                                </div>
                              </div>
                            </td>

                            {/* Territory */}
                            <td className="py-4 px-6">
                              <span className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/70 text-xs font-semibold">
                                {r.territory || 'General'}
                              </span>
                            </td>

                            {/* Contact & Address */}
                            <td className="py-4 px-6">
                              <a
                                href={`tel:${r.phone}`}
                                className="font-semibold text-slate-800 hover:text-[#0D4728] text-xs flex items-center gap-1.5 transition-colors"
                              >
                                <Phone className="w-3.5 h-3.5 text-slate-400" />
                                <span>{r.phone}</span>
                              </a>
                              <p className="text-xs text-slate-500 line-clamp-1 max-w-xs mt-0.5">
                                {r.address}
                              </p>
                            </td>

                            {/* GPS & Map */}
                            <td className="py-4 px-6">
                              <button
                                type="button"
                                onClick={() => openInMaps(r.geo_location, r.address, r.shop_name)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-[#0D4728]/10 text-slate-700 hover:text-[#0D4728] text-xs font-semibold transition-all border border-slate-200/60"
                                title="View on Maps"
                              >
                                {r.geo_location && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                )}
                                <Navigation className="w-3 h-3 text-[#0D4728]" />
                                <span>View Map</span>
                              </button>
                            </td>

                            {/* Registered At & By */}
                            <td className="py-4 px-6">
                              <p className="text-slate-900 font-semibold text-xs">{dt.date}</p>
                              <p className="text-[11px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                                <Clock className="w-3 h-3" />
                                {dt.time}
                              </p>
                              <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-slate-100">
                                <div className="w-5 h-5 rounded-full bg-[#0D4728]/10 text-[#0D4728] font-bold text-[9px] flex items-center justify-center shrink-0 border border-[#0D4728]/20" title={`Onboarded by ${creator.name} (${creator.role})`}>
                                  {creator.monogram}
                                </div>
                                <span className="text-[11px] font-semibold text-slate-700 truncate max-w-[130px]" title={`Onboarded by ${creator.name} (${creator.role})`}>
                                  {creator.name}
                                </span>
                              </div>
                            </td>

                            {/* Action Buttons */}
                            <td className="py-4 px-6 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setViewingRetailer(r)}
                                  className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all border border-slate-200/60"
                                >
                                  Details
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openNoOrderModal(r)}
                                  className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-amber-50 text-slate-700 hover:text-amber-800 text-xs font-semibold transition-all border border-slate-200/60"
                                  title="Mark Visit (No Order)"
                                >
                                  Visit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openNewSaleModal(r.id)}
                                  className="px-3.5 py-1.5 rounded-full bg-[#0D4728] hover:bg-[#167a44] text-[#FFF9CD] text-xs font-semibold transition-all shadow-xs"
                                >
                                  + Order
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
          )}

          {/* TAB 2: SALES HISTORY TABLE & MOBILE FEED */}
          {activeTab === 'sales' && (
            <div className="flex-1 flex flex-col">
              {/* MOBILE FEED (< md) */}
              <div className="md:hidden space-y-3">
                {isPending ? (
                  <div className="space-y-3">
                    <RetailerCardSkeleton />
                    <RetailerCardSkeleton />
                    <RetailerCardSkeleton />
                  </div>
                ) : filteredSales.length === 0 ? (
                  <div className="py-16 text-center text-slate-400">
                    <ShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-40 text-slate-400" />
                    <p className="text-sm font-semibold text-slate-700">No sales records logged yet.</p>
                    <p className="text-xs text-slate-400 mt-1">Use "+ Log Order" to record an order.</p>
                  </div>
                ) : (
                  filteredSales.map(sale => {
                    const dt = formatDateTime(sale.created_at || sale.date);
                    const shopName = sale.retailers?.shop_name || 'Retailer';
                    const initials = getInitials(shopName);
                    const prodSummary = getSaleProductsSummary(sale.notes);
                    const rep = getUserInfo(sale.sales_person_id);

                    return (
                      <div
                        key={`m-${sale.id}`}
                        className="p-4 border border-slate-200/80 rounded-[22px] bg-gradient-to-b from-white via-white to-slate-50/40 shadow-2xs space-y-3"
                      >
                        {/* Header: Retailer + Total */}
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div 
                              onClick={() => sale.retailers && setViewingRetailer(sale.retailers)}
                              className="w-10 h-10 rounded-xl bg-[#0D4728]/10 text-[#0D4728] font-bold text-xs flex items-center justify-center shrink-0 cursor-pointer"
                            >
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <h4 
                                onClick={() => sale.retailers && setViewingRetailer(sale.retailers)}
                                className="font-bold text-slate-900 text-sm hover:text-[#0D4728] transition-colors truncate cursor-pointer"
                              >
                                {shopName}
                              </h4>
                              <p className="text-xs text-slate-500 truncate">
                                {sale.retailers?.name || ''} &bull; <span className="font-semibold text-slate-700">{sale.retailers?.territory || 'General'}</span>
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-bold text-slate-900 font-mono text-base block">
                              ₹{Number(sale.amount).toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>

                        {/* Products Summary */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {prodSummary ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/70 text-[11px] font-semibold">
                              <Package className="w-3 h-3 text-[#0D4728] shrink-0" />
                              <span>{prodSummary}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-medium">
                              <Package className="w-3 h-3 text-slate-400" />
                              <span>{sale.order_qty || 1} units general</span>
                            </span>
                          )}
                        </div>

                        {/* Footer: Rep, Date/Time, Settlement Badge & Map */}
                        <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#0D4728] to-[#1a5b36] text-[#FFF9CD] font-bold text-[10px] flex items-center justify-center shrink-0">
                              {rep.monogram}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold text-slate-700 truncate">{rep.name}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{dt.date} &bull; {dt.time || '12:00 PM'}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {(() => {
                              const pStatus = sale.payment_status || 'credit';
                              const cashAmt = Number(sale.cash_amount) || 0;
                              const onlineAmt = Number(sale.online_amount) || 0;
                              const paidAmt = cashAmt + onlineAmt;

                              if (pStatus === 'paid') {
                                return (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-semibold">
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                    <span>Paid ₹{paidAmt.toLocaleString('en-IN')}</span>
                                  </span>
                                );
                              }
                              if (pStatus === 'partial') {
                                return (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-[10px] font-semibold">
                                    <Wallet className="w-2.5 h-2.5 text-amber-600" />
                                    <span>₹{paidAmt.toLocaleString('en-IN')} Paid</span>
                                  </span>
                                );
                              }
                              return (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-800 text-[10px] font-semibold">
                                  <AlertCircle className="w-2.5 h-2.5 text-rose-600" />
                                  <span>Credit</span>
                                </span>
                              );
                            })()}

                            {sale.retailers && (
                              <button
                                type="button"
                                onClick={() => openInMaps(sale.retailers?.geo_location, sale.retailers?.address, sale.retailers?.shop_name)}
                                className="p-1.5 rounded-full bg-slate-100 hover:bg-[#0D4728]/10 text-slate-700 hover:text-[#0D4728] transition-colors border border-slate-200/60"
                                title="Open retailer in Maps"
                              >
                                <Navigation className="w-3.5 h-3.5 text-[#0D4728]" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* TABLET / DESKTOP TABLE (md and above) */}
              <div className="hidden md:block overflow-x-auto -mx-5 sm:-mx-6 flex-1 px-5 sm:px-6">
                <table className="w-full min-w-[850px] text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-100 font-semibold text-slate-500 uppercase tracking-wider text-xs">
                      <th className="py-4 px-6">Date & Time</th>
                      <th className="py-4 px-6">Retailer / Shop</th>
                      <th className="py-4 px-6">Booked By</th>
                      <th className="py-4 px-6">Products Booked</th>
                      <th className="py-4 px-6">Territory</th>
                      <th className="py-4 px-6">Order Total</th>
                      <th className="py-4 px-6">Payment Settlement</th>
                      <th className="py-4 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {isPending ? (
                      <>
                        <TableRowSkeleton columns={8} />
                        <TableRowSkeleton columns={8} />
                        <TableRowSkeleton columns={8} />
                        <TableRowSkeleton columns={8} />
                      </>
                    ) : filteredSales.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-20 text-center text-slate-400">
                          <ShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-40 text-slate-400" />
                          <p className="text-sm font-semibold text-slate-700">No sales records logged yet.</p>
                          <p className="text-xs text-slate-400 mt-1">Use "+ Record Sale" to submit a field transaction.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredSales.map(sale => {
                        const dt = formatDateTime(sale.created_at || sale.date);
                        const shopName = sale.retailers?.shop_name || 'Retailer';
                        const initials = getInitials(shopName);
                        const prodSummary = getSaleProductsSummary(sale.notes);
                        const rep = getUserInfo(sale.sales_person_id);

                        return (
                          <tr key={sale.id} className="hover:bg-slate-50/60 transition-colors group">
                            {/* Date & Time */}
                            <td className="py-4 px-6">
                              <p className="text-slate-900 font-bold text-sm">
                                {dt.date}
                              </p>
                              <p className="text-xs text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                                <Clock className="w-3.5 h-3.5 text-slate-400" />
                                {dt.time || '12:00 PM'}
                              </p>
                            </td>

                            {/* Retailer Info */}
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-3">
                                <div 
                                  onClick={() => sale.retailers && setViewingRetailer(sale.retailers)}
                                  className="w-9 h-9 rounded-xl bg-[#0D4728]/10 text-[#0D4728] font-bold text-xs flex items-center justify-center shrink-0 cursor-pointer"
                                >
                                  {initials}
                                </div>
                                <div>
                                  <p 
                                    onClick={() => sale.retailers && setViewingRetailer(sale.retailers)}
                                    className="text-slate-900 font-semibold text-sm group-hover:text-[#0D4728] transition-colors cursor-pointer"
                                  >
                                    {shopName}
                                  </p>
                                  <p className="text-xs text-slate-500">{sale.retailers?.name || ''}</p>
                                </div>
                              </div>
                            </td>

                            {/* Booked By / Sales Rep */}
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#0D4728] to-[#1a5b36] text-[#FFF9CD] font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                                  {rep.monogram}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-bold text-slate-900 text-xs truncate max-w-[130px]">{rep.name}</p>
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-semibold uppercase tracking-wider">
                                    {rep.role}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Products Booked Breakdown */}
                            <td className="py-4 px-6">
                              {prodSummary ? (
                                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/70 text-xs font-semibold">
                                  <Package className="w-3.5 h-3.5 text-[#0D4728] shrink-0" />
                                  <span>{prodSummary}</span>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium">
                                  <Package className="w-3 h-3 text-slate-400" />
                                  <span>{sale.order_qty || 1} units general</span>
                                </div>
                              )}
                            </td>

                            {/* Territory */}
                            <td className="py-4 px-6">
                              <span className="inline-flex items-center px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                                {sale.retailers?.territory || 'General'}
                              </span>
                            </td>

                            {/* Order Total Amount */}
                            <td className="py-4 px-6">
                              <span className="font-bold text-slate-900 font-mono text-sm">
                                ₹{Number(sale.amount).toLocaleString('en-IN')}
                              </span>
                            </td>

                            {/* Payment Settlement Status */}
                            <td className="py-4 px-6">
                              {(() => {
                                const pStatus = sale.payment_status || 'credit';
                                const cashAmt = Number(sale.cash_amount) || 0;
                                const onlineAmt = Number(sale.online_amount) || 0;
                                const paidAmt = cashAmt + onlineAmt;
                                const totalAmt = Number(sale.amount) || 0;
                                const dueAmt = sale.due_amount !== undefined && sale.due_amount !== null 
                                  ? Number(sale.due_amount) 
                                  : Math.max(0, totalAmt - paidAmt);

                                if (pStatus === 'paid') {
                                  return (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                      <span>Paid ₹{paidAmt.toLocaleString('en-IN')}</span>
                                    </span>
                                  );
                                }
                                if (pStatus === 'partial') {
                                  return (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold">
                                      <Wallet className="w-3 h-3 text-amber-600" />
                                      <span>₹{paidAmt.toLocaleString('en-IN')} Paid • ₹{dueAmt.toLocaleString('en-IN')} Due</span>
                                    </span>
                                  );
                                }
                                return (
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                                    <AlertCircle className="w-3 h-3 text-rose-600" />
                                    <span>Credit Due ₹{totalAmt.toLocaleString('en-IN')}</span>
                                  </span>
                                );
                              })()}
                            </td>

                            {/* Action / Map Shortcut */}
                            <td className="py-4 px-6 text-right">
                              {sale.retailers && (
                                <button
                                  type="button"
                                  onClick={() => openInMaps(sale.retailers?.geo_location, sale.retailers?.address, sale.retailers?.shop_name)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-[#0D4728]/10 text-slate-700 hover:text-[#0D4728] text-xs font-semibold transition-all border border-slate-200/60"
                                  title="Open retailer in Maps"
                                >
                                  <Navigation className="w-3 h-3 text-[#0D4728]" />
                                  <span>Map</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

      </div>

      {/* 3. NEW RETAILER REGISTRATION MODAL (Read-Only Auto Timestamp Lock) */}
      {isRetailerModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-3 sm:p-4">
          <div className="bg-white rounded-[24px] sm:rounded-[32px] w-full max-w-lg shadow-2xl border border-white/80 overflow-hidden max-h-[92dvh] sm:max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">

            {/* Header */}
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-[#0D4728] text-[#FFF9CD] flex items-center justify-center shadow-xs shrink-0">
                  <Store className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">Add New Retailer</h3>
                  <p className="text-[11px] sm:text-xs text-slate-500">Register shop with live GPS tagging & timestamp lock</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsRetailerModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateRetailer} className="p-4 sm:p-6 space-y-3.5 sm:space-y-4 overflow-y-auto flex-1">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200/80 text-red-600 text-xs sm:text-sm rounded-2xl font-medium animate-in fade-in">
                  {error}
                </div>
              )}

              {/* Creator Audit Info */}
              <div className="flex items-center justify-between p-2.5 sm:p-3 bg-slate-50 border border-slate-200/70 rounded-2xl text-[11px] sm:text-xs">
                <span className="text-slate-500 font-medium">Registering Rep:</span>
                <span className="font-bold text-slate-800 flex items-center gap-1.5 truncate max-w-[200px] sm:max-w-none">
                  <User className="w-3.5 h-3.5 text-[#0D4728] shrink-0" />
                  <span className="truncate">{currentUserName}</span>
                  <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-500 bg-slate-200/70 px-1.5 py-0.5 rounded shrink-0">
                    {currentUserRole}
                  </span>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-1 sm:space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Owner Name *</label>
                  <input
                    type="text"
                    required
                    value={rName}
                    onChange={(e) => setRName(e.target.value)}
                    placeholder="e.g. Ramesh Gogoi"
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-full py-2 sm:py-2.5 px-3.5 sm:px-4 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all"
                  />
                </div>
                <div className="space-y-1 sm:space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Shop Name *</label>
                  <input
                    type="text"
                    required
                    value={rShop}
                    onChange={(e) => setRShop(e.target.value)}
                    placeholder="e.g. Assam Tea Depot"
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-full py-2 sm:py-2.5 px-3.5 sm:px-4 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1 sm:space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Full Address *</label>
                <input
                  type="text"
                  required
                  value={rAddress}
                  onChange={(e) => setRAddress(e.target.value)}
                  placeholder="e.g. Daily Market Road, Tinsukia"
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-full py-2 sm:py-2.5 px-3.5 sm:px-4 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-1 sm:space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={rPhone}
                    onChange={(e) => setRPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-full py-2 sm:py-2.5 px-3.5 sm:px-4 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all"
                  />
                </div>
                <div className="space-y-1 sm:space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Territory *</label>
                  <input
                    type="text"
                    required
                    value={rTerritory}
                    onChange={(e) => setRTerritory(e.target.value)}
                    placeholder="e.g. Tinsukia Central"
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-full py-2 sm:py-2.5 px-3.5 sm:px-4 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all"
                  />
                </div>
              </div>

              {/* Exact Date & Time: READ-ONLY AUTO-LOCK */}
              <div className="space-y-1 sm:space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span>Registration Timestamp</span>
                  <span className="text-[10px] sm:text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 sm:px-2.5 py-0.5 rounded-full font-medium">Automatic Lock</span>
                </label>
                <div className="w-full bg-slate-50 border border-slate-200 rounded-full py-2 sm:py-2.5 px-3.5 sm:px-4 text-xs sm:text-sm text-slate-700 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#0D4728] shrink-0" />
                  <span className="font-semibold text-slate-800">{liveTimestamp || 'System time locking...'}</span>
                  <span className="text-xs text-slate-400 font-mono ml-auto hidden sm:inline">Automatic</span>
                </div>
              </div>

              {/* GPS Location Section with Live Permission Fetch */}
              <div className="space-y-2 pt-0.5 sm:pt-1">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 truncate">
                    <Navigation className="w-3.5 h-3.5 text-[#0D4728] shrink-0" />
                    <span className="truncate">GPS Coordinates</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => requestBrowserLocation(false)}
                    disabled={geoStatus === 'requesting'}
                    className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 bg-slate-100 hover:bg-[#0D4728]/10 text-slate-700 hover:text-[#0D4728] rounded-full text-[11px] sm:text-xs font-semibold transition-colors disabled:opacity-50 shrink-0"
                  >
                    {geoStatus === 'requesting' ? (
                      <Loader2 className="w-3 h-3 animate-spin text-[#0D4728]" />
                    ) : (
                      <Crosshair className="w-3 h-3 text-[#0D4728]" />
                    )}
                    <span>{geoStatus === 'requesting' ? 'Acquiring...' : 'Get Current GPS'}</span>
                  </button>
                </div>

                <input
                  type="text"
                  value={rGeoLocation}
                  onChange={(e) => setRGeoLocation(e.target.value)}
                  placeholder="e.g. 27.502360, 95.362100"
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-full py-2 sm:py-2.5 px-3.5 sm:px-4 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all font-mono"
                />

                {/* Status Feedback Banners */}
                {geoStatus === 'requesting' && (
                  <div className="p-2.5 sm:p-3 bg-amber-50 border border-amber-200/80 rounded-2xl text-xs text-amber-800 flex items-center gap-2 animate-in fade-in">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600 shrink-0" />
                    <span>Requesting browser location... Please click <strong>"Allow"</strong> when prompted.</span>
                  </div>
                )}

                {geoStatus === 'success' && (
                  <div className="p-2.5 sm:p-3 bg-emerald-50 border border-emerald-200/80 rounded-2xl text-xs text-emerald-800 flex items-center gap-2 animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="truncate">GPS tagged: <strong>{rGeoLocation}</strong></span>
                  </div>
                )}

                {geoStatus === 'error' && (
                  <div className="p-2.5 sm:p-3 bg-rose-50 border border-rose-200/80 rounded-2xl text-xs text-rose-700 flex items-start gap-2 animate-in fade-in">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold">{geoErrorMsg}</p>
                      <p className="text-[11px] text-rose-600/80 mt-0.5">You can enter coordinates manually or leave blank to navigate by street address.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3.5 sm:pt-4 flex items-center justify-end gap-2 sm:gap-2.5 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsRetailerModalOpen(false)}
                  className="px-4 sm:px-5 py-2 sm:py-2.5 text-slate-600 hover:bg-slate-100 rounded-full text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex items-center gap-2 bg-[#0D4728] hover:bg-[#167a44] text-[#FFF9CD] px-5 sm:px-6 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all disabled:opacity-50 shadow-xs"
                >
                  {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Register Retailer</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. RETAILER FULL PROFILE MODAL (Displays newly registered or selected retailer full data + Edit & Log Order) */}
      {viewingRetailer && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-3 sm:p-4">
          <div className="bg-white rounded-[24px] sm:rounded-[32px] w-full max-w-lg shadow-2xl border border-white/80 overflow-hidden max-h-[92dvh] sm:max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">

            {/* Header Banner */}
            <div className="bg-gradient-to-r from-[#0D4728] to-[#1a5b36] p-4 sm:p-6 text-[#FFF9CD] flex items-start justify-between relative overflow-hidden shrink-0">
              <div className="flex items-center gap-3 sm:gap-4 relative z-10 min-w-0 pr-2">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/15 backdrop-blur-md text-[#FFF9CD] font-bold text-lg sm:text-xl flex items-center justify-center border border-white/20 shadow-sm shrink-0">
                  {getInitials(viewingRetailer.shop_name)}
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg sm:text-xl font-bold leading-tight truncate">{viewingRetailer.shop_name}</h3>
                  <p className="text-xs text-[#FFF9CD]/80 flex items-center gap-1.5 mt-0.5 truncate">
                    <User className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Owner: <strong>{viewingRetailer.name}</strong></span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setViewingRetailer(null)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-[#FFF9CD] flex items-center justify-center transition-colors relative z-10 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Full Retailer Details Area */}
            <div className="p-4 sm:p-6 space-y-3.5 sm:space-y-4 overflow-y-auto flex-1">
              {/* Creator / Onboarded By */}
              {(() => {
                const creator = getUserInfo(viewingRetailer.sales_person_id);
                return (
                  <div className="p-3 sm:p-3.5 bg-emerald-50/60 rounded-2xl border border-emerald-100/80 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                      <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-[#0D4728] to-[#1a5b36] text-[#FFF9CD] font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                        {creator.monogram}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] sm:text-[10px] font-bold text-emerald-800/80 uppercase tracking-wider truncate">Onboarded / Registered By</p>
                        <p className="font-bold text-slate-900 text-xs sm:text-sm leading-tight truncate">{creator.name}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold px-2 sm:px-2.5 py-0.5 rounded-full bg-white text-emerald-800 border border-emerald-200 capitalize shadow-2xs shrink-0">
                      {creator.role}
                    </span>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                <div className="p-3 sm:p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Territory</p>
                  <p className="font-bold text-slate-900 text-xs sm:text-sm mt-0.5 truncate">{viewingRetailer.territory || 'General'}</p>
                </div>
                <div className="p-3 sm:p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Registration</p>
                  <p className="font-semibold text-slate-800 text-[11px] sm:text-xs mt-0.5 truncate">
                    {formatDateTime(viewingRetailer.created_at).date}
                  </p>
                </div>
              </div>

              <div className="space-y-2.5 sm:space-y-3 pt-0.5 text-xs sm:text-sm text-slate-700">
                {/* Phone */}
                <div className="flex items-center justify-between p-2.5 sm:p-3 bg-slate-50/80 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                    <Phone className="w-4 h-4 text-[#0D4728] shrink-0" />
                    <span className="font-semibold text-slate-900 truncate">{viewingRetailer.phone}</span>
                  </div>
                  <a
                    href={`tel:${viewingRetailer.phone}`}
                    className="px-3 py-1 rounded-full bg-[#0D4728]/10 text-[#0D4728] text-xs font-semibold hover:bg-[#0D4728]/20 transition-colors shrink-0"
                  >
                    Call Now
                  </a>
                </div>

                {/* Address */}
                <div className="p-2.5 sm:p-3 bg-slate-50/80 rounded-2xl border border-slate-100 space-y-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <MapPin className="w-3.5 h-3.5 text-[#0D4728] shrink-0" />
                    <span>Shop Address</span>
                  </div>
                  <p className="text-slate-800 text-xs sm:text-sm pl-5 leading-relaxed">{viewingRetailer.address}</p>
                </div>

                {/* GPS Location Tag */}
                <div className="p-2.5 sm:p-3 bg-slate-50/80 rounded-2xl border border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-mono min-w-0">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <span className="text-slate-500 font-sans font-medium shrink-0">GPS:</span>
                    <span className="text-slate-900 font-bold truncate">
                      {viewingRetailer.geo_location || 'Not tagged'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => openInMaps(viewingRetailer.geo_location, viewingRetailer.address, viewingRetailer.shop_name)}
                    className="px-2.5 sm:px-3 py-1 rounded-full bg-slate-200/70 hover:bg-[#0D4728]/10 text-slate-800 hover:text-[#0D4728] text-xs font-semibold transition-colors flex items-center gap-1 shrink-0"
                  >
                    <Navigation className="w-3 h-3 text-[#0D4728]" />
                    <span>Map</span>
                  </button>
                </div>
              </div>

              {/* Action Buttons: Edit Retailer + Log Order */}
              <div className="pt-3.5 sm:pt-4 mt-2 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const r = viewingRetailer;
                    setViewingRetailer(null);
                    openEditRetailerModal(r);
                  }}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-2 sm:py-2.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all border border-slate-200/80 order-3 sm:order-1"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit Details</span>
                </button>

                <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 order-1 sm:order-2">
                  <button
                    type="button"
                    onClick={() => {
                      const r = viewingRetailer;
                      setViewingRetailer(null);
                      openNoOrderModal(r);
                    }}
                    className="flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold transition-all border border-amber-200/80"
                    title="Mark field visit without order"
                  >
                    <ClipboardList className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span className="truncate">Visit (No Order)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const id = viewingRetailer.id;
                      setViewingRetailer(null);
                      openNewSaleModal(id);
                    }}
                    className="flex items-center justify-center gap-1.5 sm:gap-2 bg-[#0D4728] hover:bg-[#167a44] text-[#FFF9CD] px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs font-semibold transition-all shadow-xs"
                  >
                    <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                    <span>+ Log Order</span>
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* 5. EDIT RETAILER MODAL */}
      {isEditRetailerModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-3 sm:p-4">
          <div className="bg-white rounded-[24px] sm:rounded-[32px] w-full max-w-lg shadow-2xl border border-white/80 overflow-hidden max-h-[92dvh] sm:max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">

            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-[#0D4728]/10 text-[#0D4728] flex items-center justify-center shrink-0">
                  <Edit2 className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">Edit Retailer</h3>
                  <p className="text-[11px] sm:text-xs text-slate-500">Update shop details, territory, and GPS tag</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsEditRetailerModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateRetailer} className="p-4 sm:p-6 space-y-3.5 sm:space-y-4 overflow-y-auto flex-1">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-xs sm:text-sm rounded-2xl font-medium">
                  {error}
                </div>
              )}

              {/* Creator Audit Info */}
              {(() => {
                const currentEditing = retailers.find((r: any) => r.id === editId);
                if (!currentEditing?.sales_person_id) return null;
                const creator = getUserInfo(currentEditing.sales_person_id);
                return (
                  <div className="flex items-center justify-between p-2.5 sm:p-3 bg-slate-50 border border-slate-200/70 rounded-2xl text-[11px] sm:text-xs">
                    <span className="text-slate-500 font-medium">Originally Onboarded By:</span>
                    <span className="font-bold text-slate-800 flex items-center gap-1.5 truncate max-w-[200px] sm:max-w-none">
                      <User className="w-3.5 h-3.5 text-[#0D4728] shrink-0" />
                      <span className="truncate">{creator.name}</span>
                      <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-500 bg-slate-200/70 px-1.5 py-0.5 rounded shrink-0">
                        {creator.role}
                      </span>
                    </span>
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-1 sm:space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Owner Name *</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-full py-2 sm:py-2.5 px-3.5 sm:px-4 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all"
                  />
                </div>
                <div className="space-y-1 sm:space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Shop Name *</label>
                  <input
                    type="text"
                    required
                    value={editShop}
                    onChange={(e) => setEditShop(e.target.value)}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-full py-2 sm:py-2.5 px-3.5 sm:px-4 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1 sm:space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Full Address *</label>
                <input
                  type="text"
                  required
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-full py-2 sm:py-2.5 px-3.5 sm:px-4 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-1 sm:space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-full py-2 sm:py-2.5 px-3.5 sm:px-4 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all"
                  />
                </div>
                <div className="space-y-1 sm:space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Territory *</label>
                  <input
                    type="text"
                    required
                    value={editTerritory}
                    onChange={(e) => setEditTerritory(e.target.value)}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-full py-2 sm:py-2.5 px-3.5 sm:px-4 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all"
                  />
                </div>
              </div>

              {/* GPS Update */}
              <div className="space-y-2 pt-0.5 sm:pt-1">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 truncate">
                    <Navigation className="w-3.5 h-3.5 text-[#0D4728] shrink-0" />
                    <span className="truncate">GPS Coordinates</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => requestBrowserLocation(true)}
                    disabled={editGeoStatus === 'requesting'}
                    className="flex items-center gap-1 px-2.5 sm:px-3 py-1 bg-slate-100 hover:bg-[#0D4728]/10 text-slate-700 hover:text-[#0D4728] rounded-full text-[11px] sm:text-xs font-semibold transition-colors shrink-0"
                  >
                    {editGeoStatus === 'requesting' ? (
                      <Loader2 className="w-3 h-3 animate-spin text-[#0D4728]" />
                    ) : (
                      <Crosshair className="w-3 h-3 text-[#0D4728]" />
                    )}
                    <span>{editGeoStatus === 'requesting' ? 'Acquiring...' : 'Get Current GPS'}</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={editGeoLocation}
                  onChange={(e) => setEditGeoLocation(e.target.value)}
                  placeholder="e.g. 27.502360, 95.362100"
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-full py-2 sm:py-2.5 px-3.5 sm:px-4 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all font-mono"
                />
              </div>

              <div className="pt-3.5 sm:pt-4 flex items-center justify-end gap-2 sm:gap-2.5 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsEditRetailerModalOpen(false)}
                  className="px-4 sm:px-5 py-2 sm:py-2.5 text-slate-600 hover:bg-slate-100 rounded-full text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex items-center gap-2 bg-[#0D4728] hover:bg-[#167a44] text-[#FFF9CD] px-5 sm:px-6 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all disabled:opacity-50 shadow-xs"
                >
                  {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. MULTI-PRODUCT LOG ORDER MODAL */}
      {isSalesModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-3 sm:p-4">
          <div className="bg-white rounded-[24px] sm:rounded-[32px] w-full max-w-xl shadow-2xl border border-white/80 overflow-hidden max-h-[92dvh] sm:max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">

            {/* Header */}
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-[#0D4728] text-[#FFF9CD] flex items-center justify-center shadow-xs shrink-0">
                  <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">Log Order (Multi-Product)</h3>
                  <p className="text-[11px] sm:text-xs text-slate-500">Book field sales order with flexible categories & quantities</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsSalesModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSale} className="p-4 sm:p-6 space-y-3.5 sm:space-y-4 overflow-y-auto flex-1">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200/80 text-red-600 text-xs sm:text-sm rounded-2xl font-medium animate-in fade-in">
                  {error}
                </div>
              )}

              {/* Booking Rep Audit Info */}
              <div className="flex items-center justify-between p-2.5 sm:p-3 bg-slate-50 border border-slate-200/70 rounded-2xl text-[11px] sm:text-xs">
                <span className="text-slate-500 font-medium">Booking Rep:</span>
                <span className="font-bold text-slate-800 flex items-center gap-1.5 truncate max-w-[200px] sm:max-w-none">
                  <User className="w-3.5 h-3.5 text-[#0D4728] shrink-0" />
                  <span className="truncate">{currentUserName}</span>
                  <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-500 bg-slate-200/70 px-1.5 py-0.5 rounded shrink-0">
                    {currentUserRole}
                  </span>
                </span>
              </div>

              {/* Retailer Selection */}
              <div className="space-y-1 sm:space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Select Retailer Shop *</label>
                <select
                  required
                  value={sRetailerId}
                  onChange={(e) => setSRetailerId(e.target.value)}
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-full py-2 sm:py-2.5 px-3.5 sm:px-4 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all"
                >
                  <option value="" disabled>Choose authorized retailer...</option>
                  {retailers.map(r => (
                    <option key={r.id} value={r.id}>{r.shop_name} ({r.name} - {r.territory || 'General'})</option>
                  ))}
                </select>
              </div>

              {/* Informative Category Selection Callout */}
              <div className="p-2.5 sm:p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-2xl text-xs text-emerald-900 flex items-start gap-2 sm:gap-2.5 leading-relaxed">
                <Sparkles className="w-4 h-4 text-[#0D4728] shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-[#0D4728]">High-Level Product Categories</p>
                  <p className="text-[11px] text-emerald-800 mt-0.5">
                    Select categories like <strong>Tea</strong>, <strong>Sauces</strong>, <strong>Soya Chunks</strong>. You do not need to choose exact variants or sub-SKUs at this booking stage.
                  </p>
                </div>
              </div>

              {/* Multi-Products Line Items */}
              <div className="space-y-2.5 sm:space-y-3 pt-0.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-[#0D4728] shrink-0" />
                    <span>Order Products ({orderItems.length})</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleAddOrderItem}
                    className="flex items-center gap-1 px-2.5 sm:px-3 py-1 bg-[#0D4728]/10 hover:bg-[#0D4728]/20 text-[#0D4728] rounded-full text-[11px] sm:text-xs font-semibold transition-colors shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Product</span>
                  </button>
                </div>

                <div className="space-y-2 sm:space-y-2.5">
                  {orderItems.map((item) => (
                    <div 
                      key={item.id} 
                      className="p-2.5 sm:p-3 bg-slate-50/80 border border-slate-200/90 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5 animate-in fade-in"
                    >
                      {/* Product Category dropdown */}
                      <div className="flex-1 min-w-[130px]">
                        <select
                          value={item.category}
                          onChange={(e) => handleUpdateOrderItem(item.id, 'category', e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20"
                        >
                          {availableCategories.map((c: any) => (
                            <option key={c.id || c.name} value={c.name}>
                              {c.name} {c.unit ? `(${c.unit})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Quantity Input + Delete Button on Mobile */}
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          required
                          value={item.quantity}
                          onChange={(e) => handleUpdateOrderItem(item.id, 'quantity', e.target.value)}
                          placeholder="e.g. 50 kg, 1 ton, 25 bags"
                          className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20"
                        />
                        {orderItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveOrderItem(item.id)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors shrink-0"
                            title="Remove product"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Order Total Value Field */}
              <div className="space-y-1 sm:space-y-1.5 pt-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span>Order Total Value (₹) *</span>
                  <span className="text-[11px] text-slate-400">Total invoice / booking amount</span>
                </label>
                <div className="relative">
                  <div className="absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</div>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={sAmount}
                    onChange={(e) => setSAmount(e.target.value)}
                    placeholder="25,000"
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-full py-2 sm:py-2.5 pl-8 sm:pl-9 pr-4 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all font-mono font-semibold"
                  />
                </div>
              </div>

              {/* 4. Payment Collection & Credit Settlement */}
              <div className="p-3 sm:p-4 rounded-2xl bg-slate-50/90 border border-slate-200/90 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5 text-[#0D4728] shrink-0" />
                      <span>Payment Received on Spot?</span>
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">Toggle whether retailer paid or if this order is on credit</p>
                  </div>

                  {/* Toggle Pills */}
                  <div className="grid grid-cols-2 sm:inline-flex p-1 bg-slate-200/70 rounded-full text-xs font-semibold shrink-0 gap-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setHasPaymentReceived(false);
                        setSCashAmount('');
                        setSOnlineAmount('');
                      }}
                      className={`px-3 py-1 rounded-full text-center transition-all text-xs ${
                        !hasPaymentReceived 
                          ? 'bg-rose-600 text-white shadow-xs' 
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      No (Credit)
                    </button>
                    <button
                      type="button"
                      onClick={() => setHasPaymentReceived(true)}
                      className={`px-3 py-1 rounded-full text-center transition-all text-xs ${
                        hasPaymentReceived 
                          ? 'bg-[#0D4728] text-[#FFF9CD] shadow-xs' 
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Yes (Paid)
                    </button>
                  </div>
                </div>

                {/* Cash & Online Split Inputs */}
                {hasPaymentReceived && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 pt-2 border-t border-slate-200/60 animate-in fade-in duration-150">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
                        <Banknote className="w-3 h-3 text-[#0D4728] shrink-0" />
                        <span>Cash Collected (₹)</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={sCashAmount}
                          onChange={(e) => setSCashAmount(e.target.value)}
                          placeholder="0"
                          className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-7 pr-3 text-xs sm:text-sm font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
                        <CreditCard className="w-3 h-3 text-[#0D4728] shrink-0" />
                        <span>Online UPI / Bank (₹)</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={sOnlineAmount}
                          onChange={(e) => setSOnlineAmount(e.target.value)}
                          placeholder="0"
                          className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-7 pr-3 text-xs sm:text-sm font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Automated Real-time Market Credit Calculation */}
                {(() => {
                  const tot = parseFloat(sAmount) || 0;
                  const cVal = hasPaymentReceived ? (parseFloat(sCashAmount) || 0) : 0;
                  const oVal = hasPaymentReceived ? (parseFloat(sOnlineAmount) || 0) : 0;
                  const paid = cVal + oVal;
                  const due = Math.max(0, tot - paid);

                  return (
                    <div className="p-2.5 sm:p-3 bg-white rounded-xl border border-slate-200/70 flex items-center justify-between text-xs font-medium">
                      <span className="text-slate-500">Auto Market Credit:</span>
                      <div className="text-right">
                        <span className={`font-mono font-bold text-xs sm:text-sm ${due > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                          ₹{due.toLocaleString('en-IN')}
                        </span>
                        {due === 0 && tot > 0 && (
                          <span className="ml-1.5 text-[10px] sm:text-[11px] font-semibold text-emerald-600">(Settled)</span>
                        )}
                        {due > 0 && paid > 0 && (
                          <span className="ml-1.5 text-[10px] sm:text-[11px] font-semibold text-amber-600">(Partial)</span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Order Date Stamp Badge */}
              <div className="p-2.5 sm:p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-1.5 font-medium">
                  <Clock className="w-3.5 h-3.5 text-[#0D4728] shrink-0" />
                  <span>Order Timestamp:</span>
                </div>
                <span className="font-semibold text-slate-800 text-[11px] sm:text-xs truncate">{liveTimestamp}</span>
              </div>

              <div className="pt-3.5 sm:pt-4 flex items-center justify-end gap-2 sm:gap-2.5 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsSalesModalOpen(false)}
                  className="px-4 sm:px-5 py-2 sm:py-2.5 text-slate-600 hover:bg-slate-100 rounded-full text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex items-center gap-2 bg-[#0D4728] hover:bg-[#167a44] text-[#FFF9CD] px-5 sm:px-6 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all disabled:opacity-50 shadow-xs"
                >
                  {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Confirm Order Entry</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. NO-ORDER VISIT LOGGING MODAL */}
      {isNoOrderModalOpen && noOrderRetailer && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-3 sm:p-4">
          <div className="bg-white rounded-[24px] sm:rounded-[32px] w-full max-w-lg shadow-2xl border border-white/80 overflow-hidden max-h-[92dvh] sm:max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            
            {/* Header */}
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0">
                  <ClipboardList className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">Mark Retailer Visit (No Order)</h3>
                  <p className="text-[11px] sm:text-xs text-slate-500">Record verification of field presence at retailer</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsNoOrderModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleLogNoOrderVisit} className="p-4 sm:p-6 space-y-3.5 sm:space-y-4 overflow-y-auto flex-1">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200/80 text-red-600 text-xs sm:text-sm rounded-2xl font-medium animate-in fade-in">
                  {error}
                </div>
              )}

              {/* Field Agent Audit Info */}
              <div className="flex items-center justify-between p-2.5 sm:p-3 bg-slate-50 border border-slate-200/70 rounded-2xl text-[11px] sm:text-xs">
                <span className="text-slate-500 font-medium">Visiting Field Agent:</span>
                <span className="font-bold text-slate-800 flex items-center gap-1.5 truncate max-w-[200px] sm:max-w-none">
                  <User className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="truncate">{currentUserName}</span>
                  <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-500 bg-slate-200/70 px-1.5 py-0.5 rounded shrink-0">
                    {currentUserRole}
                  </span>
                </span>
              </div>

              {/* Retailer Info Banner */}
              <div className="p-3 sm:p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-bold text-slate-900 text-xs sm:text-sm truncate">{noOrderRetailer.shop_name}</h4>
                  <span className="text-[10px] sm:text-[11px] font-semibold bg-slate-200/80 text-slate-700 px-2 sm:px-2.5 py-0.5 rounded-full shrink-0">
                    {noOrderRetailer.territory || 'General'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 flex items-center gap-1.5 truncate">
                  <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{noOrderRetailer.name} • {noOrderRetailer.phone}</span>
                </p>
                <p className="text-xs text-slate-500 flex items-center gap-1.5 pt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{noOrderRetailer.address}</span>
                </p>
              </div>

              {/* Reason for No Order */}
              <div className="space-y-1 sm:space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Reason for No Order *</label>
                <select
                  required
                  value={noOrderReason}
                  onChange={(e) => setNoOrderReason(e.target.value)}
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-full py-2 sm:py-2.5 px-3.5 sm:px-4 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all"
                >
                  <option value="Sufficient Stock">Sufficient Stock (Has enough tea/products)</option>
                  <option value="Owner / Decision Maker Absent">Owner / Decision Maker Absent</option>
                  <option value="Credit Dispute / Outstanding Payment Issue">Credit Dispute / Payment Issue</option>
                  <option value="Competitor Stocked">Competitor Stocked Recently</option>
                  <option value="Shop Temporarily Closed">Shop Temporarily Closed</option>
                  <option value="Other">Other / Follow-up Scheduled</option>
                </select>
              </div>

              {/* Visit Notes */}
              <div className="space-y-1 sm:space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Field Notes / Follow-up Date</label>
                <textarea
                  rows={2}
                  value={noOrderNotes}
                  onChange={(e) => setNoOrderNotes(e.target.value)}
                  placeholder="e.g. Owner asked to visit on Thursday after festival stock clears..."
                  className="w-full bg-slate-50/70 border border-slate-200 rounded-2xl p-2.5 sm:p-3 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0D4728]/20 focus:border-[#0D4728] transition-all resize-none"
                />
              </div>

              {/* GPS Location Tagging */}
              <div className="space-y-1 sm:space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-slate-700 truncate">Audit GPS Location</label>
                  <button
                    type="button"
                    onClick={requestNoOrderLocation}
                    disabled={noOrderGeoStatus === 'requesting'}
                    className="text-[11px] font-semibold text-[#0D4728] hover:underline flex items-center gap-1 shrink-0"
                  >
                    <Crosshair className={`w-3 h-3 ${noOrderGeoStatus === 'requesting' ? 'animate-spin' : ''}`} />
                    <span>{noOrderGeoStatus === 'requesting' ? 'Locking GPS...' : 'Fetch Live GPS'}</span>
                  </button>
                </div>
                <div className="relative">
                  <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    readOnly
                    value={noOrderGeo || 'Click "Fetch Live GPS" to verify visit location'}
                    className="w-full bg-slate-50/70 border border-slate-200 rounded-full py-2 sm:py-2.5 pl-9 sm:pl-10 pr-4 text-xs font-mono text-slate-700 focus:outline-none"
                  />
                </div>
              </div>

              {/* Timestamp Stamp */}
              <div className="p-2.5 sm:p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-1.5 font-medium">
                  <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Visit Timestamp:</span>
                </div>
                <span className="font-semibold text-slate-800 text-[11px] sm:text-xs truncate">{liveTimestamp}</span>
              </div>

              {/* Modal Actions */}
              <div className="pt-3 sm:pt-3.5 flex items-center justify-end gap-2 sm:gap-2.5 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsNoOrderModalOpen(false)}
                  className="px-4 sm:px-5 py-2 sm:py-2.5 text-slate-600 hover:bg-slate-100 rounded-full text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex items-center gap-2 bg-[#0D4728] hover:bg-[#167a44] text-[#FFF9CD] px-5 sm:px-6 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all disabled:opacity-50 shadow-xs"
                >
                  {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Record Visit</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
