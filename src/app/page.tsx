"use client";
// @ts-nocheck

import React, { useState, useMemo, useEffect } from 'react';
import InventoryModule from "@/components/modules/InventoryModule";
import BlendModule from "@/components/modules/BlendModule";
import ProcessModule from "@/components/modules/ProcessModule";
import HistoryModule from "@/components/modules/HistoryModule";

import { signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';

// Import our local initialized Firebase instances
import { auth, db } from '../lib/firebase';
import { User } from 'firebase/auth';
import { CatalogProduct, LooseLot, BlendProcess, HistoryRecord, SystemUser } from '@/types';
import Image from 'next/image';
import ConfirmModal from '@/components/ui/ConfirmModal';
import DeleteModal from '@/components/ui/DeleteModal';
import Login from '@/components/Login';
import UserManagementModule from '../components/modules/UserManagementModule';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';


import { 
  PackagePlus, 
  Warehouse, 
  Coffee, 
  Settings2, 
  History, 
  Search, 
  Filter, 
  Check, 
  Printer, 
  Combine,
  Plus,
  Trash2,
  Boxes,
  ArrowRight,
  TrendingDown,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Smartphone,
  Cloud,
  Shield,
  Download,
  Clock,
  Network,
  ArrowDown,
  Menu,
  X,
  Edit2,
  LogOut
} from 'lucide-react';

const appId = 'ledo-valley-erp'; // hardcoded app ID for now




declare global {
  var __initial_auth_token: string | undefined;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('inventory');
  const [printBlend, setPrintBlend] = useState<BlendProcess | null>(null); 
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // Mobile Menu State

  // --- Dynamic System Feedback State ---
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ title: string; itemName?: string; warningText?: string; onConfirm: () => void } | null>(null);

  const triggerToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // --- Auth & User State ---
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [systemUser, setSystemUser] = useState<SystemUser | null>(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [loadingHintIndex, setLoadingHintIndex] = useState(0);
  const loadingHints = [
    "Connecting to Backend Service...",
    "Initializing Ledo Valley ERP...",
    "Loading Warehouse Catalogs...",
    "Verifying Access Protocols..."
  ];

  useEffect(() => {
    if (isDataLoaded) return;
    const interval = setInterval(() => {
      setLoadingHintIndex((prev) => (prev + 1) % loadingHints.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [isDataLoaded]);

  // Local State Mirrors
  const [localPacketCatalog, setLocalPacketCatalog] = useState<CatalogProduct[]>([]);
  const [localLooseInventory, setLocalLooseInventory] = useState<LooseLot[]>([]);
  const [localUnderProcess, setLocalUnderProcess] = useState<BlendProcess[]>([]);
  const [localHistoryList, setLocalHistoryList] = useState<HistoryRecord[]>([]);

  // --- Cloud Synchronized Setters ---
  const setPacketCatalog = async (newValOrUpdater: CatalogProduct[] | ((prev: CatalogProduct[]) => CatalogProduct[])) => {
    const newVal = typeof newValOrUpdater === 'function' ? newValOrUpdater(localPacketCatalog) : newValOrUpdater;
    setLocalPacketCatalog(newVal); 
    if (auth && user) {
      try { await setDoc(doc(db, 'artifacts', appId, 'globalData', 'catalog'), { items: newVal }); } catch (e) { console.error(e); }
    }
  };

  const setLooseInventory = async (newValOrUpdater: LooseLot[] | ((prev: LooseLot[]) => LooseLot[])) => {
    const newVal = typeof newValOrUpdater === 'function' ? newValOrUpdater(localLooseInventory) : newValOrUpdater;
    setLocalLooseInventory(newVal);
    if (auth && user) {
      try { await setDoc(doc(db, 'artifacts', appId, 'globalData', 'loose'), { items: newVal }); } catch (e) { console.error(e); }
    }
  };

  const setUnderProcess = async (newValOrUpdater: BlendProcess[] | ((prev: BlendProcess[]) => BlendProcess[])) => {
    const newVal = typeof newValOrUpdater === 'function' ? newValOrUpdater(localUnderProcess) : newValOrUpdater;
    setLocalUnderProcess(newVal);
    if (auth && user) {
      try { await setDoc(doc(db, 'artifacts', appId, 'globalData', 'process'), { items: newVal }); } catch (e) { console.error(e); }
    }
  };

  const setHistoryList = async (newValOrUpdater: HistoryRecord[] | ((prev: HistoryRecord[]) => HistoryRecord[])) => {
    const newVal = typeof newValOrUpdater === 'function' ? newValOrUpdater(localHistoryList) : newValOrUpdater;
    
    // Auto-inject user details into new history records
    const enrichedVal = typeof newValOrUpdater === 'function' ? newVal.map(record => {
      // If it's a new record (no userId yet), tag it
      if (!record.userId && systemUser) {
        return { ...record, userId: systemUser.userId, userName: systemUser.name };
      }
      return record;
    }) : newVal;

    setLocalHistoryList(enrichedVal);
    if (auth && user) {
      try { await setDoc(doc(db, 'artifacts', appId, 'globalData', 'history'), { items: enrichedVal }); } catch (e) { console.error(e); }
    }
  };

  // 1. Firebase Authentication Hook
  useEffect(() => {
    if (!auth) {
      setAuthChecked(true);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Fetch SystemUser role
        const onSysUserSnapshot = onSnapshot(doc(db, 'artifacts', appId, 'users', currentUser.uid), (docSnap) => {
          if (docSnap.exists()) {
            setSystemUser(docSnap.data() as SystemUser);
          } else {
            // Bootstrapping: If no user doc exists, and we are logged in, 
            // maybe it's the first time super_admin? We handle this in Login component.
            setSystemUser(null);
          }
          setAuthChecked(true);
        });
        return () => onSysUserSnapshot();
      } else {
        setSystemUser(null);
        setAuthChecked(true);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Cloud Database Listener Hook
  useEffect(() => {
    if (!auth || !user || !systemUser) {
      setIsDataLoaded(false);
      return;
    }
    
    const collRef = collection(db, 'artifacts', appId, 'globalData');
    const unsubscribe = onSnapshot(collRef, (snapshot) => {
      let loadedCatalog: CatalogProduct[] | null = null;
      let loadedLoose: LooseLot[] | null = null;
      let loadedProcess: BlendProcess[] | null = null;
      let loadedHistory: HistoryRecord[] | null = null;
      
      snapshot.forEach(d => {
        if (d.id === 'catalog') loadedCatalog = d.data().items;
        if (d.id === 'loose') loadedLoose = d.data().items;
        if (d.id === 'process') loadedProcess = d.data().items;
        if (d.id === 'history') loadedHistory = d.data().items;
      });

      if (loadedLoose && !(loadedLoose as LooseLot[]).some((i: LooseLot) => i.id === 'l-balance')) {
        (loadedLoose as LooseLot[]).push({ id: 'l-balance', lotNumber: 'SYSTEM-LOOSE', grade: 'MIXED', mark: 'LOOSE TEA BALANCE', bags: 0, weightPerBag: 0, weight: 0, date: new Date().toISOString().split('T')[0], labels: ['SYSTEM LEDGER'] } as LooseLot);
        setDoc(doc(db, 'artifacts', appId, 'globalData', 'loose'), { items: loadedLoose });
      }

      if (!loadedCatalog) {
        setDoc(doc(db, 'artifacts', appId, 'globalData', 'catalog'), { items: [] });
        loadedCatalog = [];
      }
      if (!loadedLoose) {
        const initialLoose = [{ id: 'l-balance', lotNumber: 'SYSTEM-LOOSE', grade: 'MIXED', mark: 'LOOSE TEA BALANCE', bags: 0, weightPerBag: 0, weight: 0, date: new Date().toISOString().split('T')[0], labels: ['SYSTEM LEDGER'] } as LooseLot];
        setDoc(doc(db, 'artifacts', appId, 'globalData', 'loose'), { items: initialLoose });
        loadedLoose = initialLoose;
      }
      if (!loadedProcess) {
        setDoc(doc(db, 'artifacts', appId, 'globalData', 'process'), { items: [] });
        loadedProcess = [];
      }
      if (!loadedHistory) {
        setDoc(doc(db, 'artifacts', appId, 'globalData', 'history'), { items: [] });
        loadedHistory = [];
      }

      setLocalPacketCatalog(loadedCatalog);
      setLocalLooseInventory(loadedLoose);
      setLocalUnderProcess(loadedProcess);
      setLocalHistoryList(loadedHistory);
      
      setIsDataLoaded(true);
    }, (error) => {
      console.error("Firestore error:", error);
    });

    return () => unsubscribe();
  }, [user, systemUser]);



  // 4. Print Listener
  useEffect(() => {
    if (printBlend) {
      setTimeout(() => {
        window.print();
        setPrintBlend(null);
        setActiveTab('process');
      }, 500); 
    }
  }, [printBlend]);

  const handleDeleteLooseItem = (id: string) => {
    if (id === 'l-balance') {
      triggerToast("Cannot delete the system loose tea ledger.", "error");
      return;
    }
    setLooseInventory(prev => prev.filter(item => item.id !== id));
    triggerToast("Empty loose stock lot successfully purged.");
  };

  const handlePurgeNilLooseStock = () => {
    const nilLots = localLooseInventory.filter(item => item.id !== 'l-balance' && (item.bags <= 0 || item.weight <= 0));
    if (nilLots.length === 0) {
      triggerToast("No NIL stock lots found to purge.", "error");
      return;
    }
    setConfirmModal({
      title: "Purge All NIL Stock?",
      message: `Are you sure you want to permanently delete all ${nilLots.length} empty loose tea lots?`,
      onConfirm: () => {
        setLooseInventory(prev => prev.filter(item => item.id === 'l-balance' || (item.bags > 0 && item.weight > 0)));
        triggerToast(`Successfully purged ${nilLots.length} NIL stock lots.`);
      }
    });
  };

  const handleEditLooseItem = (id: string, updatedData: any) => {
    setLooseInventory(prev => prev.map(item => {
      if (item.id === id) {
        const newBags = parseInt(updatedData.bags) || 0;
        const newWpb = parseFloat(updatedData.weightPerBag) || 0;
        const newLabels = (updatedData.labels || '').split(',').map((l: string) => l.trim()).filter((l: string) => l);
        return {
          ...item,
          lotNumber: updatedData.lotNumber,
          mark: updatedData.mark,
          grade: updatedData.grade,
          bags: newBags,
          weightPerBag: newWpb,
          weight: newBags * newWpb,
          labels: newLabels
        };
      }
      return item;
    }));
    triggerToast("Loose tea lot details updated manually.");
  };

  const handleEditCatalogProduct = (id: string, updatedData: any) => {
    setPacketCatalog(prev => prev.map(item => {
      if (item.id === id) {
        return {
          ...item,
          name: updatedData.name,
          unit: updatedData.unit,
          size: parseFloat(updatedData.size) || 0,
          stock: parseFloat(updatedData.stock) || 0
        };
      }
      return item;
    }));
    triggerToast("Packet product details updated manually.");
  };

  const handleAddCatalogProduct = (newProduct: any) => {
    if (!isCatalogUnlocked) {
      triggerToast("Unauthorized! Unlock the configuration workspace first.", "error");
      return;
    }
    setPacketCatalog(prev => [...prev, { ...newProduct, id: 'p-' + Date.now(), stock: 0 }]);
    triggerToast(`"${newProduct.name}" registered to the master list catalog.`);
  };

  const handleDeleteCatalogProduct = (productId: string) => {
    if (!isCatalogUnlocked) {
      triggerToast("Access Denied! Enter catalog password.", "error");
      return;
    }
    if (productId === 'p-variance') {
      triggerToast("Cannot delete the system variance tracking ledger.", "error");
      return;
    }
    
    const product = localPacketCatalog.find(p => p.id === productId);
    if (product && product.stock !== 0) {
      setConfirmModal({
        title: "Force Delete Product Template?",
        message: `"${product.name}" currently has a stock balance of ${product.stock} ${product.unit}(s). Deleting this will clear the historical stock metadata. Proceed?`,
        onConfirm: () => {
          setPacketCatalog(prev => prev.filter(p => p.id !== productId));
          triggerToast(`"${product.name}" has been deleted from catalog.`, "error");
        }
      });
    } else {
      setPacketCatalog(prev => prev.filter(p => p.id !== productId));
      triggerToast("Product template deleted from catalog list successfully.");
    }
  };


  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#F0F5F9] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-[#009965] rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user || !systemUser) {
    return <Login />;
  }

  if (!isDataLoaded) {
    return (
      <div className="min-h-screen bg-[#F0F5F9] flex flex-col items-center justify-center text-slate-400">
        <Cloud size={64} className="animate-pulse mb-6 text-slate-300 drop-shadow-sm" />
        <h2 className="text-2xl font-bold text-[#0B172B] tracking-tight">Ledo Valley ERP System</h2>
        <p className="text-sm text-[#0B172B]/55 mt-3 font-semibold h-5 animate-fade-in transition-all">{loadingHints[loadingHintIndex]}</p>
      </div>
    );
  }

  const navItems = [
    { id: 'inventory', label: 'Inventory & Receiving', icon: <Warehouse size={20} /> },
    { id: 'blend', label: 'Blend Management', icon: <Coffee size={20} /> },
    { id: 'process', label: 'Under Process', icon: <Settings2 size={20} /> },
    { id: 'history', label: 'History / Records', icon: <History size={20} /> },
  ];

  if (systemUser.role === 'super_admin') {
    navItems.push({ id: 'users', label: 'User Management', icon: <Shield size={20} /> });
  }

  const isCatalogUnlocked = systemUser.role === 'super_admin' || systemUser.role === 'manager';

  return (
    <>
      <div className="min-h-screen bg-[#F0F5F9] flex flex-col md:flex-row text-[#0B172B] font-sans relative print:hidden">
        {toast && (
          <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg border text-sm font-semibold transition-all transform animate-bounce ${
            toast.type === 'error' 
              ? 'bg-rose-50 text-rose-800 border-rose-200' 
              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
          }`}>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping mr-1"></span>
            <span>{toast.message}</span>
          </div>
        )}

        {confirmModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden transform transition-all">
              <div className="p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-2">{confirmModal.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{confirmModal.message}</p>
              </div>
              <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
              <button 
                onClick={() => setConfirmModal(null)} 
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  confirmModal.onConfirm();
                  setConfirmModal(null);
                }} 
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded text-sm font-medium shadow transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Header Bar */}
      <div className="lg:hidden bg-slate-900 text-white p-4 flex justify-between items-center shadow-md shrink-0 z-20">
        <div className="flex items-center gap-2">
          <Image src="/symbolLogo.svg" alt="Ledo Valley ERP Logo" width={24} height={24} className="w-6 h-6 drop-shadow" />
          <h1 className="text-xl font-bold text-emerald-400">Ledo Valley ERP</h1>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(true)} 
          className="text-slate-300 hover:text-white p-1 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <Menu size={28} />
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden" 
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <Sidebar 
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        navItems={navItems}
        systemUser={systemUser}
      />

        <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#F0F5F9]">
          <Topbar activeTitle={navItems.find(n => n.id === activeTab)?.label} />

          <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          <div className="w-full">
            {activeTab === 'inventory' && (
              <InventoryModule 
                looseInventory={localLooseInventory} 
                setLooseInventory={setLooseInventory}
                packetCatalog={localPacketCatalog} 
                setPacketCatalog={setPacketCatalog}
                onDeleteLoose={handleDeleteLooseItem} 
                onPurgeNilLoose={handlePurgeNilLooseStock}
                onEditLooseItem={handleEditLooseItem}
                onEditCatalogProduct={handleEditCatalogProduct}
                onDeleteCatalog={handleDeleteCatalogProduct}
                isCatalogUnlocked={systemUser.role === 'super_admin' || systemUser.role === 'manager'}
                onUnlockRequest={() => triggerToast('No longer needed. Role-based access active.')}
                onLockRequest={() => {}}
                onAddCatalogProduct={handleAddCatalogProduct}
                triggerToast={triggerToast}
              />
            )}
            {activeTab === 'blend' && (
              <BlendModule 
                looseInventory={localLooseInventory} 
                setLooseInventory={setLooseInventory} 
                underProcess={localUnderProcess} 
                setUnderProcess={setUnderProcess} 
                historyList={localHistoryList}
                setHistoryList={setHistoryList}
                setActiveTab={setActiveTab} 
                setPrintBlend={setPrintBlend}
                triggerToast={triggerToast} 
              />
            )}
            {activeTab === 'process' && (
              <ProcessModule 
                underProcess={localUnderProcess} 
                setUnderProcess={setUnderProcess} 
                packetCatalog={localPacketCatalog}
                setPacketCatalog={setPacketCatalog}
                looseInventory={localLooseInventory}
                setLooseInventory={setLooseInventory}
                historyList={localHistoryList} 
                setHistoryList={setHistoryList} 
                setPrintBlend={setPrintBlend}
                triggerToast={triggerToast} 
              />
            )}
            {activeTab === 'history' && (
              <HistoryModule historyList={localHistoryList} />
            )}
            {activeTab === 'users' && systemUser.role === 'super_admin' && (
              <UserManagementModule 
                triggerToast={triggerToast} 
                historyList={localHistoryList}
              />
            )}
          </div>
        </main>
        </div>
      </div>

      {/* Hidden Print Layout */}
      {printBlend && (
        <div className="hidden print:block p-8 bg-white text-black min-h-screen font-sans">
          <div className="flex justify-between items-end border-b-2 border-slate-900 pb-4 mb-8">
            <div>
              <h1 className="text-3xl font-black text-slate-900 uppercase tracking-widest">Ledo Valley ERP</h1>
              <h2 className="text-xl font-bold text-slate-600 mt-1">Blend Execution Sheet</h2>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold">Date: {printBlend.date}</div>
              <div className="text-sm font-bold">ID: {printBlend.id}</div>
            </div>
          </div>

          <div className="bg-slate-50 p-4 border border-slate-300 rounded mb-8">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="block text-xs uppercase font-bold text-slate-500">Target Blend Name</span>
                <span className="text-lg font-bold">{printBlend.blendName}</span>
              </div>
              <div>
                <span className="block text-xs uppercase font-bold text-slate-500">Batch Code</span>
                <span className="text-lg font-bold">{printBlend.batchNo || 'N/A'}</span>
              </div>
            </div>
          </div>

          <table className="w-full text-left border-collapse border border-slate-400 mb-12">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-400 p-3 font-bold uppercase text-xs">Lot / Mark Details</th>
                <th className="border border-slate-400 p-3 font-bold uppercase text-xs text-right">Bags to Pick</th>
                <th className="border border-slate-400 p-3 font-bold uppercase text-xs text-right">Target Weight</th>
                <th className="border border-slate-400 p-3 font-bold uppercase text-xs text-center w-32">Picker Sign</th>
              </tr>
            </thead>
            <tbody>
              {printBlend.lotsUsed.map((l, i) => (
                <tr key={i}>
                  <td className="border border-slate-400 p-3 font-semibold text-sm">
                    {l.lotNumber}
                    <div className="text-xs text-slate-600 mt-0.5">{l.mark}</div>
                  </td>
                  <td className="border border-slate-400 p-3 text-right font-bold text-lg">
                    {l.bagsUsed === '-' ? 'Bulk kg' : l.bagsUsed}
                  </td>
                  <td className="border border-slate-400 p-3 text-right font-medium">
                    {l.weightUsed.toFixed(2)} kg
                  </td>
                  <td className="border border-slate-400 p-3"></td>
                </tr>
              ))}
              <tr className="bg-slate-100">
                <td className="border border-slate-400 p-3 font-black text-right uppercase text-sm">Total Required:</td>
                <td className="border border-slate-400 p-3 text-right font-bold"></td>
                <td className="border border-slate-400 p-3 text-right font-black text-lg">{printBlend.totalQuantity.toFixed(2)} kg</td>
                <td className="border border-slate-400 p-3"></td>
              </tr>
            </tbody>
          </table>

          <div className="flex justify-between mt-32 px-12">
            <div className="text-center w-64 border-t-2 border-slate-400 pt-3">
              <span className="font-bold uppercase text-sm">Authorized By</span>
            </div>
            <div className="text-center w-64 border-t-2 border-slate-400 pt-3">
              <span className="font-bold uppercase text-sm">Blender Signature</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

