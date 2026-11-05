"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Warehouse,
  Coffee,
  Settings2,
  History,
  AlertTriangle
} from "lucide-react";

import InventoryModule from "@/components/factory/InventoryModule";
import BlendModule from "@/components/factory/BlendModule";
import ProcessModule from "@/components/factory/ProcessModule";
import HistoryModule from "@/components/factory/HistoryModule";
import MissingBlendsModule from "@/components/factory/MissingBlendsModule";
import StockTakeModule from "@/components/factory/StockTakeModule";
import ConfirmModal from "@/components/factory/ConfirmModal";
import PasswordConfirmModal from "@/components/ui/PasswordConfirmModal";

import TopNavbar from "@/components/layout/TopNavbar";
import { LooseLot, CatalogProduct, BlendProcess, HistoryRecord, SystemUser } from "@/types/factory";
import {
  fetchFactoryState,
  fetchBlendOperationState,
  fetchHistoryAndGaps,
  receiveLooseLot,
  updateLooseLot,
  deleteLooseLot,
  purgeNilLooseLots,
  adjustLedgerLot,
  savePacketProduct,
  deletePacketProduct,
  receivePacketStock,
  createFactoryBlend,
  updateFactoryBlend,
  finalizeFactoryBlend,
  deleteFactoryBlend,
  mergeFactoryBlends
} from "./actions";

const SYSTEM_LOT_IDS = ["l-balance", "l-orthodox", "l-cardamom", "l-cardamom-husk"];

/** Input from the blend screen (create or edit) */
export type BlendSubmitInput = {
  editingBlendId: string | null;
  blendName: string;
  batchNo: string;
  date: string;
  lots: BlendProcess["lotsUsed"];
};

/** Input from the finalize dialog */
export type FinalizeInput = {
  blendId: string;
  returnedLoose: number;
  outputs: { productId: string; quantity: number }[];
};

type AnyResult = { success: true } | { success?: false; error: string };
type Ok<R> = Extract<R, { success: true }>;

interface FactoryDashboardProps {
  initialLots: LooseLot[];
  initialBlends: BlendProcess[];
  initialHistory: HistoryRecord[];
  initialProducts: CatalogProduct[];
  initialMissingSerials: string[];
  userRole: string;
  userEmail: string;
  userName: string;
  userId: string;
  lastSignInAt?: string;
  signOutAction: () => Promise<void>;
}

const mapHistory = (rows: any[]): HistoryRecord[] =>
  rows.map((h: any) => ({
    id: h.id,
    type: h.type,
    desc: h.description,
    timestamp: h.timestamp,
    userId: h.user_id,
    userName: h.user_name,
    details: h.details
  }));

export default function FactoryDashboardClient({
  initialLots,
  initialBlends,
  initialHistory,
  initialProducts,
  initialMissingSerials,
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
  const [missingBlends, setMissingBlends] = useState<string[]>(initialMissingSerials);

  const [editingProcess, setEditingProcess] = useState<BlendProcess | null>(null);
  const [printBlend, setPrintBlend] = useState<BlendProcess | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  // Every delete asks for the delete password (checked on the server)
  const [deleteModal, setDeleteModal] = useState<{
    title: string;
    message: string;
    confirmText?: string;
    run: (password: string) => Promise<AnyResult>;
    successMessage: string | ((res: any) => string);
  } | null>(null);
  const busyRef = useRef(false);
  const lastBlendsRef = useRef<BlendProcess[] | null>(null);

  const canManage = userRole === "admin" || userRole === "manager";

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
    setTimeout(() => setToast(null), type === "error" ? 7000 : 4000);
  };

  // Audit history is written on the server by every action; nothing to do here.
  const logSystemAction = (_action: string, _details: string, _isError: boolean = false) => {};

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

  // ---------------------------------------------------------------------------
  // Loading from the database. The screen only ever shows what the database
  // holds: after every change we reload rather than patching local state.
  // ---------------------------------------------------------------------------
  const reloadAll = async (): Promise<BlendProcess[] | null> => {
    try {
      // One request for everything (see fetchFactoryState)
      const { lots, blends, history: hist, products, missingSerials: missing } = await fetchFactoryState();
      setLooseInventory(lots);
      setUnderProcess(blends);
      setHistoryList(mapHistory(hist));
      setPacketCatalog(products);
      setMissingBlends(missing);
      lastBlendsRef.current = blends;
      return blends;
    } catch (err) {
      triggerToast(
        `Saved, but the screen could not refresh: ${err instanceof Error ? err.message : String(err)}. Reload the page.`,
        "error"
      );
      return null;
    }
  };

  /** Fast refresh for blend operations (only updates lots & pending blends) */
  const reloadBlendState = async (): Promise<BlendProcess[] | null> => {
    try {
      const { lots, blends } = await fetchBlendOperationState();
      setLooseInventory(lots);
      setUnderProcess(blends);
      lastBlendsRef.current = blends;
      // History and Gap Analysis follow in the background (not waited for), so the
      // new blend shows in History without slowing the save down
      fetchHistoryAndGaps()
        .then(({ history, missingSerials }) => {
          setHistoryList(mapHistory(history));
          setMissingBlends(missingSerials);
        })
        .catch(() => { /* the next full refresh catches up */ });
      return blends;
    } catch (err) {
      return reloadAll();
    }
  };

  /**
   * Runs a server action, shows its error if any, reloads from the database on
   * success, and only then reports success. Blocks double submission.
   */
  const runAction = async <R extends AnyResult>(
    fn: () => Promise<R>,
    successMessage?: string | ((res: Ok<R>) => string),
    customReload?: () => Promise<any>
  ): Promise<Ok<R> | null> => {
    if (busyRef.current) return null;
    busyRef.current = true;
    setIsBusy(true);
    try {
      const res = await fn();
      if (!res || !("success" in res) || res.success !== true) {
        triggerToast(res && "error" in res && res.error ? res.error : "Not saved. Please try again.", "error");
        return null;
      }
      const ok = res as Ok<R>;
      if (customReload) {
        await customReload();
      } else {
        await reloadAll();
      }
      if (successMessage) {
        triggerToast(typeof successMessage === "function" ? successMessage(ok) : successMessage);
      }
      return ok;
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : "Something went wrong. Nothing was saved.", "error");
      return null;
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  };

  /** Runs the delete in the open password dialog. Returns an error to show in the dialog, or null when done. */
  const confirmDelete = async (password: string): Promise<string | null> => {
    const modal = deleteModal;
    if (!modal) return null;
    if (busyRef.current) return "Please wait, another change is still saving.";
    busyRef.current = true;
    setIsBusy(true);
    try {
      const res = await modal.run(password);
      if (!res || !("success" in res) || res.success !== true) {
        return res && "error" in res && res.error ? res.error : "Not deleted. Please try again.";
      }
      await reloadAll();
      triggerToast(typeof modal.successMessage === "function" ? modal.successMessage(res) : modal.successMessage);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Something went wrong. Nothing was deleted.";
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Loose lots
  // ---------------------------------------------------------------------------
  const handleReceiveLooseLot = (lot: Omit<LooseLot, "id" | "weight">) =>
    runAction(
      () => receiveLooseLot(lot),
      `Lot ${lot.lotNumber} (${lot.mark}) received and saved.`
    ).then(res => !!res);

  const handleDeleteLooseItem = (id: string) => {
    const lot = looseInventory.find(l => l.id === id);
    setDeleteModal({
      title: "Delete Loose Tea Lot?",
      message: lot
        ? `Permanently delete lot ${lot.lotNumber} (${lot.mark})? It still holds ${lot.bags} bags / ${lot.weight.toFixed(2)} kg.`
        : `Permanently delete lot ${id}?`,
      confirmText: "Delete lot",
      run: password => deleteLooseLot(id, password),
      successMessage: "Lot deleted."
    });
  };

  const handlePurgeNilLooseStock = () => {
    // Same rule as the server: a lot is empty only when it has no weight left
    const nilLots = looseInventory.filter(item => !SYSTEM_LOT_IDS.includes(item.id) && Number(item.weight) <= 0);
    if (nilLots.length === 0) {
      triggerToast("No empty lots found to purge.", "error");
      return;
    }

    setDeleteModal({
      title: "Purge Empty Lots?",
      message: `Permanently delete up to ${nilLots.length} lots that have no weight left? Lots used by blends under process are kept.`,
      confirmText: "Purge",
      run: password => purgeNilLooseLots(password),
      successMessage: res => `Purged ${res.count ?? 0} empty lots.`
    });
  };

  const handleLedgerAdjustment = (targetId: string, amount: number, reason: string) => {
    return runAction(
      () => adjustLedgerLot(targetId, amount, reason),
      `Adjusted ledger weight by ${amount > 0 ? "+" : ""}${amount} kg.`
    ).then(r => !!r);
  };

  const handleEditLooseItem = (id: string, updatedData: Partial<LooseLot> & { labels?: string[] | string }) => {
    // What the user saw when they opened the form: used to detect conflicting changes
    const existing = looseInventory.find(l => l.id === id);
    if (!existing) return Promise.resolve(false);

    const labels = Array.isArray(updatedData.labels)
      ? updatedData.labels
      : String(updatedData.labels || "").split(",");

    return runAction(
      () =>
        updateLooseLot(
          id,
          {
            lotNumber: updatedData.lotNumber ?? existing.lotNumber,
            mark: updatedData.mark ?? existing.mark,
            grade: updatedData.grade ?? existing.grade,
            labels: labels.map(l => l.trim()).filter(Boolean),
            bags: updatedData.bags ?? existing.bags,
            weightPerBag: updatedData.weightPerBag ?? existing.weightPerBag
          },
          { bags: existing.bags, weightPerBag: existing.weightPerBag, weight: existing.weight }
        ),
      "Lot updated."
    ).then(r => !!r);
  };

  // ---------------------------------------------------------------------------
  // Packet catalog
  // ---------------------------------------------------------------------------
  const handleAddCatalogProduct = (product: { name: string; unit: string; size: number; hsnCode?: string; gstRate?: number }) => {
    return runAction(() => savePacketProduct(product), `Added "${product.name}" to the packet catalog.`).then(r => !!r);
  };

  const handleEditCatalogProduct = (id: string, updatedData: Partial<CatalogProduct>) => {
    const existing = packetCatalog.find(p => p.id === id);
    if (!existing) return Promise.resolve(false);

    return runAction(
      () =>
        savePacketProduct({
          id,
          name: updatedData.name ?? existing.name,
          unit: updatedData.unit ?? existing.unit,
          size: updatedData.size ?? existing.size,
          hsnCode: updatedData.hsnCode ?? existing.hsnCode,
          gstRate: updatedData.gstRate ?? existing.gstRate,
          stock: updatedData.stock ?? existing.stock,
          expectedStock: existing.stock
        }),
      `Updated "${updatedData.name ?? existing.name}".`
    ).then(r => !!r);
  };

  const handleDeleteCatalogProduct = (id: string) => {
    const existing = packetCatalog.find(p => p.id === id);
    if (id === "p-variance") {
      triggerToast("System variance ledger cannot be deleted.", "error");
      return;
    }

    setDeleteModal({
      title: "Delete Packet Product Template?",
      message: `Delete "${existing?.name || id}" from the packet catalog?${existing && existing.stock > 0 ? ` It still shows ${existing.stock} in stock.` : ""}`,
      confirmText: "Delete product",
      run: password => deletePacketProduct(id, password),
      successMessage: "Product template deleted."
    });
  };

  const handleReceivePacketStock = (productId: string, quantity: number, date: string) =>
    runAction(
      () => receivePacketStock({ productId, quantity, date }),
      res => `Packaged stock received. New stock: ${res.newStock}.`
    ).then(res => !!res);

  // ---------------------------------------------------------------------------
  // Blends
  // ---------------------------------------------------------------------------
  /** Create or edit a blend. Returns the saved blend (for printing) or null on failure. */
  const handleSubmitBlend = async (input: BlendSubmitInput): Promise<BlendProcess | null> => {
    // A merged blend can use the same lot more than once: add those together
    const byLot = new Map<string, { lotId: string; bagsUsed: number; weightUsed: number }>();
    for (const l of input.lots) {
      if (!l.lotId) {
        triggerToast(`Lot ${l.lotNumber} (${l.mark}) no longer exists, so this blend can't be saved as it is.`, "error");
        return null;
      }
      const id = String(l.lotId);
      const prev = byLot.get(id) ?? { lotId: id, bagsUsed: 0, weightUsed: 0 };
      prev.bagsUsed += l.bagsUsed === "-" ? 0 : Number(l.bagsUsed) || 0;
      prev.weightUsed += Number(l.weightUsed) || 0;
      byLot.set(id, prev);
    }
    const lots = Array.from(byLot.values());

    if (input.editingBlendId) {
      const id = input.editingBlendId;
      const res = await runAction(
        () => updateFactoryBlend({ blendId: id, blendName: input.blendName, lots }),
        r => `Blend updated: ${r.blendName}.`,
        reloadBlendState
      );
      if (!res) return null;
      return lastBlendsRef.current?.find(b => b.id === id) ?? null;
    }

    const res = await runAction(
      () => createFactoryBlend({ blendName: input.blendName, batchNo: input.batchNo, date: input.date, lots }),
      r => `Blend saved: ${r.blendName}. Sending to printer.`,
      reloadBlendState
    );
    if (!res) return null;
    return lastBlendsRef.current?.find(b => b.id === res.blendId) ?? null;
  };

  const handleFinalizeBlend = (input: FinalizeInput) =>
    runAction(
      () =>
        finalizeFactoryBlend({
          blendId: input.blendId,
          returnedLoose: input.returnedLoose,
          returnLotId: "l-balance",
          outputs: input.outputs
        }),
      res => `Blend finalized. Output ${Number(res.totalOutputQuantity ?? 0).toFixed(2)} kg added to packet stock.`
    ).then(res => !!res);

  const handleDeleteBlend = (blend: BlendProcess) => {
    setDeleteModal({
      title: "Delete Blend?",
      message: `Delete "${blend.blendName}"? Its ${blend.totalQuantity.toFixed(2)} kg will be returned to the loose lots it came from.`,
      confirmText: "Delete blend",
      run: password => deleteFactoryBlend(blend.id, password),
      successMessage: `Blend "${blend.blendName}" deleted and stock returned.`
    });
  };

  const handleDuplicateBlend = (blend: BlendProcess) =>
    handleSubmitBlend({
      editingBlendId: null,
      blendName: blend.blendName,
      batchNo: blend.batchNo,
      date: new Date().toISOString().split("T")[0],
      lots: blend.lotsUsed
    }).then(saved => !!saved);

  /** Merge blends under process (after confirmation). */
  const handleMergeBlends = (blends: BlendProcess[]) => {
      const total = blends.reduce((sum, b) => sum + b.totalQuantity, 0);
      setConfirmModal({
        title: `Merge ${blends.length} Blends?`,
        message: `Combine ${blends.map(b => `"${b.blendName}"`).join(", ")} into one new blend of ${total.toFixed(2)} kg? Stock does not change. The merged blend gets a new serial number; the originals' numbers stay recorded as used.`,
        onConfirm: () => {
          runAction(
            () => mergeFactoryBlends(blends.map(b => b.id)),
            res => `Merged into ${res.blendName} (${Number(res.totalQuantity).toFixed(2)} kg).`
          );
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
      ? [
          { id: "missing_blends", label: "Gap Analysis", icon: AlertTriangle, badge: missingBlends.length },
          { id: "stock_take", label: "Stock Take", icon: AlertTriangle }
        ]
      : [])
  ];

  return (
    <div className="flex flex-col w-full max-w-full flex-1">
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

      {/* Delete password dialog */}
      <PasswordConfirmModal
        isOpen={!!deleteModal}
        title={deleteModal?.title || ""}
        message={deleteModal?.message || ""}
        confirmText={deleteModal?.confirmText}
        onConfirm={confirmDelete}
        onClose={() => setDeleteModal(null)}
      />

      {/* Sticky Top Navbar Controlling Factory Navigation */}
      <div className="sticky top-0 z-30 pt-1 pb-3 -mt-1 bg-[#FAFBF8]/90 backdrop-blur-md print:hidden">
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
            packetCatalog={packetCatalog}
            historyList={historyList}
            isBusy={isBusy}
            onReceiveLooseLot={handleReceiveLooseLot}
            onDeleteLoose={handleDeleteLooseItem}
            onPurgeNilLoose={handlePurgeNilLooseStock}
            isPurging={isBusy}
            onLedgerAdjustment={handleLedgerAdjustment}
            onEditLooseItem={handleEditLooseItem}
            onEditCatalogProduct={handleEditCatalogProduct}
            onDeleteCatalog={handleDeleteCatalogProduct}
            onReceivePacketStock={handleReceivePacketStock}
            isCatalogUnlocked={canManage}
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
            isBusy={isBusy}
            onSubmitBlend={handleSubmitBlend}
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
            packetCatalog={packetCatalog}
            looseInventory={looseInventory}
            isBusy={isBusy}
            canDelete={canManage}
            onFinalizeBlend={handleFinalizeBlend}
            onDeleteBlend={handleDeleteBlend}
            onDuplicateBlend={handleDuplicateBlend}
            onMergeBlends={handleMergeBlends}
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

        {activeTab === "stock_take" && (
          <StockTakeModule
            looseInventory={looseInventory}
            canManage={canManage}
            triggerToast={triggerToast}
            onApplied={reloadAll}
          />
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

