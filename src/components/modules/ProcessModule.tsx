import React, { useState, useMemo } from 'react';
import { 
  Boxes, ArrowRight, TrendingDown, Trash2, 
  Plus, Combine, Settings2, Check, Printer 
} from 'lucide-react';
import { BlendProcess, CatalogProduct, LooseLot, HistoryRecord } from '@/types';

interface ProcessModuleProps {
  underProcess: BlendProcess[];
  setUnderProcess: React.Dispatch<React.SetStateAction<BlendProcess[]>>;
  packetCatalog: CatalogProduct[];
  setPacketCatalog: React.Dispatch<React.SetStateAction<CatalogProduct[]>>;
  looseInventory: LooseLot[];
  setLooseInventory: React.Dispatch<React.SetStateAction<LooseLot[]>>;
  historyList: HistoryRecord[];
  setHistoryList: React.Dispatch<React.SetStateAction<HistoryRecord[]>>;
  setPrintBlend: (blend: BlendProcess | null) => void;
  triggerToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function ProcessModule({ 
  underProcess, 
  setUnderProcess, 
  packetCatalog, 
  setPacketCatalog, 
  looseInventory, 
  setLooseInventory, 
  historyList, 
  setHistoryList, 
  setPrintBlend,
  triggerToast 
}: ProcessModuleProps) {
  const [selectedForMerge, setSelectedForMerge] = useState<string[]>([]);
  const [activeFinalizingBlend, setActiveFinalizingBlend] = useState<BlendProcess | null>(null);
  const [producedLines, setProducedLines] = useState<{productId: string; quantity: string}[]>([
    { productId: '', quantity: '' }
  ]);
  const [returnedLooseWeight, setReturnedLooseWeight] = useState('');

  const toggleMergeSelect = (id: string) => {
    if (selectedForMerge.includes(id)) {
      setSelectedForMerge(selectedForMerge.filter(i => i !== id));
    } else {
      setSelectedForMerge([...selectedForMerge, id]);
    }
  };

  const handleMerge = () => {
    if (selectedForMerge.length < 2) return triggerToast("Select at least 2 blends to merge together", "error");
    
    const blendsToMerge = underProcess.filter(b => selectedForMerge.includes(b.id));
    
    const newMergedBlend: BlendProcess = {
      id: 'MRG-' + Date.now().toString().slice(-6),
      blendName: `Merged: ${blendsToMerge.map(b => b.blendName).join(' + ')}`,
      batchNo: blendsToMerge.map(b => b.batchNo).filter(b => b).join(', '),
      totalQuantity: blendsToMerge.reduce((sum, b) => sum + b.totalQuantity, 0),
      status: 'PENDING',
      date: new Date().toISOString().split('T')[0],
      lotsUsed: blendsToMerge.flatMap(b => b.lotsUsed) 
    };

    const remaining = underProcess.filter(b => !selectedForMerge.includes(b.id));
    setUnderProcess([...remaining, newMergedBlend]);
    setSelectedForMerge([]);
    triggerToast("In-process streams consolidated successfully!");
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

  const submitFinalization = () => {
    if (!activeFinalizingBlend) return;
    
    if (producedLines.some(line => line.productId && !line.quantity)) {
      return triggerToast("Select a quantity for all selected output lines.", "error");
    }

    setPacketCatalog(prev => {
      return prev.map(catalogItem => {
        const matches = calculatedOutputs.filter(o => o.productId === catalogItem.id);
        if (matches.length > 0) {
          const addedQty = matches.reduce((sum, current) => sum + parseFloat(current.quantity), 0);
          return {
            ...catalogItem,
            stock: catalogItem.stock + addedQty
          };
        }
        return catalogItem;
      });
    });

    const returnedLoose = parseFloat(returnedLooseWeight) || 0;
    if (returnedLoose > 0) {
      setLooseInventory(prev => prev.map(lot => {
        if (lot.id === 'l-balance') {
          return { ...lot, weight: lot.weight + returnedLoose };
        }
        return lot;
      }));
    }

    const finalizedHistory: HistoryRecord = {
      id: 'HST-' + Date.now().toString(),
      type: 'Finalized Process',
      desc: `Finalized blend "${activeFinalizingBlend.blendName}" with yield of ${totalOutputWeight.toFixed(2)} kg.`,
      timestamp: new Date().toISOString(),
      details: {
        ...activeFinalizingBlend,
        status: 'Completed',
        completedDate: new Date().toISOString().split('T')[0],
        totalOutputQuantity: totalOutputWeight,
        returnedLooseWeight: returnedLoose,
        producedItems: calculatedOutputs.filter(o => o.productId).map(o => ({
          productName: o.name,
          quantity: parseFloat(o.quantity),
          unit: o.unit,
          totalWeight: o.totalWeight
        }))
      }
    };

    setHistoryList(prev => [finalizedHistory, ...prev]);
    setUnderProcess(prev => prev.filter(b => b.id !== activeFinalizingBlend.id));
    setActiveFinalizingBlend(null);
    setSelectedForMerge(prev => prev.filter(id => id !== activeFinalizingBlend.id));
    triggerToast(`"${activeFinalizingBlend.blendName}" complete. Stock updated safely!`);
  };

  return (
    <div className="bg-white rounded-2xl border border-[#0B172B]/8 p-6 h-full flex flex-col relative font-sans shadow-[0_10px_30px_rgba(11,23,43,0.04)]">
      
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
                          <select 
                            value={item.productId}
                            onChange={(e) => handleProductLineChange(index, 'productId', e.target.value)}
                            className="w-full px-4 py-3 border border-[#0B172B]/10 rounded-xl bg-white focus:ring-2 focus:ring-[#009965]/30 outline-none transition-all shadow-sm text-sm text-[#0B172B]"
                          >
                            <option value="">-- Select Master Product --</option>
                            {packetCatalog.map(p => (
                              <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                            ))}
                          </select>
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
                className="bg-[#0B172B] hover:bg-[#009965] shadow-[0_5px_15px_rgba(11,23,43,0.1)] text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all"
              >
                Complete Packout & Store Stock
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="border-b border-[#0B172B]/8 pb-4 mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white px-6 -mx-6 -mt-6 pt-6 rounded-t-2xl">
        <div>
          <h2 className="text-xl font-bold text-[#0B172B]">Under Process Blends</h2>
          <p className="text-xs text-[#0B172B]/55">Track and merge active batches, or final-pack them into your fixed packet master inventory catalogs.</p>
        </div>
        {selectedForMerge.length > 1 && (
          <button onClick={handleMerge} className="bg-[#0B172B] hover:bg-[#009965] text-white px-4 py-2.5 rounded-xl flex items-center gap-2 font-semibold text-xs transition-all w-full sm:w-auto justify-center">
            <Combine size={16} /> Merge Selected Processes ({selectedForMerge.length})
          </button>
        )}
      </div>

      {underProcess.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-[#0B172B]/40 py-16">
          <Settings2 size={56} className="mb-4 opacity-30 animate-spin" style={{ animationDuration: '8s' }} />
          <p className="font-semibold text-sm">No blends are currently inside the processing pipeline.</p>
          <p className="text-xs mt-1">Book a new blend on the 'Blend Management' tab to populate this list.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 overflow-auto">
          {underProcess.map(blend => (
            <div key={blend.id} className={`border rounded-xl p-5 transition-all duration-300 relative ${selectedForMerge.includes(blend.id) ? 'border-[#009965] bg-[#009965]/5' : 'border-[#0B172B]/8 bg-white hover:bg-[#F0F5F9]/50 shadow-sm'}`}>
              
              <div className="flex justify-between items-start mb-4 gap-2">
                <div className="flex items-start gap-3">
                  <input 
                    type="checkbox" 
                    checked={selectedForMerge.includes(blend.id)}
                    onChange={() => toggleMergeSelect(blend.id)}
                    className="mt-1 w-4.5 h-4.5 text-[#009965] rounded cursor-pointer border-[#0B172B]/20 focus:ring-[#009965]"
                  />
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
                  <span className="font-bold text-[#0B172B] text-sm font-mono">Input Weight: {blend.totalQuantity.toFixed(1)} kg</span>
                </div>
                <p className="font-semibold text-[#0B172B] mb-2">Composed Lots Booked:</p>
                <div className="max-h-24 overflow-y-auto pr-2 space-y-1.5">
                  {blend.lotsUsed.map((l: any, i: number) => (
                    <div key={i} className="flex justify-between text-[#0B172B]/70 font-mono">
                      <span>• {l.lotNumber} ({l.mark})</span>
                      <span className="font-bold text-[#0B172B]">
                        {l.bagsUsed === '-' ? `${l.weightUsed.toFixed(1)} kg` : `${l.bagsUsed} bags (${l.weightUsed.toFixed(1)} kg)`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button 
                  onClick={() => setPrintBlend(blend)}
                  className="bg-white text-[#0B172B]/70 border border-[#0B172B]/10 hover:bg-[#F0F5F9] hover:text-[#009965] px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                  title="Print Blend Ticket"
                >
                  <Printer size={14} /> Print
                </button>
                <button 
                  onClick={() => initFinalizeFlow(blend)}
                  className="bg-white text-[#0B172B]/70 border border-[#0B172B]/10 hover:bg-[#F0F5F9] px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <Check size={14} /> Finalize to Packet Stock
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
