"use client";
// @ts-nocheck

import React, { useState, useMemo, useEffect } from 'react';
import InventoryModule from "@/components/modules/InventoryModule";
import BlendModule from "@/components/modules/BlendModule";
import ProcessModule from "@/components/modules/ProcessModule";
import HistoryModule from "@/components/modules/HistoryModule";
import AuditLogsModule from "@/components/modules/AuditLogsModule";

import { signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, doc, setDoc, getDoc, getDocs, query, orderBy, deleteDoc, runTransaction } from 'firebase/firestore';

// Import our local initialized Firebase instances
import { auth, db } from '../lib/firebase';
import { User } from 'firebase/auth';
import { CatalogProduct, LooseLot, BlendProcess, HistoryRecord, SystemUser, AuditLog } from '@/types';

let pendingCloudWrites = 0;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (pendingCloudWrites > 0) {
      e.preventDefault();
      e.returnValue = 'Data is still saving to the cloud. Are you sure you want to exit?';
    }
  });
}
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
  LogOut,
  List
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
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [availableBackups, setAvailableBackups] = useState<any[]>([]);
  const [showBackupReminder, setShowBackupReminder] = useState(false);
  
  const [editingProcess, setEditingProcess] = useState<BlendProcess | null>(null);

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
  const [localAuditLogs, setLocalAuditLogs] = useState<AuditLog[]>([]);

  // --- Global Audit Logger ---
  const logSystemAction = async (action: string, details: string, isError: boolean = false) => {
    if (!systemUser) return;
    const newLog: AuditLog = {
      id: 'LOG-' + Date.now().toString(),
      timestamp: new Date().toISOString(),
      action,
      details,
      userName: systemUser.name,
      userId: systemUser.userId,
      isError
    };

    setLocalAuditLogs(prev => [newLog, ...prev]);

    if (auth && user) {
      const docRef = doc(db, 'artifacts', appId, 'systemData', 'audit_logs');
      try {
        await runTransaction(db, async (transaction) => {
          const docSnap = await transaction.get(docRef);
          let currentList: AuditLog[] = [];
          if (docSnap.exists() && docSnap.data().items) currentList = docSnap.data().items;
          const updatedList = [newLog, ...currentList].slice(0, 1000); // Keep max 1000 logs
          transaction.set(docRef, { items: updatedList });
        });
      } catch (error) { 
        console.error("Failed to write audit log: ", error);
      }
    }
  };

  // --- Cloud Synchronized Setters ---
  const setPacketCatalog = async (newValOrUpdater: CatalogProduct[] | ((prev: CatalogProduct[]) => CatalogProduct[])) => {
    let capturedPrev: CatalogProduct[] = [];
    setLocalPacketCatalog(prev => {
      capturedPrev = prev;
      return typeof newValOrUpdater === 'function' ? newValOrUpdater(prev) : newValOrUpdater;
    });
    if (auth && user) {
      pendingCloudWrites++;
      const docRef = doc(db, 'artifacts', appId, 'globalData', 'catalog');
      try {
        await runTransaction(db, async (transaction) => {
          const docSnap = await transaction.get(docRef);
          let currentList: CatalogProduct[] = [];
          if (docSnap.exists() && docSnap.data().items) currentList = docSnap.data().items;
          const newVal = typeof newValOrUpdater === 'function' ? newValOrUpdater(currentList) : newValOrUpdater;
          transaction.set(docRef, { items: newVal });
        });
      } catch (error) { 
        console.error("Transaction failed on setPacketCatalog: ", error);
        alert("Network Sync Error: Failed to save changes to the cloud. Your action has been reverted. Please check your connection and try again.");
        setLocalPacketCatalog(capturedPrev);
      } finally {
        pendingCloudWrites--;
      }
    }
  };

  const setLooseInventory = async (newValOrUpdater: LooseLot[] | ((prev: LooseLot[]) => LooseLot[])) => {
    let capturedPrev: LooseLot[] = [];
    setLocalLooseInventory(prev => {
      capturedPrev = prev;
      return typeof newValOrUpdater === 'function' ? newValOrUpdater(prev) : newValOrUpdater;
    });
    if (auth && user) {
      pendingCloudWrites++;
      const docRef = doc(db, 'artifacts', appId, 'globalData', 'loose');
      try {
        await runTransaction(db, async (transaction) => {
          const docSnap = await transaction.get(docRef);
          let currentList: LooseLot[] = [];
          if (docSnap.exists() && docSnap.data().items) currentList = docSnap.data().items;
          const newVal = typeof newValOrUpdater === 'function' ? newValOrUpdater(currentList) : newValOrUpdater;
          transaction.set(docRef, { items: newVal });
        });
      } catch (error) { 
        console.error("Transaction failed on setLooseInventory: ", error);
        alert("Network Sync Error: Failed to save changes to the cloud. Your action has been reverted. Please check your connection and try again.");
        setLocalLooseInventory(capturedPrev);
      } finally {
        pendingCloudWrites--;
      }
    }
  };

  const setUnderProcess = async (newValOrUpdater: BlendProcess[] | ((prev: BlendProcess[]) => BlendProcess[])) => {
    let capturedPrev: BlendProcess[] = [];
    setLocalUnderProcess(prev => {
      capturedPrev = prev;
      return typeof newValOrUpdater === 'function' ? newValOrUpdater(prev) : newValOrUpdater;
    });
    if (auth && user) {
      pendingCloudWrites++;
      const docRef = doc(db, 'artifacts', appId, 'globalData', 'process');
      try {
        await runTransaction(db, async (transaction) => {
          const docSnap = await transaction.get(docRef);
          let currentList: BlendProcess[] = [];
          if (docSnap.exists() && docSnap.data().items) currentList = docSnap.data().items;
          const newVal = typeof newValOrUpdater === 'function' ? newValOrUpdater(currentList) : newValOrUpdater;
          transaction.set(docRef, { items: newVal });
        });
      } catch (error) { 
        console.error("Transaction failed on setUnderProcess: ", error);
        alert("Network Sync Error: Failed to save changes to the cloud. Your action has been reverted. Please check your connection and try again.");
        setLocalUnderProcess(capturedPrev);
      } finally {
        pendingCloudWrites--;
      }
    }
  };

  const setHistoryList = async (newValOrUpdater: HistoryRecord[] | ((prev: HistoryRecord[]) => HistoryRecord[])) => {
    const enrich = (val: HistoryRecord[]) => val.map(record => (!record.userId && systemUser) ? { ...record, userId: systemUser.userId, userName: systemUser.name } : record);
    
    let capturedPrev: HistoryRecord[] = [];
    setLocalHistoryList(prev => {
      capturedPrev = prev;
      const newVal = typeof newValOrUpdater === 'function' ? newValOrUpdater(prev) : newValOrUpdater;
      return enrich(newVal);
    });
    
    if (auth && user) {
      pendingCloudWrites++;
      const docRef = doc(db, 'artifacts', appId, 'globalData', 'history');
      try {
        await runTransaction(db, async (transaction) => {
          const docSnap = await transaction.get(docRef);
          let currentList: HistoryRecord[] = [];
          if (docSnap.exists() && docSnap.data().items) currentList = docSnap.data().items;
          const newVal = typeof newValOrUpdater === 'function' ? newValOrUpdater(currentList) : newValOrUpdater;
          transaction.set(docRef, { items: enrich(newVal) });
        });
      } catch (error) { 
        console.error("Transaction failed on setHistoryList: ", error);
        alert("Network Sync Error: Failed to save changes to the cloud. Your action has been reverted. Please check your connection and try again.");
        setLocalHistoryList(capturedPrev);
      } finally {
        pendingCloudWrites--;
      }
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

      if (loadedLoose) {
        let changed = false;
        const ensureLedger = (id: string, lotNumber: string, mark: string, grade: string) => {
          if (!(loadedLoose as LooseLot[]).some(i => i.id === id)) {
            (loadedLoose as LooseLot[]).push({ id, lotNumber, grade, mark, bags: 0, weightPerBag: 0, weight: 0, date: new Date().toISOString().split('T')[0], labels: ['SYSTEM LEDGER'] } as LooseLot);
            changed = true;
          }
        };

        ensureLedger('l-balance', 'SYSTEM-LOOSE', 'LOOSE TEA BALANCE', 'MIXED');
        ensureLedger('l-orthodox', 'ORTHODOX BALANCE', 'ORTHODOX', 'ORTHODOX');
        ensureLedger('l-cardamom', 'CARDAMOM BALANCE', 'CARDAMOM', 'CARDAMOM');
        ensureLedger('l-cardamom-husk', 'CARDAMOM HUSK BALANCE', 'CARDAMOM HUSK', 'HUSK');

        if (changed) {
          setDoc(doc(db, 'artifacts', appId, 'globalData', 'loose'), { items: loadedLoose });
        }
      }

      if (!loadedCatalog) {
        setDoc(doc(db, 'artifacts', appId, 'globalData', 'catalog'), { items: [] });
        loadedCatalog = [];
      }
      if (!loadedLoose) {
        const initialLoose = [
          { id: 'l-balance', lotNumber: 'SYSTEM-LOOSE', grade: 'MIXED', mark: 'LOOSE TEA BALANCE', bags: 0, weightPerBag: 0, weight: 0, date: new Date().toISOString().split('T')[0], labels: ['SYSTEM LEDGER'] } as LooseLot,
          { id: 'l-orthodox', lotNumber: 'ORTHODOX BALANCE', grade: 'ORTHODOX', mark: 'ORTHODOX', bags: 0, weightPerBag: 0, weight: 0, date: new Date().toISOString().split('T')[0], labels: ['SYSTEM LEDGER'] } as LooseLot,
          { id: 'l-cardamom', lotNumber: 'CARDAMOM BALANCE', grade: 'CARDAMOM', mark: 'CARDAMOM', bags: 0, weightPerBag: 0, weight: 0, date: new Date().toISOString().split('T')[0], labels: ['SYSTEM LEDGER'] } as LooseLot,
          { id: 'l-cardamom-husk', lotNumber: 'CARDAMOM HUSK BALANCE', grade: 'HUSK', mark: 'CARDAMOM HUSK', bags: 0, weightPerBag: 0, weight: 0, date: new Date().toISOString().split('T')[0], labels: ['SYSTEM LEDGER'] } as LooseLot
        ];
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


      if (loadedCatalog !== null) setLocalPacketCatalog(loadedCatalog);
      if (loadedLoose !== null) setLocalLooseInventory(loadedLoose);
      if (loadedProcess !== null) setLocalUnderProcess(loadedProcess);
      if (loadedHistory !== null) setLocalHistoryList(loadedHistory);
      setIsDataLoaded(true);
    }, (error) => {
      console.error("Firestore error:", error);
    });
    return () => unsubscribe();
  }, [user, systemUser]);

  // 2.5 Audit Logs Listener (Admin Only)
  useEffect(() => {
    if (!auth || !user || !systemUser || systemUser.role !== 'super_admin') return;
    const docRef = doc(db, 'artifacts', appId, 'systemData', 'audit_logs');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().items) {
        setLocalAuditLogs(docSnap.data().items);
      }
    }, (error) => {
      console.error("Audit log sync error:", error);
    });
    return () => unsubscribe();
  }, [user, systemUser]);

  // 3. Automated Backup Routine
  useEffect(() => {
    if (!isDataLoaded || !user) return;
    
    let hasRun = false; // Prevent multiple runs per mount
    
    const checkAndRunBackup = async () => {
      if (hasRun) return;
      hasRun = true;
      
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        const backupRef = doc(db, 'artifacts', appId, 'backups', todayStr);
        const docSnap = await getDoc(backupRef);
        
        if (!docSnap.exists()) {
          // Create backup
          await setDoc(backupRef, {
            date: todayStr,
            timestamp: Date.now(),
            loose: localLooseInventory,
            catalog: localPacketCatalog,
            process: localUnderProcess,
            history: localHistoryList
          });
          
          // Prune old backups
          const backupsRef = collection(db, 'artifacts', appId, 'backups');
          const q = query(backupsRef, orderBy('timestamp', 'desc'));
          const snapshot = await getDocs(q);
          const backups = snapshot.docs;
          
          if (backups.length > 3) {
            for (let i = 3; i < backups.length; i++) {
              await deleteDoc(backups[i].ref);
            }
          }
          console.log("Daily backup successfully completed.");
        }

        // Check if user downloaded today's backup
        const lastDownloaded = localStorage.getItem('lastDownloadedBackupDate');
        if (lastDownloaded !== todayStr) {
          setShowBackupReminder(true);
        }
      } catch (error) {
        console.error("Backup failed", error);
      }
    };
    
    checkAndRunBackup();
  }, [isDataLoaded, user]);

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



  // Handle Export Full Backup JSON
  const handleExportFullBackup = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const data = {
      date: todayStr,
      loose: localLooseInventory,
      catalog: localPacketCatalog,
      process: localUnderProcess,
      history: localHistoryList
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LedoValleyERP_Backup_${todayStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    localStorage.setItem('lastDownloadedBackupDate', todayStr);
    setShowBackupReminder(false);
    triggerToast("Backup downloaded successfully! Please save it to your Google Drive.");
  };

  const handleDeleteLooseItem = (id: string) => {
    const systemIds = ['l-balance', 'l-orthodox', 'l-cardamom', 'l-cardamom-husk'];
    if (systemIds.includes(id)) {
      triggerToast("Cannot delete a system loose tea ledger.", "error");
      return;
    }
    setLooseInventory(prev => prev.filter(item => item.id !== id));
    triggerToast("Empty loose stock lot successfully purged.");
  };

  const handlePurgeNilLooseStock = () => {
    const systemIds = ['l-balance', 'l-orthodox', 'l-cardamom', 'l-cardamom-husk'];
    const nilLots = localLooseInventory.filter(item => !systemIds.includes(item.id) && (item.bags <= 0 || item.weight <= 0));
    if (nilLots.length === 0) {
      triggerToast("No NIL stock lots found to purge.", "error");
      return;
    }
    setConfirmModal({
      title: "Purge All NIL Stock?",
      message: `Are you sure you want to permanently delete all ${nilLots.length} empty loose tea lots?`,
      onConfirm: () => {
        setLooseInventory(prev => prev.filter(item => systemIds.includes(item.id) || (item.bags > 0 && item.weight > 0)));
        triggerToast(`Successfully purged ${nilLots.length} NIL stock lots.`);
      }
    });
  };

  const handleEditLooseItem = (id: string, updatedData: any) => {
    setLooseInventory(prev => prev.map(item => {
      if (item.id === id) {
        const newBags = parseInt(updatedData.bags) || 0;
        const newWpb = parseFloat(updatedData.weightPerBag) || 0;
        const newLabels = Array.isArray(updatedData.labels) 
          ? updatedData.labels 
          : (updatedData.labels || '').split(',').map((l: string) => l.trim()).filter((l: string) => l);
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
    logSystemAction('EDIT_LOOSE_TEA', `Updated details for lot ID: ${id}`);
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
          stock: parseFloat(updatedData.stock) || 0,
          hsnCode: updatedData.hsnCode || '',
          gstRate: updatedData.gstRate !== undefined ? updatedData.gstRate : 5
        };
      }
      return item;
    }));
    logSystemAction('EDIT_PRODUCT', `Updated catalog product ID: ${id}`);
    triggerToast("Packet product details updated manually.");
  };

  const handleAddCatalogProduct = (newProduct: any) => {
    if (!isCatalogUnlocked) {
      triggerToast("Unauthorized! Unlock the configuration workspace first.", "error");
      return;
    }
    setPacketCatalog(prev => [...prev, { ...newProduct, id: 'p-' + Date.now(), stock: 0 }]);
    logSystemAction('CREATE_PRODUCT', `Added new product to catalog: ${newProduct.name}`);
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
          logSystemAction('DELETE_PRODUCT', `Force deleted product: ${product.name} with stock ${product.stock}`, true);
          triggerToast(`"${product.name}" has been deleted from catalog.`, "error");
        }
      });
    } else {
      setPacketCatalog(prev => prev.filter(p => p.id !== productId));
      logSystemAction('DELETE_PRODUCT', `Deleted empty product: ${product?.name}`);
      triggerToast("Product template deleted from catalog list successfully.");
    }
  };

  const handleLedgerAdjustment = (targetId: string, amount: number, reason: string) => {
    let targetName = 'Unknown Lot';
    setLooseInventory(prev => prev.map(lot => {
      if (lot.id === targetId) {
        targetName = lot.id.startsWith('l-') ? lot.mark : `${lot.lotNumber} (${lot.mark})`;
        return { ...lot, weight: lot.weight + amount };
      }
      return lot;
    }));

    const adjustmentHistory: HistoryRecord = {
      id: `HST-${Date.now()}`,
      type: 'LEDGER_ADJUSTMENT',
      desc: `Ledger [${targetName}] adjusted by ${amount > 0 ? '+' : ''}${amount.toFixed(2)} kg. Reason: ${reason}`,
      timestamp: new Date().toISOString(),
      details: { targetId, targetName, amount, reason }
    };
    setHistoryList(prev => [adjustmentHistory, ...prev]);
    logSystemAction('LEDGER_ADJUSTMENT', `Adjusted [${targetName}] by ${amount > 0 ? '+' : ''}${amount.toFixed(2)} kg. Reason: ${reason}`);
    triggerToast(`[${targetName}] successfully adjusted by ${amount > 0 ? '+' : ''}${amount.toFixed(2)} kg.`);
  };

  const handleRevertAndEditProcess = (blend: BlendProcess) => {
    // We do NOT return lots to inventory or remove from underProcess yet.
    // We only set the editing process and switch tabs. 
    // The actual replacement happens safely upon "Submit & Print" in BlendModule.

    // 3. Set to editing mode and change tab
    setEditingProcess(blend);
    setActiveTab('blend');
    triggerToast("Blend reverted. You can now edit its details and resubmit.");
  };

  const handleUndoFinalization = (record: HistoryRecord) => {
    const blendDetails = record.details as any;
    if (!blendDetails) return;

    // 1. Deduct yields from packet catalog
    if (blendDetails.producedItems) {
      setPacketCatalog(prev => prev.map(catItem => {
        const matchingProduced = blendDetails.producedItems.find((p: any) => p.productName === catItem.name);
        if (matchingProduced) {
          return { ...catItem, stock: catItem.stock - matchingProduced.quantity };
        }
        return catItem;
      }));
    }

    // 2. Deduct returned loose scrap from l-balance
    if (blendDetails.returnedLooseWeight > 0) {
      setLooseInventory(prev => prev.map(lot => {
        if (lot.id === 'l-balance') {
          return { ...lot, weight: lot.weight - blendDetails.returnedLooseWeight };
        }
        return lot;
      }));
    }

    // 3. Delete history record
    setHistoryList(prev => prev.filter(h => h.id !== record.id));

    // 4. Push blend back to under process
    const revertedBlend: any = { ...blendDetails };
    revertedBlend.status = 'PENDING';
    delete revertedBlend.completedDate;
    delete revertedBlend.totalOutputQuantity;
    delete revertedBlend.returnedLooseWeight;
    delete revertedBlend.producedItems;
    
    setUnderProcess(prev => [revertedBlend as BlendProcess, ...prev]);

    logSystemAction('UNDO_FINALIZATION', `Reversed finalization of blend: ${blendDetails.blendName}`, true);
    triggerToast(`Finalization reversed! "${blendDetails.blendName}" is back under process.`);
  };

  useEffect(() => {
    if (showBackupModal) {
      const fetchBackups = async () => {
        try {
          const backupsRef = collection(db, 'artifacts', appId, 'backups');
          const q = query(backupsRef, orderBy('timestamp', 'desc'));
          const snapshot = await getDocs(q);
          setAvailableBackups(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
          console.error(e);
        }
      };
      fetchBackups();
    }
  }, [showBackupModal]);

  const handleRestoreBackup = async (backup: any) => {
    if (confirm(`Are you absolutely sure you want to restore the system to ${backup.date}? All current data will be overwritten.`)) {
      setLocalPacketCatalog(backup.catalog || []);
      setLocalLooseInventory(backup.loose || []);
      setLocalUnderProcess(backup.process || []);
      setLocalHistoryList(backup.history || []);
      
      await setDoc(doc(db, 'artifacts', appId, 'globalData', 'catalog'), { items: backup.catalog || [] });
      await setDoc(doc(db, 'artifacts', appId, 'globalData', 'loose'), { items: backup.loose || [] });
      await setDoc(doc(db, 'artifacts', appId, 'globalData', 'process'), { items: backup.process || [] });
      await setDoc(doc(db, 'artifacts', appId, 'globalData', 'history'), { items: backup.history || [] });
      
      setShowBackupModal(false);
      triggerToast("System successfully restored from backup.");
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
    navItems.push({ id: 'audit', label: 'Audit Logs', icon: <List size={20} /> });
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

      {showBackupReminder && systemUser.role === 'super_admin' && (
        <div className="fixed top-20 right-4 z-40 bg-white p-4 rounded-xl shadow-2xl border border-amber-200 animate-slide-in flex flex-col gap-3 max-w-[320px]">
          <div className="flex items-start gap-3">
            <div className="bg-amber-100 p-2 rounded-full shrink-0">
              <Cloud size={20} className="text-amber-600" />
            </div>
            <div>
              <h4 className="font-bold text-[#0B172B] text-sm leading-tight">Daily Backup Ready</h4>
              <p className="text-xs text-[#0B172B]/60 mt-1">You haven't downloaded today's database snapshot. Please save it to your Google Drive.</p>
            </div>
          </div>
          <button 
            onClick={handleExportFullBackup}
            className="w-full bg-[#009965] hover:bg-[#004825] text-white font-bold py-2 rounded-lg text-xs transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            <Download size={14} /> Download Now
          </button>
        </div>
      )}

      {showBackupModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden transform transition-all">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-900">Database Backups</h3>
                <button onClick={() => setShowBackupModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
              </div>
              <p className="text-sm text-slate-600 mb-6">The system automatically saves a daily snapshot. You can restore your entire database to one of the recent backups below.</p>
              
              <div className="space-y-3">
                {availableBackups.length === 0 ? (
                  <p className="text-sm text-slate-500 italic text-center py-4">No backups found yet.</p>
                ) : (
                  availableBackups.map(b => (
                    <div key={b.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50">
                      <div>
                        <p className="font-bold text-[#0B172B]">{b.date}</p>
                        <p className="text-xs text-slate-500">{new Date(b.timestamp).toLocaleTimeString()}</p>
                      </div>
                      <button 
                        onClick={() => handleRestoreBackup(b)}
                        className="px-3 py-1.5 bg-[#009965]/10 text-[#009965] hover:bg-[#009965] hover:text-white rounded font-semibold text-xs transition-colors"
                      >
                        Restore
                      </button>
                    </div>
                  ))
                )}
              </div>
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
        setShowBackupModal={setShowBackupModal}
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
                historyList={localHistoryList}
                onDeleteLoose={handleDeleteLooseItem} 
                onPurgeNilLoose={handlePurgeNilLooseStock}
                onEditLooseItem={handleEditLooseItem}
                onEditCatalogProduct={handleEditCatalogProduct}
                onDeleteCatalog={handleDeleteCatalogProduct}
                isCatalogUnlocked={systemUser.role === 'super_admin' || systemUser.role === 'manager'}
                onUnlockRequest={() => triggerToast('No longer needed. Role-based access active.')}
                onLockRequest={() => {}}
                onAddCatalogProduct={handleAddCatalogProduct}
                onLedgerAdjustment={handleLedgerAdjustment}
                triggerToast={triggerToast}
                systemUser={systemUser}
                logSystemAction={logSystemAction}
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
                editingProcess={editingProcess}
                setEditingProcess={setEditingProcess}
                triggerToast={triggerToast} 
                systemUser={systemUser}
                logSystemAction={logSystemAction}
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
                onRevertAndEdit={handleRevertAndEditProcess}
                triggerToast={triggerToast} 
                systemUser={systemUser}
                logSystemAction={logSystemAction}
              />
            )}
            {activeTab === 'history' && (
              <HistoryModule 
                historyList={localHistoryList}
                systemUser={systemUser}
                onUndoFinalization={handleUndoFinalization}
                logSystemAction={logSystemAction}
              />
            )}
            {activeTab === 'users' && systemUser.role === 'super_admin' && (
              <UserManagementModule 
                triggerToast={triggerToast} 
                historyList={localHistoryList}
                logSystemAction={logSystemAction}
              />
            )}
            {activeTab === 'audit' && systemUser.role === 'super_admin' && (
              <AuditLogsModule
                auditLogs={localAuditLogs}
                systemUser={systemUser}
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
                <th className="border border-slate-400 p-3 font-bold uppercase text-xs">Grade & Labels</th>
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
                  <td className="border border-slate-400 p-3 text-sm">
                    <span className="font-bold text-slate-800">{l.grade || '-'}</span>
                    {l.labels && l.labels.length > 0 && (
                      <div className="text-xs text-slate-500 mt-0.5">{l.labels.join(', ')}</div>
                    )}
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
                <td colSpan={2} className="border border-slate-400 p-3 font-black text-right uppercase text-sm">Total Required:</td>
                <td className="border border-slate-400 p-3 text-right font-bold text-lg">
                  {printBlend.lotsUsed.reduce((sum, l) => sum + (l.bagsUsed === '-' ? 0 : Number(l.bagsUsed)), 0)} bags
                </td>
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

