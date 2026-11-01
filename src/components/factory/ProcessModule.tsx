import React, { useState, useMemo, useEffect } from 'react';
import { 
  Boxes, ArrowRight, TrendingDown, Trash2, Search,
  Plus, Combine, Settings2, Check, Printer, Edit2, Copy, Loader2
} from 'lucide-react';
import { BlendProcess, CatalogProduct, LooseLot } from '@/types/factory';
import type { FinalizeInput } from '@/app/factory/FactoryDashboardClient';

interface ProcessModuleProps {
  underProcess: BlendProcess[];
  packetCatalog: CatalogProduct[];
  looseInventory: LooseLot[];
  /** true while any save is in progress */
  isBusy: boolean;
  /** admins and managers may delete blends */
  canDelete: boolean;
  /** Each of these saves to the database; they resolve to true only if it saved. */
  onFinalizeBlend: (input: FinalizeInput) => Promise<boolean>;
  onDeleteBlend: (blend: BlendProcess) => void;
  onDuplicateBlend: (blend: BlendProcess) => Promise<boolean>;
  /** Asks for confirmation, then merges the blends on the server */
  onMergeBlends: (blends: BlendProcess[]) => void;
  setPrintBlend: (blend: BlendProcess | null) => void;
  onRevertAndEdit: (blend: BlendProcess) => void;
  triggerToast: (msg: string, type?: 'success' | 'error') => void;
  systemUser: any;
  logSystemAction?: (action: string, details: string, isError?: boolean) => void;
}

function SearchableProductSelect({ value, onChange, catalog }: { value: string, onChange: (val: string) => void, catalog: CatalogProduct[] }) {
  const [search, setSearch] = React.useState('');
  const [isOpen, setIsOpen] = React.useState(false);
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const selected = catalog.find(p => p.id === value);
    if (selected && !isOpen) {
      setSearch(`${selected.name} (${selected.unit})`);
    } else if (!value && !isOpen) {
      setSearch('');
    }
  }, [value, catalog, isOpen]);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  const filtered = catalog.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <input
        type="text"
        placeholder="-- Search Master Product --"
        value={search}
        onFocus={() => { setIsOpen(true); setSearch(''); }}
        onChange={(e) => { setSearch(e.target.value); setIsOpen(true); }}
        className="w-full px-4 py-3 border border-[#0B172B]/10 rounded-xl bg-white focus:ring-2 focus:ring-[#009965]/30 outline-none transition-all shadow-sm text-sm text-[#0B172B]"
      />
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-[#0B172B]/10 rounded-xl shadow-[0_10px_25px_rgba(0,0,0,0.1)] max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-3 text-sm text-[#0B172B]/50 italic">No matching products...</div>
          ) : (
            filtered.map(p => (
              <div 
                key={p.id}
                className="px-4 py-2 hover:bg-[#F0F5F9] cursor-pointer text-sm text-[#0B172B] border-b border-gray-50 last:border-0"
                onClick={() => {
                  onChange(p.id);
                  setSearch(`${p.name} (${p.unit})`);
                  setIsOpen(false);
                }}
              >
                <div className="font-bold">{p.name}</div>
                <div className="text-[#0B172B]/50 text-xs">Size: {p.size} kg • Unit: {p.unit}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function ProcessModule({ 
  underProcess, 
  packetCatalog, 
  looseInventory, 
  isBusy,
  canDelete,
  onFinalizeBlend,
  onDeleteBlend,
  onDuplicateBlend,
  onMergeBlends,
  setPrintBlend,
  onRevertAndEdit,
  triggerToast,
  systemUser
}: ProcessModuleProps) {
  const [selectedForMerge, setSelectedForMerge] = useState<string[]>([]);
  const [activeFinalizingBlend, setActiveFinalizingBlend] = useState<BlendProcess | null>(null);
  const [producedLines, setProducedLines] = useState<{productId: string; quantity: string}[]>([
    { productId: '', quantity: '' }
  ]);
  const [returnedLooseWeight, setReturnedLooseWeight] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMark, setFilterMark] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [sortBy, setSortBy] = useState('date_desc');

  // Extract unique constituent marks present across in-process blends
  const uniqueMarks = useMemo(() => {
    const marks = new Set<string>();
    underProcess.forEach(b => {
      (b.lotsUsed || []).forEach(l => {
        if (l.mark) marks.add(l.mark);
      });
    });
    return Array.from(marks).sort();
  }, [underProcess]);

  const filteredUnderProcess = useMemo(() => {
    let result = underProcess.filter(b => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesQuery =
          b.blendName.toLowerCase().includes(q) ||
          (b.batchNo && b.batchNo.toLowerCase().includes(q)) ||
          b.id.toLowerCase().includes(q) ||
          (b.lotsUsed || []).some(l =>
            l.lotNumber.toLowerCase().includes(q) ||
            l.mark.toLowerCase().includes(q) ||
            (l.grade && l.grade.toLowerCase().includes(q))
          );
        if (!matchesQuery) return false;
      }

      // 2. Filter by Constituent Tea Mark
      if (filterMark) {
        const hasMark = (b.lotsUsed || []).some(l => l.mark === filterMark);
        if (!hasMark) return false;
      }

      // 3. Filter by Initiation Date
      if (filterDate && b.date !== filterDate) {
        return false;
      }

      return true;
    });

    // 4. Sort
    result.sort((a, b) => {
      if (sortBy === 'date_desc') {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
      if (sortBy === 'date_asc') {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      }
      if (sortBy === 'weight_desc') {
        return b.totalQuantity - a.totalQuantity;
      }
      if (sortBy === 'weight_asc') {
        return a.totalQuantity - b.totalQuantity;
      }
      if (sortBy === 'name_asc') {
        return a.blendName.localeCompare(b.blendName);
      }
      return 0;
    });

    return result;
  }, [underProcess, searchQuery, filterMark, filterDate, sortBy]);

  // Drop selections for blends that no longer exist (merged, finalized, deleted)
  useEffect(() => {
    setSelectedForMerge(prev => {
      const next = prev.filter(id => underProcess.some(b => b.id === id));
      return next.length === prev.length ? prev : next;
    });
  }, [underProcess]);

  const toggleMergeSelect = (id: string) => {
    setSelectedForMerge(prev => (prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]));
  };

  const handleMerge = () => {
    if (isBusy) return;
    if (selectedForMerge.length < 2) return triggerToast("Select at least 2 blends to merge together", "error");
    const blendsToMerge = underProcess.filter(b => selectedForMerge.includes(b.id));
    if (blendsToMerge.length < 2) return triggerToast("Some selected blends no longer exist. Refresh and try again.", "error");
    // Saved on the server after confirmation; the list reloads from the database
    onMergeBlends(blendsToMerge);
  };

  const initFinalizeFlow = (blend: BlendProcess) => {
    setActiveFinalizingBlend(blend);
    setProducedLines([{ productId: '', quantity: '' }]);
    setReturnedLooseWeight('');
  };

  const handleAddProductLine = () => {
    setProducedLines([...producedLines, { productId: '', quantity: '' }]);
  };

  const handleRemoveProductLine = (index: number) => {
    setProducedLines(producedLines.filter((_, idx) => idx !== index));
  };

  const handleProductLineChange = (index: number, field: 'productId'|'quantity', value: string) => {
    const updated = [...producedLines];
    updated[index][field] = value;
    setProducedLines(updated);
  };

  const calculatedOutputs = useMemo(() => {
    return producedLines.map(line => {
      const p = packetCatalog.find(catalogItem => catalogItem.id === line.productId);
      const qty = parseFloat(line.quantity) || 0;
      if (!p) return { ...line, size: 0, unit: 'Unit', name: '', totalWeight: 0 };
      return {
        ...line,
        name: p.name,
        size: p.size,
        unit: p.unit,
        totalWeight: qty * p.size
      };
    });
  }, [producedLines, packetCatalog]);

  const totalOutputWeight = useMemo(() => {
    const packetsWeight = calculatedOutputs.reduce((sum, item) => sum + item.totalWeight, 0);
    const looseWeight = parseFloat(returnedLooseWeight) || 0;
    return packetsWeight + looseWeight;
  }, [calculatedOutputs, returnedLooseWeight]);

  const submitFinalization = async () => {
    if (!activeFinalizingBlend || isBusy) return;

    const returnedLoose = parseFloat(returnedLooseWeight) || 0;
    if (returnedLoose < 0) {
      return triggerToast("Returned loose weight cannot be negative.", "error");
    }

    // Allow finishing with only returned loose tea (no packets), but not with nothing at all
    const lines = producedLines.filter(l => l.productId || l.quantity);
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].productId) {
        return triggerToast(`Line ${i + 1}: Please select a catalog product.`, "error");
      }
      const q = parseFloat(lines[i].quantity);
      if (isNaN(q) || q <= 0) {
        return triggerToast(`Line ${i + 1}: Quantity must be greater than 0.`, "error");
      }
    }
    if (lines.length === 0 && returnedLoose <= 0) {
      return triggerToast("Add at least one packed product or returned loose weight.", "error");
    }

    if (!window.confirm(`Declare "${activeFinalizingBlend.blendName}" complete? This adds the packed output to packet stock and cannot be undone from this screen.`)) {
      return;
    }

    const saved = await onFinalizeBlend({
      blendId: activeFinalizingBlend.id,
      returnedLoose,
      outputs: lines.map(l => ({ productId: l.productId, quantity: parseFloat(l.quantity) }))
    });

    // Close the dialog only if it saved; on failure keep what the user entered
    if (saved) {
      setActiveFinalizingBlend(null);
    }
  };

  const handleDeleteBlend = (blend: BlendProcess) => {
    if (!canDelete) {
      return triggerToast("Permission Denied: Only admins and managers can delete blends.", "error");
    }
    // The parent asks for confirmation, then deletes and returns stock on the server
    onDeleteBlend(blend);
  };

  const handleDuplicateBlend = async (blend: BlendProcess) => {
    if (isBusy) return;
    const shortfalls: string[] = [];

    // Add up repeated lots first (a merged blend can use the same lot more than once)
    const needed = new Map<string, { mark: string; lotNumber: string; lotId: string | null | undefined; weight: number; bags: number }>();
    for (const used of blend.lotsUsed) {
      const key = used.lotId || `${used.mark}|${used.lotNumber}`;
      const prev = needed.get(key) ?? { mark: used.mark, lotNumber: used.lotNumber, lotId: used.lotId, weight: 0, bags: 0 };
      prev.weight += Number(used.weightUsed) || 0;
      prev.bags += used.bagsUsed === '-' ? 0 : Number(used.bagsUsed) || 0;
      needed.set(key, prev);
    }

    for (const used of needed.values()) {
      const lot = used.lotId ? looseInventory.find(l => l.id === used.lotId) : undefined;
      if (!lot) {
        shortfalls.push(`- ${used.mark} (${used.lotNumber}): lot no longer exists in inventory.`);
        continue;
      }
      if (lot.weight < used.weight) {
        shortfalls.push(`- ${used.mark} (${used.lotNumber}): short by ${(used.weight - lot.weight).toFixed(2)} kg`);
      }
      if (lot.bags < used.bags) {
        shortfalls.push(`- ${used.mark} (${used.lotNumber}): short by ${used.bags - lot.bags} bag(s)`);
      }
    }

    if (shortfalls.length > 0) {
      alert("Stock not available to duplicate this blend:\n\n" + shortfalls.join("\n"));
      return triggerToast("Duplicate failed: insufficient stock.", "error");
    }

    if (!window.confirm(`Duplicate "${blend.blendName}"? This deducts the same stock again and creates a new blend with its own serial number.`)) {
      return;
    }

    await onDuplicateBlend(blend);
  };

  return (
    <div className="bg-white rounded-2xl border border-[#0B172B]/8 p-4 sm:p-6 flex flex-col relative font-sans shadow-[0_10px_30px_rgba(11,23,43,0.04)]">
      
      {activeFinalizingBlend && (
        <div className="fixed inset-0 bg-[#0B172B]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-[#0B172B]/10 my-auto transform transition-all duration-300">
            <div className="p-6 border-b border-[#0B172B]/8 bg-white rounded-t-2xl">
              <h3 className="text-lg font-bold text-[#0B172B] flex items-center gap-2">
                <Boxes size={22} className="text-[#009965]" />
                Declare Blend Output & Product Sizing
              </h3>
              <p className="text-xs text-[#0B172B]/55 mt-1">
                Select products from your master catalog to declare finalized packaging yields for <strong className="text-[#0B172B]">{activeFinalizingBlend.blendName}</strong>.
              </p>
            </div>

            <div className="p-6 space-y-4 max-h-[400px] overflow-y-auto">
              <div className="bg-[#FFFEE2]/50 p-4 rounded-xl border border-[#0B172B]/10 flex justify-between items-center">
                <div>
                  <span className="text-xs text-[#004825] block uppercase font-bold tracking-wider">Raw Input Weight:</span>
                  <span className="text-lg font-bold text-[#009965] font-mono">{activeFinalizingBlend.totalQuantity.toFixed(2)} kg</span>
                </div>
                <ArrowRight className="text-[#009965]/40 hidden sm:block" />
                <div className="text-right">
                  <span className="text-xs text-[#004825] block uppercase font-bold tracking-wider">Total Output Weight:</span>
                  <span className="text-lg font-bold text-[#004825] font-mono">{totalOutputWeight.toFixed(2)} kg</span>
                </div>
              </div>

              <div className="flex justify-between items-center text-xs bg-[#F0F5F9]/50 border border-[#0B172B]/8 p-3 rounded-xl px-4 font-mono">
                <span className="text-[#0B172B]/55 font-semibold flex items-center gap-1 font-sans">
                  <TrendingDown size={14} className="text-amber-500" /> Weight Variance / System Loss:
                </span>
                <span className={`font-bold ${(activeFinalizingBlend.totalQuantity - totalOutputWeight) < 0 ? 'text-rose-600' : 'text-[#0B172B]'}`}>
                  {(activeFinalizingBlend.totalQuantity - totalOutputWeight).toFixed(2)} kg 
                  {` (${(((activeFinalizingBlend.totalQuantity - totalOutputWeight) / activeFinalizingBlend.totalQuantity) * 100 || 0).toFixed(1)}% variance)`}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0B172B]/70 uppercase tracking-wider mb-2">Configure Pack Sizing Yield Lines</label>
                <div className="space-y-3">
                  {producedLines.map((item, index) => {
                    const matchedCatalogItem = packetCatalog.find(p => p.id === item.productId);
                    return (
                      <div key={index} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-[#F0F5F9]/30 p-3 rounded-xl border border-[#0B172B]/8 relative">
                        <div className="flex-1">
                          <label className="block sm:hidden text-[10px] font-semibold text-[#0B172B]/55">Catalog Product</label>
                          <SearchableProductSelect 
                            value={item.productId}
                            onChange={(val) => handleProductLineChange(index, 'productId', val)}
                            catalog={packetCatalog}
                          />
                        </div>
                        <div className="w-full sm:w-32">
                          <label className="block sm:hidden text-[10px] font-semibold text-[#0B172B]/55">Quantity</label>
                          <input 
                            type="number" 
                            step="0.001"
                            placeholder={matchedCatalogItem ? `No. of ${matchedCatalogItem.unit}s` : "Quantity"} 
                            value={item.quantity} 
                            onChange={(e) => handleProductLineChange(index, 'quantity', e.target.value)}
                            className="w-full px-4 py-3 border border-[#0B172B]/10 rounded-xl bg-white focus:ring-2 focus:ring-[#009965]/30 outline-none transition-all shadow-sm text-sm text-right font-mono text-[#0B172B]" 
                          />
                        </div>
                        <div className="w-full sm:w-28 text-right bg-white p-2 border border-[#0B172B]/10 rounded-xl text-sm font-semibold text-[#0B172B] min-h-[38px] flex items-center justify-end font-mono">
                          {matchedCatalogItem ? `${((parseFloat(item.quantity) || 0) * matchedCatalogItem.size).toFixed(3)} kg` : '0.000 kg'}
                        </div>
                        {producedLines.length > 1 && (
                          <button 
                            onClick={() => handleRemoveProductLine(index)}
                            className="text-[#0B172B]/40 hover:text-rose-600 transition-colors self-center p-1"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <button 
                onClick={handleAddProductLine}
                className="w-full py-3 border-2 border-dashed border-[#009965]/30 hover:border-[#009965] text-[#009965] hover:text-[#004825] font-semibold rounded-xl text-xs flex items-center justify-center gap-1 transition-all bg-[#009965]/5"
              >
                <Plus size={16} /> Add Product Sizing Line
              </button>

              <div className="bg-[#F0F5F9]/80 p-4 rounded-xl border border-[#0B172B]/10 mt-4">
                <label className="block text-xs font-bold text-[#0B172B] uppercase tracking-wider mb-2">Incomplete Blend? Return Loose Tea</label>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-[#0B172B]/70 flex-1">Recovered Loose Tea (kg)</span>
                  <input 
                    type="number" 
                    step="0.001" 
                    min="0"
                    placeholder="0.00" 
                    value={returnedLooseWeight}
                    onChange={(e) => setReturnedLooseWeight(e.target.value)}
                    className="w-full sm:w-32 px-4 py-3 border border-[#0B172B]/10 rounded-xl bg-white focus:ring-2 focus:ring-[#009965]/30 outline-none transition-all shadow-sm text-sm text-right font-mono text-[#0B172B]" 
                  />
                </div>
                <p className="text-[10px] text-[#0B172B]/55 mt-1">Deposits leftover weight back into the 'LOOSE TEA BALANCE' system ledger.</p>
              </div>

            </div>

            <div className="bg-[#F0F5F9] px-6 py-4 flex justify-end gap-3 border-t border-[#0B172B]/8 rounded-b-2xl">
              <button 
                onClick={() => setActiveFinalizingBlend(null)} 
                className="px-4 py-2 text-sm font-semibold text-[#0B172B]/70 hover:text-[#0B172B] transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={submitFinalization} 
                disabled={isBusy}
                className="disabled:opacity-60 disabled:cursor-not-allowed bg-[#0B172B] hover:bg-[#009965] shadow-[0_5px_15px_rgba(11,23,43,0.1)] text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all"
              >
                {isBusy ? <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Saving…</span> : 'Complete Packout & Store Stock'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="border-b border-[#0B172B]/8 pb-4 mb-6 flex flex-col gap-4 bg-white px-6 -mx-6 -mt-6 pt-6 rounded-t-2xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-[#0B172B]">In-Process Blends</h2>
            <p className="text-sm text-[#0B172B]/55">Manage and track blends currently being processed</p>
          </div>
          {systemUser.role !== 'user' && selectedForMerge.length > 1 && (
            <button 
              onClick={handleMerge}
              disabled={isBusy}
              className="disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2 bg-[#0B172B] text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-[#009965] transition-all shadow-sm shrink-0"
            >
              {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Combine size={16} />} Merge ({selectedForMerge.length})
            </button>
          )}
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0B172B]/40" size={15} />
            <input 
              type="text" 
              placeholder="Search blend name, batch, lot or mark..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-[#F0F5F9]/50 border border-[#0B172B]/8 rounded-xl focus:border-[#009965] focus:bg-white outline-none text-xs sm:text-sm shadow-xs transition-all text-[#0B172B]"
            />
          </div>

          {/* Mark Filter */}
          <select
            value={filterMark}
            onChange={(e) => setFilterMark(e.target.value)}
            className="py-2.5 px-3 text-xs border border-[#0B172B]/10 rounded-xl bg-white outline-none text-[#0B172B]/80 font-medium focus:ring-1 focus:ring-[#009965] shrink-0"
          >
            <option value="">All Tea Marks</option>
            {uniqueMarks.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          {/* Date Filter */}
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            title="Filter by initiation date"
            className="py-2 px-3 text-xs border border-[#0B172B]/10 rounded-xl bg-white outline-none text-[#0B172B]/80 font-medium focus:ring-1 focus:ring-[#009965] shrink-0"
          />

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="py-2.5 px-3 text-xs border border-[#0B172B]/10 rounded-xl bg-white outline-none text-[#0B172B]/80 font-medium focus:ring-1 focus:ring-[#009965] shrink-0"
          >
            <option value="date_desc">Newest First</option>
            <option value="date_asc">Oldest First</option>
            <option value="weight_desc">Highest Weight</option>
            <option value="weight_asc">Lowest Weight</option>
            <option value="name_asc">Blend Name (A-Z)</option>
          </select>

          {/* Clear Filters Button if any active */}
          {(searchQuery || filterMark || filterDate || sortBy !== 'date_desc') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setFilterMark('');
                setFilterDate('');
                setSortBy('date_desc');
              }}
              className="py-2 px-3 text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100/70 border border-rose-200/60 rounded-xl transition-all"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {underProcess.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-[#0B172B]/40 py-16">
          <Settings2 size={56} className="mb-4 opacity-30 animate-spin" style={{ animationDuration: '8s' }} />
          <p className="font-semibold text-sm">No blends are currently inside the processing pipeline.</p>
          <p className="text-xs mt-1">Book a new blend on the 'Blend Management' tab to populate this list.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filteredUnderProcess.map(blend => (
            <div key={blend.id} className={`border rounded-xl p-5 transition-all duration-300 relative ${selectedForMerge.includes(blend.id) ? 'border-[#009965] bg-[#009965]/5' : 'border-[#0B172B]/8 bg-white hover:bg-[#F0F5F9]/50 shadow-sm'}`}>
              
              <div className="flex justify-between items-start mb-4 gap-2">
                <div className="flex items-start gap-3">
                  {systemUser.role !== 'user' && (
                    <input 
                      type="checkbox" 
                      checked={selectedForMerge.includes(blend.id)}
                      onChange={() => toggleMergeSelect(blend.id)}
                      disabled={isBusy}
                      title="Select to merge with other blends"
                      className="mt-1 w-4.5 h-4.5 text-[#009965] rounded cursor-pointer border-[#0B172B]/20 focus:ring-[#009965]"
                    />
                  )}
                  <div>
                    <h3 className="font-bold text-[#0B172B] text-base">{blend.blendName}</h3>
                    <p className="text-xs text-[#0B172B]/40 font-mono mt-0.5">ID: {blend.id} {blend.batchNo && `| Batch: ${blend.batchNo}`}</p>
                  </div>
                </div>
                <span className="bg-[#FFFEE2] text-[#004825] text-[10px] font-bold px-2.5 py-1 rounded border border-[#009965]/20 shrink-0 uppercase tracking-wide">
                  {blend.status}
                </span>
              </div>
              
              <div className="bg-[#F0F5F9]/50 rounded-xl p-4 mb-5 border border-[#0B172B]/8 text-xs">
                <div className="flex justify-between mb-3 pb-2 border-b border-[#0B172B]/8">
                  <span className="text-[#0B172B]/55">Initiation Date: <strong className="text-[#0B172B]">{blend.date}</strong></span>
                  <span className="font-bold text-[#0B172B] text-sm font-mono">
                    Bags: {blend.lotsUsed.reduce((sum, l) => sum + (l.bagsUsed === '-' ? 0 : Number(l.bagsUsed)), 0)} | Wt: {blend.totalQuantity.toFixed(1)} kg
                  </span>
                </div>
                <p className="font-semibold text-[#0B172B] mb-2">Composed Lots Booked:</p>
                <div className="max-h-24 overflow-y-auto pr-2 space-y-1.5">
                  {blend.lotsUsed.map((l: any, i: number) => (
                    <div key={i} className="flex justify-between text-[#0B172B]/70 font-mono">
                      <span>• {l.mark} (Lot: {l.lotNumber})</span>
                      <span className="font-bold text-[#0B172B]">
                        {l.bagsUsed === '-' ? `${l.weightUsed.toFixed(1)} kg` : `${l.bagsUsed} bags (${l.weightUsed.toFixed(1)} kg)`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {systemUser.role !== 'user' && (
                <div className="flex justify-end gap-2 flex-wrap">
                  <button 
                    onClick={() => onRevertAndEdit(blend)}
                    className="bg-white text-blue-600 border border-[#0B172B]/10 hover:bg-blue-50 px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                    title="Revert & Edit Blend"
                  >
                    <Edit2 size={14} /> Edit
                  </button>
                  <button 
                    onClick={() => handleDuplicateBlend(blend)}
                    disabled={isBusy}
                    className="bg-white text-[#0B172B]/70 border border-[#0B172B]/10 hover:bg-[#F0F5F9] hover:text-[#009965] px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                    title="Duplicate Blend"
                  >
                    <Copy size={14} /> Duplicate
                  </button>
                  {canDelete && (
                    <button 
                      onClick={() => handleDeleteBlend(blend)}
                      disabled={isBusy}
                      className="bg-white text-rose-500 border border-rose-100 hover:bg-rose-50 px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                      title="Delete Blend"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  )}
                  <button 
                    onClick={() => setPrintBlend(blend)}
                    className="bg-white text-[#0B172B]/70 border border-[#0B172B]/10 hover:bg-[#F0F5F9] hover:text-[#009965] px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                    title="Print Blend Ticket"
                  >
                    <Printer size={14} /> Print
                  </button>
                  <button 
                    onClick={() => initFinalizeFlow(blend)}
                    disabled={isBusy}
                    className="bg-white text-[#0B172B]/70 border border-[#0B172B]/10 hover:bg-[#F0F5F9] px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                  >
                    <Check size={14} /> Finalize to Packet Stock
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
