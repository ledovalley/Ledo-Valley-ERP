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
  purgeNilLooseLots,
  adjustLedgerLot,
  savePacketProduct,
  deletePacketProduct,
  receivePacketStock,
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
    const nilLots = looseInventory.filter(item => !systemIds.includes(item.id) && (Number(item.bags) <= 0 || Number(item.weight) <= 0));
    if (nilLots.length === 0) {
      triggerToast("No NIL stock lots found to purge.", "error");
      return;
    }

    setConfirmModal({
      title: "Purge All NIL Stock?",
      message: `Are you sure you want to permanently delete all ${nilLots.length} empty loose tea lots?`,
      onConfirm: () => {
        startTransition(async () => {
          const res = await purgeNilLooseLots();
          if (res?.error) {
            triggerToast(res.error, "error");
          } else {
            setLooseInventory(prev => prev.filter(item => systemIds.includes(item.id) || (Number(item.bags) > 0 && Number(item.weight) > 0)));
            triggerToast(`Successfully purged ${res?.count ?? nilLots.length} NIL stock lots.`);
          }
        });
      }
    });
  };

  const handleLedgerAdjustment = (targetId: string, amount: number, reason: string) => {
    startTransition(async () => {
      const res = await adjustLedgerLot(targetId, amount, reason);
      if (res?.error) {
        triggerToast(res.error, "error");
      } else {
        const updatedWeight = res.newWeight ?? 0;
        setLooseInventory(prev => prev.map(item => {
          if (item.id === targetId) {
            return {
              ...item,
              weight: updatedWeight
            };
          }
          return item;
        }));
        triggerToast(`Adjusted ledger weight by ${amount > 0 ? "+" : ""}${amount} kg.`);
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

  const handleAddCatalogProduct = (product: { name: string; unit: string; size: number; hsnCode?: string; gstRate?: number }) => {
    startTransition(async () => {
      const res = await savePacketProduct(product);
      if (res?.error) {
        triggerToast(res.error, "error");
      } else {
        const newProduct: CatalogProduct = {
          id: res.id || `p-${Date.now()}`,
          name: product.name,
          unit: product.unit,
          size: product.size,
          stock: 0,
          hsnCode: product.hsnCode || "",
          gstRate: product.gstRate || 5
        };
        setPacketCatalog(prev => [...prev, newProduct]);
        triggerToast(`Added "${product.name}" to factory packet catalog!`);
      }
    });
  };

  const handleEditCatalogProduct = (id: string, updatedData: Partial<CatalogProduct>) => {
    startTransition(async () => {
      const existing = packetCatalog.find(p => p.id === id);
      if (!existing) return;

      const payload = {
        id,
        name: updatedData.name || existing.name,
        unit: updatedData.unit || existing.unit,
        size: updatedData.size !== undefined ? updatedData.size : existing.size,
        stock: updatedData.stock !== undefined ? updatedData.stock : existing.stock,
        hsnCode: updatedData.hsnCode !== undefined ? updatedData.hsnCode : existing.hsnCode,
        gstRate: updatedData.gstRate !== undefined ? updatedData.gstRate : existing.gstRate
      };

      const res = await savePacketProduct(payload);
      if (res?.error) {
        triggerToast(res.error, "error");
      } else {
        setPacketCatalog(prev => prev.map(p => (p.id === id ? { ...p, ...payload } : p)));
        triggerToast(`Updated "${payload.name}" in factory packet catalog.`);
      }
    });
  };

  const handleDeleteCatalogProduct = (id: string) => {
    const existing = packetCatalog.find(p => p.id === id);
    if (id === 'p-variance') {
      triggerToast("System variance ledger cannot be deleted.", "error");
      return;
    }

    setConfirmModal({
      title: "Delete Packet Product Template?",
      message: `Are you sure you want to delete "${existing?.name || id}" from the packet catalog?`,
      onConfirm: () => {
        startTransition(async () => {
          const res = await deletePacketProduct(id);
          if (res?.error) {
            triggerToast(res.error, "error");
          } else {
            setPacketCatalog(prev => prev.filter(p => p.id !== id));
            triggerToast("Product template deleted from packet catalog.");
          }
        });
      }
    });
  };

  const handleReceivePacketStock = async (productId: string, quantity: number, date: string) => {
    startTransition(async () => {
      const res = await receivePacketStock({ productId, quantity, date });
      if (res?.error) {
        triggerToast(res.error, "error");
      } else {
        setPacketCatalog(prev => prev.map(p => {
          if (p.id === productId) {
            return { ...p, stock: res.newStock ?? (p.stock + quantity) };
          }
          return p;
        }));
        triggerToast("Packaged stock updated in database.");
      }
    });
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
    <div className="flex flex-col min-h-screen">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-xl border text-sm font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-4 ${toast.type === "error"
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

      {/* Sticky Top Navbar Controlling Factory Navigation */}
      <div className="sticky top-0 z-30 pt-1 pb-3 -mt-1 bg-gradient-to-b from-[#FAFBF8] via-[#F6F7F2]/95 to-transparent backdrop-blur-xs print:hidden">
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
      </div>

      {/* Main Tab Panels Container */}
      <div className="w-full pb-8 print:hidden">
        {activeTab === "inventory" && (
          <InventoryModule
            looseInventory={looseInventory}
            setLooseInventory={setLooseInventory}
            packetCatalog={packetCatalog}
            setPacketCatalog={setPacketCatalog}
            historyList={historyList}
            onDeleteLoose={handleDeleteLooseItem}
            onPurgeNilLoose={handlePurgeNilLooseStock}
            isPurging={isPending}
            onLedgerAdjustment={handleLedgerAdjustment}
            onEditLooseItem={handleEditLooseItem}
            onEditCatalogProduct={handleEditCatalogProduct}
            onDeleteCatalog={handleDeleteCatalogProduct}
            onReceivePacketStock={handleReceivePacketStock}
            isCatalogUnlocked={userRole === "admin" || userRole === "manager"}
            onUnlockRequest={() => triggerToast("Role-based permissions are active.")}
            onLockRequest={() => { }}
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
        <div className="hidden print:block p-6 sm:p-10 bg-white text-slate-900 w-full min-h-screen font-sans">
          <div className="flex justify-between items-end border-b-2 border-slate-900 pb-4 mb-6">
            <div>
              <h1 className="text-3xl font-black text-slate-900 uppercase tracking-widest">Ledo Valley ERP</h1>
              <h2 className="text-lg font-bold text-slate-600 mt-0.5">Blend Execution Sheet</h2>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold text-slate-500">Date: <span className="text-slate-900 font-bold">{printBlend.date}</span></div>
              <div className="text-xs font-semibold text-slate-500">ID: <span className="text-slate-900 font-bold">{printBlend.id}</span></div>
            </div>
          </div>

          <div className="bg-slate-50 p-4 border border-slate-300 rounded-lg mb-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="block text-[11px] uppercase font-bold text-slate-500 tracking-wider">Target Blend Name</span>
                <span className="text-base font-bold text-slate-900 leading-snug block mt-0.5">{printBlend.blendName}</span>
              </div>
              <div>
                <span className="block text-[11px] uppercase font-bold text-slate-500 tracking-wider">Batch Code</span>
                <span className="text-base font-bold text-slate-900 mt-0.5 block">{printBlend.batchNo || "N/A"}</span>
              </div>
            </div>
          </div>

          <table className="w-full text-left border-collapse border border-slate-300 mb-8 text-xs">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-2.5 font-bold uppercase text-[10px] text-slate-700 tracking-wider">Mark / Lot Details</th>
                <th className="border border-slate-300 p-2.5 font-bold uppercase text-[10px] text-slate-700 tracking-wider">Grade & Labels</th>
                <th className="border border-slate-300 p-2.5 font-bold uppercase text-[10px] text-slate-700 tracking-wider text-right">Bags to Pick</th>
                <th className="border border-slate-300 p-2.5 font-bold uppercase text-[10px] text-slate-700 tracking-wider text-right">Target Weight</th>
                <th className="border border-slate-300 p-2.5 font-bold uppercase text-[10px] text-slate-700 tracking-wider text-center w-28">Picker Sign</th>
              </tr>
            </thead>
            <tbody>
              {printBlend.lotsUsed.map((l, i) => (
                <tr key={i} className="border-b border-slate-200">
                  <td className="border border-slate-300 p-2.5 font-bold text-slate-900">
                    {l.mark}
                    <div className="text-[11px] font-semibold text-slate-600 mt-0.5">Lot: {l.lotNumber}</div>
                  </td>
                  <td className="border border-slate-300 p-2.5 text-slate-800">
                    <span className="font-bold text-slate-900">{l.grade || "-"}</span>
                    {l.labels && l.labels.length > 0 && (
                      <div className="text-[10px] text-slate-500 mt-0.5">{l.labels.join(", ")}</div>
                    )}
                  </td>
                  <td className="border border-slate-300 p-2.5 text-right font-black text-slate-900 text-sm font-mono">
                    {l.bagsUsed === "-" ? "Bulk kg" : l.bagsUsed}
                  </td>
                  <td className="border border-slate-300 p-2.5 text-right font-bold text-slate-900 font-mono">
                    {l.weightUsed.toFixed(2)} kg
                  </td>
                  <td className="border border-slate-300 p-2.5"></td>
                </tr>
              ))}
              <tr className="bg-slate-100 font-bold border-t-2 border-slate-400">
                <td colSpan={2} className="border border-slate-300 p-2.5 font-black text-right uppercase text-xs text-slate-900">Total Required:</td>
                <td className="border border-slate-300 p-2.5 text-right font-black text-sm text-slate-900 font-mono">
                  {printBlend.lotsUsed.reduce((sum, l) => sum + (l.bagsUsed === "-" ? 0 : Number(l.bagsUsed)), 0)} bags
                </td>
                <td className="border border-slate-300 p-2.5 text-right font-black text-sm text-slate-900 font-mono">
                  {printBlend.totalQuantity.toFixed(2)} kg
                </td>
                <td className="border border-slate-300 p-2.5"></td>
              </tr>
            </tbody>
          </table>

          <div className="flex justify-between mt-20 px-8">
            <div className="text-center w-52 border-t border-slate-400 pt-2">
              <span className="font-bold uppercase text-[11px] text-slate-600 tracking-wider">Authorized By</span>
            </div>
            <div className="text-center w-52 border-t border-slate-400 pt-2">
              <span className="font-bold uppercase text-[11px] text-slate-600 tracking-wider">Blender Signature</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

