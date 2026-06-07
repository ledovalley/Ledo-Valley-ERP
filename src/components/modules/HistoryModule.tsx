import React, { useState, useMemo } from 'react';
import { Network, ArrowDown, Search, Download, Filter, FileText, File, X } from 'lucide-react';
import { HistoryRecord, SystemUser } from '@/types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface HistoryModuleProps {
  historyList: HistoryRecord[];
  systemUser: SystemUser;
  onUndoFinalization?: (record: HistoryRecord) => void;
}

export default function HistoryModule({ historyList = [], systemUser, onUndoFinalization }: HistoryModuleProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [traceModalData, setTraceModalData] = useState<HistoryRecord | null>(null);
  
  const uniqueUsers = useMemo(() => {
    const users = historyList.map(h => h.userName || h.userId).filter(Boolean);
    return [...new Set(users)];
  }, [historyList]);

  const uniqueActions = useMemo(() => {
    const actions = historyList.map(h => h.type).filter(Boolean);
    return [...new Set(actions)];
  }, [historyList]);

  const filteredHistory = useMemo(() => {
    return historyList.filter(h => {
      // User Filter
      if (userFilter && h.userName !== userFilter && h.userId !== userFilter) return false;
      // Action Filter
      if (actionFilter && h.type !== actionFilter) return false;
      
      // Search Term Filter
      if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        const details = h.details;
        const matchesSearch = 
          (details?.blendName || '').toLowerCase().includes(lower) || 
          (details?.date || '').includes(lower) || 
          (details?.completedDate || '').includes(lower) ||
          h.id.toLowerCase().includes(lower) ||
          h.desc.toLowerCase().includes(lower) ||
          h.type.toLowerCase().includes(lower);
        
        if (!matchesSearch) return false;
      }
      return true;
    });
  }, [historyList, searchTerm, userFilter, actionFilter]);

  const exportHistoryCSV = () => {
    let csv = "Blend ID,Blend Name,Batch No,Initiation Date,Completion Date,Total Input Wt (kg),Total Output Wt (kg),Variance / Loss (kg),Returned Loose (kg),Input Lots Details,Final Packets Yield\n";
    filteredHistory.forEach(h => {
      const details = h.details;
      if (!details) return;
      
      const inputStr = details.lotsUsed ? details.lotsUsed.map((l: any) => `${l.lotNumber} [${l.mark}] (${l.weightUsed.toFixed(2)}kg)`).join('; ') : '';
      const outputStr = details.producedItems ? details.producedItems.map((p: any) => `${p.productName} x${p.quantity} (${p.totalWeight.toFixed(2)}kg)`).join('; ') : '';
      const variance = details.totalQuantity !== undefined ? details.totalQuantity - (details.totalOutputQuantity || 0) : 0;
      
      csv += `"${h.id}","${details.blendName || h.desc}","${details.batchNo || ''}","${details.date || h.timestamp.split('T')[0]}","${details.completedDate || ''}","${details.totalQuantity !== undefined ? details.totalQuantity.toFixed(2) : '-'}","${(details.totalOutputQuantity || 0).toFixed(2)}","${variance.toFixed(2)}","${(details.returnedLooseWeight || 0).toFixed(2)}","${inputStr}","${outputStr}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blending_history_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const exportHistoryPDF = () => {
    const doc = new jsPDF('landscape');
    
    doc.setFontSize(16);
    doc.setTextColor(11, 23, 43);
    doc.text('Ledo Valley ERP - Blending History Audit', 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Exported on: ${new Date().toLocaleDateString()}`, 14, 28);

    const tableData = filteredHistory.map(h => {
      const details = h.details;
      if (!details) return [h.id, h.desc, '', '', '', '', ''];
      
      const inputStr = details.lotsUsed ? details.lotsUsed.map((l: any) => `${l.lotNumber} (${l.weightUsed.toFixed(1)}kg)`).join(', ') : '';
      const outputStr = details.producedItems ? details.producedItems.map((p: any) => `${p.productName} x${p.quantity}`).join(', ') : '';
      const variance = details.totalQuantity !== undefined ? details.totalQuantity - (details.totalOutputQuantity || 0) : 0;

      return [
        details.blendName || h.desc,
        details.batchNo || '-',
        details.date || h.timestamp.split('T')[0],
        details.totalQuantity !== undefined ? details.totalQuantity.toFixed(2) : '-',
        (details.totalOutputQuantity || 0).toFixed(2),
        variance.toFixed(2),
        inputStr,
        outputStr
      ];
    });

    autoTable(doc, {
      startY: 35,
      head: [['Blend/Event', 'Batch No', 'Date', 'Input Wt(kg)', 'Output Wt(kg)', 'Variance', 'Lots Used', 'Yield']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [0, 153, 101], textColor: [255, 255, 255] },
      columnStyles: {
        6: { cellWidth: 50 },
        7: { cellWidth: 40 }
      }
    });

    doc.save(`blending_history_export_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="bg-white rounded-2xl border border-[#0B172B]/8 h-full flex flex-col overflow-hidden relative shadow-[0_10px_30px_rgba(11,23,43,0.04)]">
      
      {traceModalData && traceModalData.details && (
        <div className="fixed inset-0 bg-[#0B172B]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-[#0B172B]/10 overflow-hidden transform transition-all flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-[#0B172B]/8 bg-[#F0F5F9]/50 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-[#0B172B] flex items-center gap-2">
                  <Network size={22} className="text-[#009965]" />
                  Batch Traceability Tree
                </h3>
                <p className="text-xs text-[#0B172B]/55 mt-1 font-mono">{traceModalData.id} {traceModalData.details.batchNo && `• BATCH: ${traceModalData.details.batchNo}`}</p>
              </div>
              <div className="flex items-center gap-3">
                  {traceModalData.type === 'Finalized Process' && systemUser.role === 'super_admin' && onUndoFinalization && (
                    <button 
                      onClick={() => {
                        if (confirm(`Are you sure you want to undo the finalization of "${traceModalData.details.blendName}"? This will deduct the created products from your catalog stock and move the blend back to Under Process.`)) {
                          onUndoFinalization(traceModalData);
                          setTraceModalData(null);
                        }
                      }}
                      className="px-3 py-1.5 bg-rose-100 text-rose-700 hover:bg-rose-200 rounded font-semibold text-xs transition-colors flex items-center gap-1 border border-rose-200"
                    >
                      Undo Finalization
                    </button>
                  )}
                  <button onClick={() => setTraceModalData(null)} className="text-[#0B172B]/40 hover:text-[#0B172B] transition-colors p-1 bg-[#F0F5F9] rounded-full">
                    <X size={20} />
                  </button>
                </div>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 flex flex-col items-center gap-4">
              
              <div className="w-full bg-[#F0F5F9]/50 p-4 rounded-xl border border-[#0B172B]/8">
                <span className="text-[10px] font-black tracking-widest text-[#0B172B]/40 uppercase block mb-3">Finished Packaged Goods</span>
                <div className="space-y-2">
                  {traceModalData.details.producedItems && traceModalData.details.producedItems.length > 0 ? (
                    traceModalData.details.producedItems.map((p: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-sm font-semibold text-[#004825] bg-[#FFFEE2]/50 px-3 py-2 rounded-lg border border-[#009965]/20">
                        <span>{p.productName}</span>
                        <span className="font-mono bg-white px-2 py-0.5 rounded border border-[#009965]/20">{p.quantity} {p.unit}s</span>
                      </div>
                    ))
                  ) : <div className="text-sm text-[#0B172B]/40 italic">No packet outputs recorded.</div>}
                  
                  {(traceModalData.details.returnedLooseWeight || 0) > 0 && (
                    <div className="flex justify-between items-center text-sm font-semibold text-[#0B172B] bg-[#F0F5F9] px-3 py-2 rounded-lg border border-[#0B172B]/10">
                      <span>Returned to System Loose Ledger</span>
                      <span className="font-mono bg-white px-2 py-0.5 rounded border border-[#0B172B]/10">{(traceModalData.details.returnedLooseWeight || 0).toFixed(2)} kg</span>
                    </div>
                  )}
                </div>
              </div>

              <ArrowDown size={24} className="text-[#0B172B]/20" />

              <div className="bg-[#0B172B] text-white p-4 rounded-xl w-3/4 text-center relative shadow-[0_10px_20px_rgba(11,23,43,0.15)]">
                <h4 className="font-bold text-lg leading-tight">{traceModalData.details.blendName}</h4>
                <div className="text-xs text-[#F0F5F9]/70 mt-1">Processed: {traceModalData.details.completedDate}</div>
                <div className="absolute -right-3 -top-3 bg-rose-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow border-2 border-white" title="Process Loss/Variance">
                  {((traceModalData.details.totalQuantity - (traceModalData.details.totalOutputQuantity || 0)).toFixed(2))} kg Loss
                </div>
              </div>

              <ArrowDown size={24} className="text-[#0B172B]/20" />

              <div className="w-full bg-[#F0F5F9]/50 p-4 rounded-xl border border-[#0B172B]/8">
                <span className="text-[10px] font-black tracking-widest text-[#0B172B]/40 uppercase block mb-3">Origin Raw Loose Lots</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {traceModalData.details.lotsUsed && traceModalData.details.lotsUsed.map((l: any, i: number) => (
                    <div key={i} className="flex flex-col text-sm border border-[#0B172B]/8 bg-white p-3 rounded-lg shadow-sm">
                      <span className="font-bold text-[#0B172B]">{l.lotNumber}</span>
                      <span className="text-xs text-[#0B172B]/55 mb-2">{l.mark}</span>
                      <div className="mt-auto flex justify-between items-center pt-2 border-t border-[#0B172B]/8">
                        <span className="text-[10px] text-[#0B172B]/40 uppercase font-bold">Input</span>
                        <span className="font-mono font-semibold text-[#009965]">{l.weightUsed.toFixed(2)} kg</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      <div className="p-6 border-b border-[#0B172B]/8 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white">
        <div>
          <h2 className="text-xl font-bold text-[#0B172B] font-sans">Blending Logging Archives</h2>
          <p className="text-xs text-[#0B172B]/55 mt-0.5">Permanent searchable audit records of completed, packaged blends.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
          <div className="flex gap-2 w-full md:w-auto">
            <select 
              value={userFilter}
              onChange={e => setUserFilter(e.target.value)}
              className="px-3 py-3 border border-[#0B172B]/10 rounded-xl outline-none text-xs bg-[#F0F5F9]/50 font-bold transition-all text-[#0B172B] focus:ring-2 focus:ring-[#009965]/30 flex-1 md:w-36"
            >
              <option value="">All Users</option>
              {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            
            <select 
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
              className="px-3 py-3 border border-[#0B172B]/10 rounded-xl outline-none text-xs bg-[#F0F5F9]/50 font-bold transition-all text-[#0B172B] focus:ring-2 focus:ring-[#009965]/30 flex-1 md:w-40"
            >
              <option value="">All Actions</option>
              {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div className="relative w-full md:w-64 shadow-sm">
            <Search className="absolute left-3 top-3 text-[#0B172B]/40" size={16} />
            <input 
              type="text" 
              placeholder="Search log histories..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-3 border border-[#0B172B]/10 rounded-xl focus:ring-2 focus:ring-[#009965]/30 outline-none text-sm bg-[#F0F5F9]/50 font-medium transition-all text-[#0B172B] placeholder-[#0B172B]/40" 
            />
          </div>
          <div className="flex w-full md:w-auto border border-[#0B172B]/10 rounded-xl overflow-hidden shadow-sm shrink-0">
            <button 
              onClick={exportHistoryCSV}
              className="flex-1 md:flex-none px-4 py-3 bg-white hover:bg-[#F0F5F9] text-[#0B172B]/80 text-xs font-bold transition-all flex items-center justify-center gap-2 border-r border-[#0B172B]/10"
              title="Export as CSV"
            >
              <FileText size={16} className="text-blue-600" /> CSV
            </button>
            <button 
              onClick={exportHistoryPDF}
              className="flex-1 md:flex-none px-4 py-3 bg-white hover:bg-[#F0F5F9] text-[#0B172B]/80 text-xs font-bold transition-all flex items-center justify-center gap-2"
              title="Export as PDF"
            >
              <File size={16} className="text-red-500" /> PDF
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-[#F0F5F9] sticky top-0 z-10">
            <tr>
              <th className="p-4 font-bold text-xs text-[#0B172B]/55 uppercase tracking-wider border-b border-[#0B172B]/8">Blend Log Identity</th>
              <th className="p-4 font-bold text-xs text-[#0B172B]/55 uppercase tracking-wider border-b border-[#0B172B]/8">Date Interval</th>
              <th className="p-4 font-bold text-xs text-[#0B172B]/55 uppercase tracking-wider border-b border-[#0B172B]/8">Used Raw Input Lots</th>
              <th className="p-4 font-bold text-xs text-[#0B172B] uppercase tracking-wider border-b border-[#0B172B]/8 bg-[#F0F5F9]/50">Produced Packet Products Output</th>
              <th className="p-4 font-bold text-xs text-[#0B172B]/55 uppercase tracking-wider border-b border-[#0B172B]/8 text-center">Audit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#0B172B]/5 text-sm">
            {filteredHistory.length === 0 ? (
              <tr><td colSpan={5} className="p-16 text-center text-[#0B172B]/40">No completed blending cycles stored in history logbook.</td></tr>
            ) : (
              filteredHistory.map(record => {
                const details = record.details;
                if (!details) return null;
                const processVariance = details.totalQuantity !== undefined ? details.totalQuantity - (details.totalOutputQuantity || 0) : 0;
                
                return (
                  <tr key={record.id} className="group hover:bg-[#F0F5F9]/50 transition-all border-b border-[#0B172B]/5">
                    <td className="p-4 align-top">
                      {record.type === 'LEDGER_ADJUSTMENT' ? (
                        <div className="font-bold text-[#0B172B]">Manual Adjustment: {details.targetName}</div>
                      ) : (
                        <div className="font-bold text-[#0B172B]">{details.blendName || 'Unknown Event'}</div>
                      )}
                      <div className="text-xs text-[#0B172B]/40 font-mono mt-0.5">ID: {record.id}</div>
                      {details.batchNo && (
                        <div className="text-[10px] inline-block bg-[#F0F5F9] text-[#0B172B]/55 px-1.5 py-0.5 rounded mt-1 font-mono font-bold uppercase border border-[#0B172B]/10">
                          Batch: {details.batchNo}
                        </div>
                      )}
                      <div className="mt-2">
                        <span className="text-[10px] bg-[#009965]/10 text-[#009965] border border-[#009965]/20 px-2 py-0.5 rounded font-bold uppercase">
                          {record.type}
                        </span>
                      </div>
                    </td>
                    
                    <td className="p-4 align-top text-xs text-[#0B172B]/70 font-mono leading-relaxed">
                      {record.type === 'LEDGER_ADJUSTMENT' ? (
                        <div>Adjusted: {record.timestamp?.split('T')[0] || details.date}</div>
                      ) : (
                        <>
                          {details.date && <div>Created: {details.date}</div>}
                          {details.completedDate && <div className="text-[#009965] font-semibold mt-1">Packout: {details.completedDate}</div>}
                        </>
                      )}
                    </td>

                    <td className="p-4 align-top">
                      {record.type === 'LEDGER_ADJUSTMENT' ? (
                        <div className="space-y-1">
                          <div className="text-xs text-[#0B172B]/70 font-mono">
                            • Variance/Correction: <span className={details.amount > 0 ? "text-[#009965] font-bold" : "text-rose-500 font-bold"}>{details.amount > 0 ? '+' : ''}{details.amount?.toFixed(2)} kg</span>
                          </div>
                          <div className="text-xs text-[#0B172B] mt-2 italic font-sans border-t border-[#0B172B]/8 pt-1">
                            Reason: {details.reason}
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-1">
                            {details.lotsUsed && details.lotsUsed.map((l: any, i: number) => (
                              <div key={i} className="text-xs text-[#0B172B]/70 font-mono">
                                • {l.lotNumber} ({l.mark}): 
                                {l.bagsUsed === '-' ? (
                                  <> <span className="font-semibold text-[#0B172B]">System Balance</span> ({l.weightUsed.toFixed(1)}kg)</>
                                ) : (
                                  <> <span className="font-semibold text-[#0B172B]">{l.bagsUsed} bags</span> ({l.weightUsed.toFixed(1)}kg)</>
                                )}
                              </div>
                            ))}
                          </div>
                          {details.totalQuantity !== undefined && (
                            <div className="text-xs font-bold text-[#0B172B] mt-2 pt-1 border-t border-[#0B172B]/8 font-mono">
                              Total Input: {details.totalQuantity.toFixed(1)} kg
                            </div>
                          )}
                        </>
                      )}
                    </td>

                    <td className="p-4 align-top bg-[#FFFEE2]/20 border-l border-[#0B172B]/8">
                      {details.producedItems && details.producedItems.length > 0 ? (
                        <div className="space-y-1">
                          {details.producedItems.map((p: any, idx: number) => (
                            <div key={idx} className="text-xs text-[#004825] font-semibold">
                              ✓ {p.productName}: <span className="font-mono text-[#0B172B]">{Number.isInteger(p.quantity) ? p.quantity : parseFloat(p.quantity.toString()).toFixed(3)} {p.unit}(s)</span> ({p.totalWeight.toFixed(1)}kg)
                            </div>
                          ))}
                          
                          {(details.returnedLooseWeight || 0) > 0 && (
                            <div className="text-xs text-[#0B172B]/70 font-semibold mt-1">
                              ⟲ Returned to Loose Ledger: <span className="font-mono text-[#0B172B]">{(details.returnedLooseWeight || 0).toFixed(2)} kg</span>
                            </div>
                          )}

                          <div className="text-xs font-bold text-[#0B172B] mt-2 pt-1 border-t border-[#0B172B]/10 flex flex-col gap-0.5 font-sans">
                            <span className="text-[#009965] font-mono">Total Yield: {(details.totalOutputQuantity || 0).toFixed(1)} kg</span>
                            <span className="text-[10px] text-[#0B172B]/40 font-normal font-mono">
                              Variance Loss: {processVariance.toFixed(1)} kg
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-[#0B172B]/30">N/A</span>
                      )}
                    </td>

                    <td className="p-4 align-top text-center border-l border-[#0B172B]/8">
                      {record.type !== 'LEDGER_ADJUSTMENT' ? (
                        <button 
                          onClick={() => setTraceModalData(record)}
                          className="p-2 bg-white hover:bg-[#F0F5F9] text-[#0B172B]/60 rounded-xl transition-colors inline-flex flex-col items-center gap-1 border border-[#0B172B]/10 shadow-sm"
                          title="View Material Traceability Tree"
                        >
                          <Network size={16} />
                          <span className="text-[9px] font-bold uppercase">Trace</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-[#0B172B]/30 font-bold uppercase mt-2 block">No Trace</span>
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
  );
}
