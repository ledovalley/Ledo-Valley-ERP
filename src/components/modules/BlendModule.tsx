import React, { useState, useMemo, useEffect } from 'react';
import { Printer, Search, ArrowLeft, Lock, X, Check } from 'lucide-react';
import { LooseLot, BlendProcess, HistoryRecord } from '@/types';

interface BlendModuleProps {
  looseInventory: LooseLot[];
  setLooseInventory: React.Dispatch<React.SetStateAction<LooseLot[]>>;
  underProcess: BlendProcess[];
  setUnderProcess: React.Dispatch<React.SetStateAction<BlendProcess[]>>;
  historyList: HistoryRecord[];
  setHistoryList: (val: any) => void;
  setActiveTab: (tab: string) => void;
  setPrintBlend: (blend: BlendProcess | null) => void;
  editingProcess: BlendProcess | null;
  setEditingProcess: (p: BlendProcess | null) => void;
  triggerToast: (msg: string, type?: 'success' | 'error') => void;
  systemUser: any;
}

export default function BlendModule({ 
  looseInventory: propLooseInventory, 
  setLooseInventory, 
  underProcess, 
  setUnderProcess, 
  historyList,
  setHistoryList,
  setActiveTab, 
  setPrintBlend, 
  editingProcess,
  setEditingProcess,
  triggerToast,
  systemUser
}: BlendModuleProps) {
  const [blendName, setBlendName] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [selectedLots, setSelectedLots] = useState<Record<string, number>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filterGrade, setFilterGrade] = useState('');
  const [editedBlendId, setEditedBlendId] = useState<string | null>(null);
  const [initialEditLotIds, setInitialEditLotIds] = useState<Set<string>>(new Set());
  const [originalLotsUsed, setOriginalLotsUsed] = useState<Record<string, number>>({});
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Auto-generate next batch number
  useEffect(() => {
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    setBatchNo(`G-${mm}-${dd}`);
  }, []);

  // Handle Revert & Edit
  useEffect(() => {
    if (editingProcess) {
      setEditedBlendId(editingProcess.id);
      setBlendName(editingProcess.blendName);
      
      const newSelectedLots: Record<string, number> = {};
      const initialIds = new Set<string>();
      const origUsed: Record<string, number> = {};
      editingProcess.lotsUsed.forEach(lot => {
        const qty = lot.lotId.startsWith('l-') ? lot.weightUsed : (parseFloat(lot.bagsUsed as string) || 0);
        newSelectedLots[lot.lotId] = qty;
        origUsed[lot.lotId] = qty;
        initialIds.add(lot.lotId);
      });
      setSelectedLots(newSelectedLots);
      setInitialEditLotIds(initialIds);
      setOriginalLotsUsed(origUsed);
      
      if (setEditingProcess) setEditingProcess(null);
    }
  }, [editingProcess, setEditingProcess]);

  const looseInventory = useMemo(() => {
    return propLooseInventory.map(lot => {
      const origQty = originalLotsUsed[lot.id];
      if (origQty) {
        if (lot.id.startsWith('l-')) {
          return { ...lot, weight: lot.weight + origQty };
        } else {
          return { ...lot, bags: lot.bags + origQty, weight: lot.weight + (origQty * lot.weightPerBag) };
        }
      }
      return lot;
    });
  }, [propLooseInventory, originalLotsUsed]);

  const uniqueGrades = useMemo(() => [...new Set(looseInventory.map(i => i.grade))].filter(Boolean).sort(), [looseInventory]);

  const filteredInv = useMemo(() => {
    let result = looseInventory.filter(i => {
      // Hide empty lots, but keep system ledgers if they have weight
      const isSystem = i.id.startsWith('l-');
      if (i.bags <= 0 && !isSystem) return false;
      if (isSystem && i.weight <= 0) return false; 

      const matchesSearch = !searchTerm || 
        i.lotNumber.toLowerCase().includes(searchTerm.toLowerCase()) || 
        i.mark.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (i.labels && i.labels.some(l => l.toLowerCase().includes(searchTerm.toLowerCase())));
      
      const matchesGrade = !filterGrade || i.grade === filterGrade;

      return matchesSearch && matchesGrade;
    });

    result.sort((a, b) => {
      const aInitial = initialEditLotIds.has(a.id);
      const bInitial = initialEditLotIds.has(b.id);
      if (aInitial && !bInitial) return -1;
      if (!aInitial && bInitial) return 1;

      const aIsSystem = a.id.startsWith('l-');
      const bIsSystem = b.id.startsWith('l-');
      if (aIsSystem && !bIsSystem) return -1;
      if (!aIsSystem && bIsSystem) return 1;
      return 0;
    });

    return result;
  }, [looseInventory, searchTerm, filterGrade, initialEditLotIds]);

  const handleLotSelect = (lotId: string, checked: boolean) => {
    const newSelected = { ...selectedLots };
    if (checked) {
      const lot = looseInventory.find(i => i.id === lotId);
      if (lot) {
        newSelected[lotId] = lot.id.startsWith('l-') ? lot.weight : lot.bags; 
      }
    } else {
      delete newSelected[lotId];
    }
    setSelectedLots(newSelected);
  };

  const handleInputQtyChange = (lotId: string, valInput: string) => {
    if (lotId.startsWith('l-')) {
      setSelectedLots({ ...selectedLots, [lotId]: parseFloat(valInput) || 0 });
    } else {
      setSelectedLots({ ...selectedLots, [lotId]: parseInt(valInput) || 0 });
    }
  };

  const getLotCalculatedWeight = (lot: LooseLot, qtyToUse: number) => {
    if (lot.id.startsWith('l-')) return parseFloat(qtyToUse.toString()) || 0;
    const wtPerBag = parseFloat(lot.weightPerBag.toString()) || 0;
    return qtyToUse * wtPerBag;
  };

  const totalBlendWeight = useMemo(() => {
    return Object.entries(selectedLots).reduce((sum, [lotId, qty]) => {
      const lot = looseInventory.find(i => i.id === lotId);
      if (!lot) return sum;
      return sum + getLotCalculatedWeight(lot, qty);
    }, 0);
  }, [selectedLots, looseInventory]);

  const handleSubmitBlend = () => {
    if (!blendName.trim()) {
      triggerToast("Please provide a target blend name.", "error");
      return;
    }
    if (Object.keys(selectedLots).length === 0) {
      triggerToast("Please select at least one lot to blend.", "error");
      return;
    }

    if (totalBlendWeight <= 0) {
      triggerToast("Selected blend input weight must be greater than zero.", "error");
      return;
    }

    for (const lotId in selectedLots) {
      const lot = looseInventory.find(i => i.id === lotId);
      if (!lot) continue;
      if (lot.id.startsWith('l-') && selectedLots[lotId] > lot.weight) {
        return triggerToast(`Insufficient stock in ${lot.lotNumber}! Only ${lot.weight} kg available.`, "error");
      } else if (!lot.id.startsWith('l-') && selectedLots[lotId] > lot.bags) {
        return triggerToast(`Insufficient stock! Cannot book ${selectedLots[lotId]} bags from ${lot.lotNumber}. Only ${lot.bags} bags exist.`, "error");
      }
    }

    setShowPreviewModal(true);
  };

  const confirmSubmitBlend = () => {
    setShowPreviewModal(false);
    const finalBatchNo = `BLEND-LV-${batchNo}`;

    const lotsUsedArray = Object.keys(selectedLots).map(id => {
      const l = looseInventory.find(i => i.id === id);
      if (!l) return null;
      const qtyUsed = selectedLots[id];
      return { 
        lotId: id, 
        lotNumber: l.lotNumber, 
        mark: l.mark, 
        grade: l.grade,
        labels: l.labels,
        bagsUsed: id.startsWith('l-') ? '-' : qtyUsed,
        weightUsed: getLotCalculatedWeight(l, qtyUsed)
      };
    }).filter(Boolean) as BlendProcess['lotsUsed'];

    const newBlend: BlendProcess = {
      id: editedBlendId || 'BLD-' + Date.now().toString().slice(-6),
      blendName,
      batchNo: finalBatchNo,
      totalQuantity: totalBlendWeight,
      status: 'PENDING',
      date: new Date().toISOString().split('T')[0],
      lotsUsed: lotsUsedArray
    };

    setLooseInventory(prev => {
      // 1. Add back the original lots
      const intermediate = prev.map(lot => {
        const origQty = originalLotsUsed[lot.id];
        if (origQty) {
          if (lot.id.startsWith('l-')) {
            return { ...lot, weight: lot.weight + origQty };
          } else {
            return { ...lot, bags: lot.bags + origQty, weight: lot.weight + (origQty * lot.weightPerBag) };
          }
        }
        return lot;
      });

      // 2. Deduct the new selected lots
      return intermediate.map(lot => {
        if (selectedLots[lot.id]) {
          if (lot.id.startsWith('l-')) {
            const weightToDeduct = selectedLots[lot.id];
            return { ...lot, weight: Math.max(0, lot.weight - weightToDeduct) };
          } else {
            const bagsToDeduct = selectedLots[lot.id];
            const weightToDeduct = getLotCalculatedWeight(lot, bagsToDeduct);
            return { 
              ...lot, 
              bags: Math.max(0, lot.bags - bagsToDeduct),
              weight: Math.max(0, lot.weight - weightToDeduct)
            };
          }
        }
        return lot;
      });
    });
    
    setUnderProcess(prev => {
      const filtered = editedBlendId ? prev.filter(b => b.id !== editedBlendId) : prev;
      return [newBlend, ...filtered];
    });
    
    // Log history of creation or update
    const creationHistory = {
      id: `HST-${Date.now()}`,
      type: editedBlendId ? 'BLEND_UPDATED' : 'BLEND_INITIATED',
      desc: editedBlendId 
        ? `Updated blend instruction: ${blendName} (${finalBatchNo}).` 
        : `Initiated blend instruction: ${blendName} (${finalBatchNo}) for ${totalBlendWeight.toFixed(2)} kg.`,
      timestamp: new Date().toISOString(),
      details: newBlend
    };
    setHistoryList((prev: any) => [creationHistory, ...prev]);

    triggerToast(editedBlendId ? `Blend [${newBlend.id}] successfully updated!` : `Blend [${newBlend.id}] created and sent to printer.`);
    setPrintBlend(newBlend);
    
    // Reset form after submission
    setEditedBlendId(null);
    setInitialEditLotIds(new Set());
    setOriginalLotsUsed({});
    setBlendName('');
    setSelectedLots({});
    
    // Explicitly navigate user to process tab to see the new blend
    setActiveTab('process');
  };

  return (
    <div className="bg-white rounded-2xl border border-[#0B172B]/8 p-6 flex flex-col h-full transition-all shadow-[0_10px_30px_rgba(11,23,43,0.04)]">
      <div className="border-b border-[#0B172B]/8 pb-4 mb-6 flex flex-col sm:flex-row justify-between items-center bg-white px-6 -mx-6 -mt-6 pt-6 rounded-t-2xl gap-4">
        <div>
          <button 
            onClick={() => setActiveTab('inventory')}
            className="text-[#009965] hover:text-[#004825] text-sm font-bold flex items-center gap-1 bg-[#009965]/10 hover:bg-[#009965]/20 px-3 py-1.5 rounded-xl transition-colors mb-2"
          >
            <ArrowLeft size={14} /> Back to Inventory
          </button>
          <h2 className="text-xl font-bold text-[#0B172B]">Create New Blend Sheet</h2>
          <p className="text-xs text-[#0B172B]/55">Select available loose warehouse lots & assign bags for the blend sheet.</p>
        </div>
        {systemUser.role !== 'user' && (
          <div className="flex gap-3">
            <button 
              onClick={handleSubmitBlend}
              className="bg-[#0B172B] hover:bg-[#1a2b4b] text-white px-4 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 shadow-lg text-sm shadow-[#0B172B]/10 transition-all duration-200"
            >
              <Printer size={18} />
              {editedBlendId ? 'Update & Print Blend Sheet' : 'Submit & Print Blend Sheet'}
            </button>
          </div>
        )}
      </div>

      {showPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0B172B]/60 backdrop-blur-sm" onClick={() => setShowPreviewModal(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="flex justify-between items-center p-6 border-b border-[#0B172B]/8 bg-[#F0F5F9]/30">
              <h2 className="text-xl font-bold text-[#0B172B]">Blend Instruction Preview</h2>
              <button onClick={() => setShowPreviewModal(false)} className="text-[#0B172B]/40 hover:text-[#0B172B] hover:bg-[#0B172B]/5 p-2 rounded-xl transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="bg-[#F0F5F9]/50 rounded-xl p-5 border border-[#0B172B]/8 mb-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <span className="block text-[10px] font-bold text-[#0B172B]/50 uppercase tracking-widest mb-1">Target Blend Name</span>
                    <span className="text-lg font-bold text-[#0B172B]">{blendName}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-[#0B172B]/50 uppercase tracking-widest mb-1">Batch Code</span>
                    <span className="text-lg font-bold font-mono text-[#0B172B]">BLEND-LV-{batchNo}</span>
                  </div>
                </div>
              </div>

              <h3 className="font-bold text-[#0B172B] text-sm mb-4">Composed Raw Materials</h3>
              <div className="space-y-3">
                {Object.keys(selectedLots).map(id => {
                  const lot = looseInventory.find(i => i.id === id);
                  if (!lot) return null;
                  const qty = selectedLots[id];
                  const wt = getLotCalculatedWeight(lot, qty);
                  const isSys = id.startsWith('l-');
                  return (
                    <div key={id} className="flex justify-between items-center bg-white border border-[#0B172B]/8 p-4 rounded-xl shadow-sm">
                      <div>
                        <div className="font-bold text-[#0B172B] text-sm flex items-center gap-2">
                          {lot.lotNumber} 
                          {isSys && <span className="bg-[#009965]/10 text-[#009965] text-[10px] px-2 py-0.5 rounded font-bold">SYSTEM</span>}
                        </div>
                        <div className="text-xs text-[#0B172B]/50 mt-0.5">{lot.mark} {lot.grade ? `• ${lot.grade}` : ''}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-[#0B172B] font-mono text-sm">
                          {!isSys ? `${qty} bags` : 'Bulk'}
                        </div>
                        <div className="text-xs text-[#0B172B]/50 font-mono mt-0.5">{wt.toFixed(2)} kg</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-6 border-t border-[#0B172B]/8 bg-white">
              <div className="flex justify-between items-center mb-6 px-4">
                <span className="font-bold text-[#0B172B]/60 uppercase text-xs">Total Target Requirement</span>
                <div className="text-right">
                  <span className="block text-sm font-bold text-[#0B172B]/60">
                    {Object.keys(selectedLots).reduce((acc, id) => acc + (!id.startsWith('l-') ? selectedLots[id] : 0), 0)} bags
                  </span>
                  <span className="block text-2xl font-black text-[#009965]">{totalBlendWeight.toFixed(2)} kg</span>
                </div>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowPreviewModal(false)}
                  className="flex-1 py-3.5 rounded-xl font-bold text-[#0B172B]/60 hover:bg-[#F0F5F9] transition-colors border border-transparent hover:border-[#0B172B]/10"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmSubmitBlend}
                  className="flex-1 py-3.5 rounded-xl font-bold bg-[#009965] hover:bg-[#007a50] text-white flex items-center justify-center gap-2 shadow-lg shadow-[#009965]/20 transition-all duration-200"
                >
                  <Check size={18} />
                  Confirm & Generate Sheet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div>
          <label className="block text-xs font-bold text-[#0B172B]/70 uppercase mb-1">Blend Target Name *</label>
          <input type="text" placeholder="e.g. Ledo Premium Classic" value={blendName} onChange={(e) => setBlendName(e.target.value)} className="w-full px-4 py-3 border border-[#0B172B]/10 rounded-xl bg-[#F0F5F9]/50 focus:bg-white focus:ring-2 focus:ring-[#009965]/20 focus:border-[#009965] outline-none transition-all duration-200 text-sm font-medium text-[#0B172B] placeholder-[#0B172B]/40" />
        </div>
        <div>
          <label className="block text-xs font-bold text-[#0B172B]/70 uppercase mb-1">Batch Code (Fixed)</label>
          <div className="flex items-center w-full px-4 py-3 border border-[#0B172B]/10 rounded-xl bg-[#F0F5F9]/50 transition-all duration-200">
            <input type="text" value={batchNo} readOnly className="bg-transparent outline-none text-sm font-bold text-[#0B172B] flex-1 w-full" />
          </div>
        </div>
      </div>

      <div className="flex flex-col flex-1 border border-[#0B172B]/8 rounded-2xl overflow-hidden shadow-[0_5px_15px_rgba(11,23,43,0.03)]">
        <div className="bg-[#F0F5F9] p-4 border-b border-[#0B172B]/8 flex flex-col gap-3">
          <h3 className="font-bold text-[#0B172B] text-xs uppercase tracking-wider">Select Loose Lots & Allocate Bags</h3>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 text-[#0B172B]/40" size={15} />
              <input 
                type="text" 
                placeholder="Search lot or labels..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-2.5 py-2 text-xs border border-[#0B172B]/10 rounded-xl bg-white outline-none focus:ring-1 focus:ring-[#009965] text-[#0B172B]" 
              />
            </div>
            <select
              value={filterGrade}
              onChange={e => setFilterGrade(e.target.value)}
              className="w-full sm:w-40 py-2 px-3 text-xs border border-[#0B172B]/10 rounded-xl bg-white outline-none text-[#0B172B]/70 font-medium focus:ring-1 focus:ring-[#009965]"
            >
              <option value="">All Grades</option>
              {uniqueGrades.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-white max-h-[300px]">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#F0F5F9] sticky top-0 z-10">
              <tr>
                <th className="p-3 w-12 text-center border-b border-[#0B172B]/8">Select</th>
                <th className="p-3 font-bold text-xs text-[#0B172B]/55 uppercase tracking-wider border-b border-[#0B172B]/8">Lot No.</th>
                <th className="p-3 font-bold text-xs text-[#0B172B]/55 uppercase tracking-wider border-b border-[#0B172B]/8">Brand (Mark)</th>
                <th className="p-3 font-bold text-xs text-[#0B172B]/55 uppercase tracking-wider border-b border-[#0B172B]/8">Grade</th>
                <th className="p-3 font-bold text-xs text-[#0B172B]/55 uppercase tracking-wider border-b border-[#0B172B]/8">Labels</th>
                <th className="p-3 font-bold text-xs text-[#0B172B]/55 uppercase tracking-wider text-right border-b border-[#0B172B]/8">Available Stock</th>
                <th className="p-3 font-bold text-xs text-[#0B172B] uppercase tracking-wider text-right w-44 bg-[#F0F5F9]/50 border-b border-[#0B172B]/8">Allocated Input</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0B172B]/5 text-xs">
              {filteredInv.map(lot => (
                <tr key={lot.id} className={`group hover:bg-[#F0F5F9]/50 transition-all ${selectedLots[lot.id] !== undefined ? 'bg-[#F0F5F9]/50' : ''}`}>
                  <td className="p-3 text-center">
                    {systemUser.role !== 'user' ? (
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 text-[#009965] rounded border-[#0B172B]/20 focus:ring-[#009965] cursor-pointer animate-none"
                        checked={selectedLots[lot.id] !== undefined}
                        onChange={(e) => handleLotSelect(lot.id, e.target.checked)}
                      />
                    ) : (
                      <Lock size={14} className="text-[#0B172B]/20 mx-auto" />
                    )}
                  </td>
                  <td className="p-3">
                    <div className="font-bold text-[#0B172B] text-sm">{lot.lotNumber}</div>
                  </td>
                  <td className="p-3">
                    <div className="font-semibold text-[#0B172B]/80 text-sm">{lot.mark}</div>
                  </td>
                  <td className="p-3">
                    <div className="text-sm text-[#0B172B]/70">{lot.grade}</div>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {(lot.labels || []).map((l, i) => <span key={i} className="bg-[#F0F5F9] border border-[#0B172B]/8 text-[#0B172B]/70 text-[9px] px-1.5 py-0.5 rounded font-medium">{l}</span>)}
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    {lot.id.startsWith('l-') ? (
                      <div className="font-bold text-[#0B172B]/80">System Ledger</div>
                    ) : (
                      <div className="font-bold text-[#0B172B]/80">{lot.bags} Bags</div>
                    )}
                    <div className="text-[10px] text-[#0B172B]/40">
                      {lot.id.startsWith('l-') 
                        ? `(${lot.weight.toFixed(2)} kg Available)` 
                        : `(${lot.weight.toFixed(1)} kg • ${lot.weightPerBag} kg/bag)`}
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    {selectedLots[lot.id] !== undefined && (
                      <div className="flex flex-col items-end">
                        <input 
                          type="number" 
                          max={lot.id.startsWith('l-') ? lot.weight : lot.bags}
                          min={lot.id.startsWith('l-') ? 0.01 : 1}
                          step={lot.id.startsWith('l-') ? 0.01 : 1}
                          value={selectedLots[lot.id] || ''}
                          onChange={(e) => handleInputQtyChange(lot.id, e.target.value)}
                          className="w-full px-3 py-2 border border-[#0B172B]/10 rounded-xl focus:ring-2 focus:ring-[#009965] outline-none text-right font-bold text-[#0B172B] bg-white shadow-sm"
                          placeholder={lot.id.startsWith('l-') ? 'Kg' : 'Bags'}
                        />
                        <span className="text-[10px] text-[#004825] mt-0.5 font-bold font-mono">
                          {lot.id.startsWith('l-') ? 'kg' : `= ${getLotCalculatedWeight(lot, selectedLots[lot.id]).toFixed(1)} kg`}
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-[#FFFEE2]/50 p-4 border-t border-[#0B172B]/8 flex justify-between items-center rounded-b-2xl">
          <span className="font-bold text-[#004825] text-xs uppercase tracking-wider">Aggregate Input Weight:</span>
          <span className="text-xl font-bold text-[#009965] font-mono">{totalBlendWeight.toFixed(2)} kg</span>
        </div>
      </div>
    </div>
  );
}
