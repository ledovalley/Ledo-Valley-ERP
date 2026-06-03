import React, { useState, useMemo, useEffect } from 'react';
import { Printer, Search, ArrowLeft } from 'lucide-react';
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
  triggerToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function BlendModule({ 
  looseInventory, 
  setLooseInventory, 
  underProcess, 
  setUnderProcess, 
  historyList,
  setHistoryList,
  setActiveTab, 
  setPrintBlend, 
  triggerToast 
}: BlendModuleProps) {
  const [blendName, setBlendName] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [selectedLots, setSelectedLots] = useState<Record<string, number>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMark, setFilterMark] = useState('');
  const [filterGrade, setFilterGrade] = useState('');

  // Auto-generate next batch number
  useEffect(() => {
    let maxNumber = 0;
    const regex = /^BLEND-LV-(\d{3,})$/;
    
    underProcess.forEach(p => {
      if (p.batchNo) {
        const match = p.batchNo.match(regex);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNumber) maxNumber = num;
        }
      }
    });

    historyList.forEach(h => {
      if (h.details && h.details.batchNo) {
        const match = String(h.details.batchNo).match(regex);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNumber) maxNumber = num;
        }
      }
    });

    const nextBatch = String(maxNumber + 1).padStart(3, '0');
    setBatchNo(nextBatch);
  }, [underProcess, historyList]);

  const uniqueMarks = useMemo(() => [...new Set(looseInventory.map(i => i.mark))].filter(Boolean).sort(), [looseInventory]);
  const uniqueGrades = useMemo(() => [...new Set(looseInventory.map(i => i.grade))].filter(Boolean).sort(), [looseInventory]);

  const filteredInv = useMemo(() => {
    return looseInventory.filter(i => {
      // Hide empty lots, but keep l-balance if it has weight
      if (i.bags <= 0 && i.id !== 'l-balance') return false;
      if (i.id === 'l-balance' && i.weight <= 0) return false; 

      const matchesSearch = !searchTerm || 
        i.lotNumber.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (i.labels && i.labels.some(l => l.toLowerCase().includes(searchTerm.toLowerCase())));
      
      const matchesMark = !filterMark || i.mark === filterMark;
      const matchesGrade = !filterGrade || i.grade === filterGrade;

      return matchesSearch && matchesMark && matchesGrade;
    });
  }, [looseInventory, searchTerm, filterMark, filterGrade]);

  const handleLotSelect = (lotId: string, checked: boolean) => {
    const newSelected = { ...selectedLots };
    if (checked) {
      const lot = looseInventory.find(i => i.id === lotId);
      if (lot) {
        newSelected[lotId] = lot.id === 'l-balance' ? lot.weight : lot.bags; 
      }
    } else {
      delete newSelected[lotId];
    }
    setSelectedLots(newSelected);
  };

  const handleInputQtyChange = (lotId: string, valInput: string) => {
    if (lotId === 'l-balance') {
      setSelectedLots({ ...selectedLots, [lotId]: parseFloat(valInput) || 0 });
    } else {
      setSelectedLots({ ...selectedLots, [lotId]: parseInt(valInput) || 0 });
    }
  };

  const getLotCalculatedWeight = (lot: LooseLot, qtyToUse: number) => {
    if (lot.id === 'l-balance') return parseFloat(qtyToUse.toString()) || 0;
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
    if (!blendName) return triggerToast("Blend Target Name is required", "error");
    if (Object.keys(selectedLots).length === 0) return triggerToast("Please select at least one lot to compose the blend", "error");
    if (totalBlendWeight <= 0) return triggerToast("Selected blend input weight must be greater than zero", "error");
    
    const finalBatchNo = `BLEND-LV-${batchNo}`;
    
    const isDuplicate = underProcess.some(p => p.batchNo === finalBatchNo) || 
                        historyList.some(h => h.details?.batchNo === finalBatchNo);
    if (isDuplicate) {
      return triggerToast(`Batch code ${finalBatchNo} already exists! Please use a unique number.`, "error");
    }

    for (const lotId in selectedLots) {
      const lot = looseInventory.find(i => i.id === lotId);
      if (!lot) continue;
      if (lot.id === 'l-balance' && selectedLots[lotId] > lot.weight) {
        return triggerToast(`Insufficient stock in Loose Tea Balance! Only ${lot.weight} kg available.`, "error");
      } else if (lot.id !== 'l-balance' && selectedLots[lotId] > lot.bags) {
        return triggerToast(`Insufficient stock! Cannot book ${selectedLots[lotId]} bags from ${lot.lotNumber}. Only ${lot.bags} bags exist.`, "error");
      }
    }

    const updatedLoose = looseInventory.map(lot => {
      if (selectedLots[lot.id]) {
        if (lot.id === 'l-balance') {
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

    const lotsUsedArray = Object.keys(selectedLots).map(id => {
      const l = looseInventory.find(i => i.id === id);
      if (!l) return null;
      const qtyUsed = selectedLots[id];
      return { 
        lotId: id, 
        lotNumber: l.lotNumber, 
        mark: l.mark, 
        bagsUsed: id === 'l-balance' ? '-' : qtyUsed,
        weightUsed: getLotCalculatedWeight(l, qtyUsed)
      };
    }).filter(Boolean) as BlendProcess['lotsUsed'];

    const newBlend: BlendProcess = {
      id: 'BLD-' + Date.now().toString().slice(-6),
      blendName,
      batchNo: finalBatchNo,
      totalQuantity: totalBlendWeight,
      status: 'PENDING',
      date: new Date().toISOString().split('T')[0],
      lotsUsed: lotsUsedArray
    };

    setLooseInventory(updatedLoose);
    setUnderProcess([...underProcess, newBlend]);
    
    // Log history of creation
    const creationHistory = {
      id: `HST-${Date.now()}`,
      type: 'BLEND_INITIATED',
      desc: `Initiated blend instruction: ${blendName} (${finalBatchNo || 'No Batch'}) for ${totalBlendWeight.toFixed(2)} kg.`,
      timestamp: new Date().toISOString(),
      details: newBlend
    };
    setHistoryList((prev: any) => [creationHistory, ...prev]);

    triggerToast(`Blend [${newBlend.id}] created and sent to printer.`);
    setPrintBlend(newBlend); 
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
        <button onClick={handleSubmitBlend} className="bg-[#0B172B] hover:bg-[#009965] shadow-[0_10px_20px_rgba(11,23,43,0.15)] text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-semibold text-xs self-stretch sm:self-auto justify-center transition-colors">
          <Printer size={16} /> Submit & Print Blend Sheet
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div>
          <label className="block text-xs font-bold text-[#0B172B]/70 uppercase mb-1">Blend Target Name *</label>
          <input type="text" placeholder="e.g. Ledo Premium Classic" value={blendName} onChange={(e) => setBlendName(e.target.value)} className="w-full px-4 py-3 border border-[#0B172B]/10 rounded-xl bg-[#F0F5F9]/50 focus:bg-white focus:ring-2 focus:ring-[#009965]/20 focus:border-[#009965] outline-none transition-all duration-200 text-sm font-medium text-[#0B172B] placeholder-[#0B172B]/40" />
        </div>
        <div>
          <label className="block text-xs font-bold text-[#0B172B]/70 uppercase mb-1">Batch Code Prefix (Fixed) & Number *</label>
          <div className="flex items-center w-full px-4 py-3 border border-[#0B172B]/10 rounded-xl bg-[#F0F5F9]/50 focus-within:bg-white focus-within:ring-2 focus-within:ring-[#009965]/20 focus-within:border-[#009965] transition-all duration-200">
            <span className="text-[#0B172B]/60 font-bold text-sm mr-1 select-none">BLEND-LV-</span>
            <input type="text" placeholder="001" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} className="bg-transparent outline-none text-sm font-medium text-[#0B172B] placeholder-[#0B172B]/40 flex-1 w-full" />
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
              value={filterMark}
              onChange={e => setFilterMark(e.target.value)}
              className="w-full sm:w-40 py-2 px-3 text-xs border border-[#0B172B]/10 rounded-xl bg-white outline-none text-[#0B172B]/70 font-medium focus:ring-1 focus:ring-[#009965]"
            >
              <option value="">All Marks</option>
              {uniqueMarks.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
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
                <th className="p-3 font-bold text-xs text-[#0B172B]/55 uppercase tracking-wider border-b border-[#0B172B]/8">Lot Details</th>
                <th className="p-3 font-bold text-xs text-[#0B172B]/55 uppercase tracking-wider border-b border-[#0B172B]/8">Labels</th>
                <th className="p-3 font-bold text-xs text-[#0B172B]/55 uppercase tracking-wider text-right border-b border-[#0B172B]/8">Available Stock</th>
                <th className="p-3 font-bold text-xs text-[#0B172B] uppercase tracking-wider text-right w-44 bg-[#F0F5F9]/50 border-b border-[#0B172B]/8">Allocated Input</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0B172B]/5 text-xs">
              {filteredInv.map(lot => (
                <tr key={lot.id} className={`group hover:bg-[#F0F5F9]/50 transition-all ${selectedLots[lot.id] !== undefined ? 'bg-[#F0F5F9]/50' : ''}`}>
                  <td className="p-3 text-center">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 text-[#009965] rounded border-[#0B172B]/20 focus:ring-[#009965] cursor-pointer animate-none"
                      checked={selectedLots[lot.id] !== undefined}
                      onChange={(e) => handleLotSelect(lot.id, e.target.checked)}
                    />
                  </td>
                  <td className="p-3">
                    <div className="font-bold text-[#0B172B] text-sm">{lot.lotNumber}</div>
                    <div className="text-xs text-[#0B172B]/55">{lot.mark} — {lot.grade}</div>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {(lot.labels || []).map((l, i) => <span key={i} className="bg-[#F0F5F9] border border-[#0B172B]/8 text-[#0B172B]/70 text-[9px] px-1.5 py-0.5 rounded font-medium">{l}</span>)}
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    {lot.id === 'l-balance' ? (
                      <div className="font-bold text-[#0B172B]/80">System Ledger</div>
                    ) : (
                      <div className="font-bold text-[#0B172B]/80">{lot.bags} Bags</div>
                    )}
                    <div className="text-[10px] text-[#0B172B]/40">
                      {lot.id === 'l-balance' 
                        ? `(${lot.weight.toFixed(2)} kg Available)` 
                        : `(${lot.weight.toFixed(1)} kg • ${lot.weightPerBag} kg/bag)`}
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    {selectedLots[lot.id] !== undefined && (
                      <div className="flex flex-col items-end">
                        <input 
                          type="number" 
                          max={lot.id === 'l-balance' ? lot.weight : lot.bags}
                          min={lot.id === 'l-balance' ? 0.01 : 1}
                          step={lot.id === 'l-balance' ? 0.01 : 1}
                          value={selectedLots[lot.id] || ''}
                          onChange={(e) => handleInputQtyChange(lot.id, e.target.value)}
                          className="w-full px-3 py-2 border border-[#0B172B]/10 rounded-xl focus:ring-2 focus:ring-[#009965] outline-none text-right font-bold text-[#0B172B] bg-white shadow-sm"
                          placeholder={lot.id === 'l-balance' ? 'Kg' : 'Bags'}
                        />
                        <span className="text-[10px] text-[#004825] mt-0.5 font-bold font-mono">
                          {lot.id === 'l-balance' ? 'kg' : `= ${getLotCalculatedWeight(lot, selectedLots[lot.id]).toFixed(1)} kg`}
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
