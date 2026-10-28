"use client";

import React, { useState, useEffect, useTransition } from "react";
import { 
  Warehouse, 
  Coffee, 
  Settings2, 
  History, 
  AlertTriangle,
  Loader2,
  RefreshCw,
  Plus
} from "lucide-react";

import InventoryModule from "@/components/factory/InventoryModule";
import BlendModule from "@/components/factory/BlendModule";
import ProcessModule from "@/components/factory/ProcessModule";
import HistoryModule from "@/components/factory/HistoryModule";
import MissingBlendsModule from "@/components/factory/MissingBlendsModule";
import ConfirmModal from "@/components/factory/ConfirmModal";

import TopNavbar from "@/components/layout/TopNavbar";
import { LooseLot, CatalogProduct, BlendProcess, HistoryRecord, SystemUser } from "@/types/factory";
import {
  fetchLooseLots,
  saveLooseLot,
  deleteLooseLot,
  fetchUnderProcessBlends,
  createFactoryBlend,
  finalizeFactoryBlend,
  deleteFactoryBlend,
  fetchFactoryHistory
} from "./actions";

interface FactoryDashboardProps {
  initialLots: LooseLot[];
  initialBlends: BlendProcess[];
  initialHistory: HistoryRecord[];
  initialProducts: CatalogProduct[];
  userRole: string;
  userEmail: string;
  userName: string;
  userId: string;
  lastSignInAt?: string;
  signOutAction: () => Promise<void>;
}

export default function FactoryDashboardClient({
  initialLots,
  initialBlends,
  initialHistory,
  initialProducts,
  userRole,
  userEmail,
  userName,
  userId,
  lastSignInAt,
  signOutAction
}: FactoryDashboardProps) {
  const [activeTab, setActiveTab] = useState<string>("inventory");
  const [looseInventory, setLooseInventory] = useState<LooseLot[]>(initialLots);
  const [underProcess, setUnderProcess] = useState<BlendProcess[]>(initialBlends);
  const [historyList, setHistoryList] = useState<HistoryRecord[]>(initialHistory);
  const [packetCatalog, setPacketCatalog] = useState<CatalogProduct[]>(initialProducts);

  const [editingProcess, setEditingProcess] = useState<BlendProcess | null>(null);
  const [printBlend, setPrintBlend] = useState<BlendProcess | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [isPending, startTransition] = useTransition();

  const systemUser: SystemUser = {
    uid: userId,
    userId: userEmail.split("@")[0],
    name: userName,
    number: "",
    role: (userRole === "admin" ? "super_admin" : userRole === "manager" ? "manager" : "user") as any,
    createdAt: new Date().toISOString()
  };

  // Toast trigger helper
  const triggerToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Log system action
  const logSystemAction = (action: string, details: string, isError: boolean = false) => {
    console.log(`[Factory Log] ${action}: ${details}`);
  };

  // Print listener for blend sheet
  useEffect(() => {
    if (printBlend) {
      const timer = setTimeout(() => {
        window.print();
        setPrintBlend(null);
        setActiveTab("process");
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [printBlend]);

  // Missing blends calculation (Gap Analysis)
  const missingBlends: string[] = (() => {
    let maxSerial = 0;
    const serialsFound = new Set<number>();

    const extractSerial = (name: string) => {
      if (!name) return;
      const match = name.match(/\|\s*SL-(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        serialsFound.add(num);
        if (num > maxSerial) maxSerial = num;
      }
    };

    underProcess.forEach(b => extractSerial(b.blendName));
    historyList.forEach(h => {
      if (h.details && h.details.blendName) {
        extractSerial(h.details.blendName);
      }
    });

    const missing: string[] = [];
    for (let i = 1; i <= maxSerial; i++) {
      if (!serialsFound.has(i)) {
        missing.push(`SL-${i.toString().padStart(2, "0")}`);
      }
    }
    return missing;
  })();

  // Refresh data from PostgreSQL
  const refreshData = () => {
    startTransition(async () => {
      const [lots, blends, hist] = await Promise.all([
        fetchLooseLots(),
        fetchUnderProcessBlends(),
        fetchFactoryHistory()
      ]);
      setLooseInventory(lots);
      setUnderProcess(blends);
      setHistoryList(hist.map((h: any) => ({
        id: h.id,
        type: h.type,
        desc: h.description,
        timestamp: h.timestamp,
        userId: h.user_id,
        userName: h.user_name,
        details: h.details
      })));
      triggerToast("Factory data synced with database.");
    });
  };

  // Handlers for Lots
  const handleDeleteLooseItem = (id: string) => {
    setConfirmModal({
      title: "Delete Loose Tea Lot?",
      message: `Are you sure you want to permanently delete lot ${id}?`,
      onConfirm: () => {
        startTransition(async () => {
          const res = await deleteLooseLot(id);
          if (res?.error) {
            triggerToast(res.error, "error");
          } else {
            setLooseInventory(prev => prev.filter(item => item.id !== id));
            triggerToast("Lot deleted successfully.");
          }
        });
      }
    });
  };

  const handlePurgeNilLooseStock = () => {
    const systemIds = ["l-balance", "l-orthodox", "l-cardamom", "l-cardamom-husk"];
    const nilLots = looseInventory.filter(item => !systemIds.includes(item.id) && (item.bags <= 0 || item.weight <= 0));
    if (nilLots.length === 0) {
      triggerToast("No NIL stock lots found to purge.", "error");
      return;
    }

    setConfirmModal({
      title: "Purge All NIL Stock?",
      message: `Are you sure you want to delete all ${nilLots.length} empty loose tea lots?`,
      onConfirm: () => {
        startTransition(async () => {
          for (const lot of nilLots) {
            await deleteLooseLot(lot.id);
          }
          setLooseInventory(prev => prev.filter(item => systemIds.includes(item.id) || (item.bags > 0 && item.weight > 0)));
          triggerToast(`Purged ${nilLots.length} NIL stock lots.`);
        });
      }
    });
  };

  const handleEditLooseItem = (id: string, updatedData: any) => {
    startTransition(async () => {
      const existing = looseInventory.find(l => l.id === id);
      if (!existing) return;

      const newBags = parseInt(updatedData.bags) || 0;
      const newWpb = parseFloat(updatedData.weightPerBag) || 0;
      const newLabels = Array.isArray(updatedData.labels)
        ? updatedData.labels
        : (updatedData.labels || "").split(",").map((l: string) => l.trim()).filter((l: string) => l);

      const payload = {
        id,
        lotNumber: updatedData.lotNumber || existing.lotNumber,
        mark: updatedData.mark || existing.mark,
        grade: updatedData.grade || existing.grade,
        bags: newBags,
        weightPerBag: newWpb,
        weight: newBags * newWpb,
        date: updatedData.date || existing.date,
        labels: newLabels
      };

      const res = await saveLooseLot(payload);
      if (res?.error) {
        triggerToast(res.error, "error");
      } else {
        setLooseInventory(prev => prev.map(l => (l.id === id ? payload : l)));
        triggerToast("Lot updated in database.");
      }
    });
  };

  const handleAddCatalogProduct = () => {
    triggerToast("Manage packet products directly in ERP Settings.", "error");
  };

  const handleRevertAndEditProcess = (blend: BlendProcess) => {
    setEditingProcess(blend);
    setActiveTab("blend");
  };

  const handleUndoFinalization = () => {
    triggerToast("Undo finalization is restricted. Contact system admin.", "error");
  };

  const navTabs = [
    { id: "inventory", label: "Inventory & Receiving", icon: Warehouse, badge: looseInventory.length },
    { id: "blend", label: "Blend Management", icon: Coffee },
    { id: "process", label: "Under Process", icon: Settings2, badge: underProcess.length },
    { id: "history", label: "History Ledger", icon: History },
    ...(userRole === "admin" || userRole === "manager"
      ? [{ id: "missing_blends", label: "Gap Analysis", icon: AlertTriangle, badge: missingBlends.length }]
      : [])
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-xl border text-sm font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-4 ${
            toast.type === "error"
              ? "bg-red-50 text-red-700 border-red-200"
              : "bg-[#0D4728] text-[#FFF9CD] border-[#0D4728]"
          }`}
        >
          <span>{toast.message}</span>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <ConfirmModal
          isOpen={true}
          title={confirmModal.title}
          message={confirmModal.message}
          onConfirm={() => {
            confirmModal.onConfirm();
            setConfirmModal(null);
          }}
          onClose={() => setConfirmModal(null)}
        />
      )}

      {/* Single Top Navbar Controlling Factory Navigation */}
      <TopNavbar
        userRole={userRole}
        userEmail={userEmail}
        initial={userEmail.charAt(0).toUpperCase()}
        lastSignInAt={lastSignInAt}
        signOutAction={signOutAction}
        factoryTab={activeTab}
        onFactoryTabChange={(tab) => setActiveTab(tab)}
        factoryBadges={{
          inventory: looseInventory.length,
          process: underProcess.length,
          missing: missingBlends.length
        }}
      />

      {/* Tab Panels */}
      <div className="w-full">
        {activeTab === "inventory" && (
          <InventoryModule
            looseInventory={looseInventory}
            setLooseInventory={setLooseInventory}
            packetCatalog={packetCatalog}
            setPacketCatalog={setPacketCatalog}
            historyList={historyList}
            onDeleteLoose={handleDeleteLooseItem}
            onPurgeNilLoose={handlePurgeNilLooseStock}
            onEditLooseItem={handleEditLooseItem}
            onEditCatalogProduct={() => {}}
            onDeleteCatalog={() => {}}
            isCatalogUnlocked={userRole === "admin" || userRole === "manager"}
            onUnlockRequest={() => triggerToast("Role-based permissions are active.")}
            onLockRequest={() => {}}
            onAddCatalogProduct={handleAddCatalogProduct}
            triggerToast={triggerToast}
            systemUser={systemUser}
            logSystemAction={logSystemAction}
          />
        )}

        {activeTab === "blend" && (
          <BlendModule
            looseInventory={looseInventory}
            setLooseInventory={setLooseInventory}
            underProcess={underProcess}
            setUnderProcess={setUnderProcess}
            historyList={historyList}
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

        {activeTab === "process" && (
          <ProcessModule
            underProcess={underProcess}
            setUnderProcess={setUnderProcess}
            packetCatalog={packetCatalog}
            setPacketCatalog={setPacketCatalog}
            looseInventory={looseInventory}
            setLooseInventory={setLooseInventory}
            historyList={historyList}
            setHistoryList={setHistoryList}
            setPrintBlend={setPrintBlend}
            onRevertAndEdit={handleRevertAndEditProcess}
            triggerToast={triggerToast}
            systemUser={systemUser}
            logSystemAction={logSystemAction}
          />
        )}

        {activeTab === "history" && (
          <HistoryModule
            historyList={historyList}
            systemUser={systemUser}
            onUndoFinalization={handleUndoFinalization}
            logSystemAction={logSystemAction}
          />
        )}

        {activeTab === "missing_blends" && (
          <MissingBlendsModule missingBlends={missingBlends} />
        )}
      </div>

      {/* Hidden Print Blend Sheet Template */}
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
                <span className="text-lg font-bold">{printBlend.batchNo || "N/A"}</span>
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
                    <span className="font-bold text-slate-800">{l.grade || "-"}</span>
                    {l.labels && l.labels.length > 0 && (
                      <div className="text-xs text-slate-500 mt-0.5">{l.labels.join(", ")}</div>
                    )}
                  </td>
                  <td className="border border-slate-400 p-3 text-right font-bold text-lg">
                    {l.bagsUsed === "-" ? "Bulk kg" : l.bagsUsed}
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
                  {printBlend.lotsUsed.reduce((sum, l) => sum + (l.bagsUsed === "-" ? 0 : Number(l.bagsUsed)), 0)} bags
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
    </div>
  );
}

