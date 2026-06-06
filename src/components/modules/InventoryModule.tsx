import React, { useState, useMemo } from 'react';
import { Warehouse, Plus, Trash2, Edit2, Search, Filter, Shield, Lock, Unlock, Eye, EyeOff, Check, Download, PackagePlus, Clock, X, Boxes, FileText, File } from 'lucide-react';
import { LooseLot, CatalogProduct } from '@/types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface InventoryModuleProps {
  looseInventory: LooseLot[];
  setLooseInventory: (val: LooseLot[] | ((prev: LooseLot[]) => LooseLot[])) => void;
  packetCatalog: CatalogProduct[];
  setPacketCatalog: (val: CatalogProduct[] | ((prev: CatalogProduct[]) => CatalogProduct[])) => void;
  onDeleteLoose: (id: string) => void;
  onPurgeNilLoose: () => void;
  onEditLooseItem: (id: string, data: Partial<LooseLot>) => void;
  onEditCatalogProduct: (id: string, data: Partial<CatalogProduct>) => void;
  onDeleteCatalog: (id: string) => void;
  isCatalogUnlocked: boolean;
  onUnlockRequest: () => void;
  onLockRequest: () => void;
  onAddCatalogProduct: (product: { name: string; unit: string; size: number; hsnCode?: string; gstRate?: number }) => void;
  onLedgerAdjustment?: (targetId: string, amount: number, reason: string) => void;
  triggerToast: (msg: string, type?: 'success' | 'error') => void;
  systemUser: any;
}

export default function InventoryModule({ 
  looseInventory, 
  setLooseInventory,
  packetCatalog, 
  setPacketCatalog,
  onDeleteLoose, 
  onPurgeNilLoose,
  onEditLooseItem,
  onEditCatalogProduct,
  onDeleteCatalog, 
  isCatalogUnlocked,
  onUnlockRequest,
  onLockRequest,
  onAddCatalogProduct,
  onLedgerAdjustment,
  triggerToast,
  systemUser
}: InventoryModuleProps) {
  const [activeTab, setActiveTab] = useState<'loose'|'packet'>('loose');
  const [searchTerm, setSearchTerm] = useState('');
  const [looseSortBy, setLooseSortBy] = useState('default');
  
  const [showAddNewProduct, setShowAddNewProduct] = useState(false);
  const [newProductForm, setNewProductForm] = useState({
    name: '', unit: 'KG', size: '', hsnCode: '', gstRate: '5'
  });

  const [showReceiveLoose, setShowReceiveLoose] = useState(false);
  const [looseForm, setLooseForm] = useState({
    lotNumber: '', grade: '', mark: '', bags: '', weightPerBag: '', date: new Date().toISOString().split('T')[0], labels: ''
  });

  const [showReceivePacket, setShowReceivePacket] = useState(false);
  const [packetForm, setPacketForm] = useState({
    productId: '', quantity: '', date: new Date().toISOString().split('T')[0]
  });

  const [showLedgerAdjustment, setShowLedgerAdjustment] = useState(false);
  const [ledgerAdjustmentForm, setLedgerAdjustmentForm] = useState({
    targetId: 'l-balance', amount: '', reason: ''
  });

  const calculatedLooseTotalWeight = useMemo(() => {
    const bags = parseInt(looseForm.bags) || 0;
    const perBag = parseFloat(looseForm.weightPerBag) || 0;
    return bags * perBag;
  }, [looseForm.bags, looseForm.weightPerBag]);

  const selectedProductDetail = useMemo(() => {
    return packetCatalog.find(p => p.id === packetForm.productId);
  }, [packetForm.productId, packetCatalog]);

  const calculatedPacketTotalWeight = useMemo(() => {
    if (!selectedProductDetail) return 0;
    const qty = parseFloat(packetForm.quantity) || 0;
    return qty * selectedProductDetail.size;
  }, [packetForm.quantity, selectedProductDetail]);

  const handleLooseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const bags = parseInt(looseForm.bags);
    const perBag = parseFloat(looseForm.weightPerBag);
    const labelsList = looseForm.labels.split(',').map(l => l.trim()).filter(l => l);

    const newLot: LooseLot = {
      id: Date.now().toString(),
      lotNumber: looseForm.lotNumber,
      grade: looseForm.grade,
      mark: looseForm.mark,
      bags,
      weightPerBag: perBag,
      weight: calculatedLooseTotalWeight,
      date: looseForm.date,
      labels: labelsList
    };

    setLooseInventory(prev => [...prev, newLot]);
    triggerToast('Raw loose tea lot received and entered in stock ledger!');
    setLooseForm({ lotNumber: '', grade: '', mark: '', bags: '', weightPerBag: '', date: new Date().toISOString().split('T')[0], labels: '' });
    setShowReceiveLoose(false);
  };

  const handlePacketSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!packetForm.productId) return triggerToast("Please select a packet product master item", "error");
    const qtyToAdd = parseFloat(packetForm.quantity);

    setPacketCatalog(prev => prev.map(p => {
      if (p.id === packetForm.productId) {
        return { ...p, stock: p.stock + qtyToAdd };
      }
      return p;
    }));

    if (selectedProductDetail) {
      triggerToast(`Received ${qtyToAdd} ${selectedProductDetail.unit}(s) of "${selectedProductDetail.name}" successfully!`);
    }
    setPacketForm({ productId: '', quantity: '', date: new Date().toISOString().split('T')[0] });
    setShowReceivePacket(false);
  };

  const handleLedgerAdjustmentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onLedgerAdjustment) return;
    const amount = parseFloat(ledgerAdjustmentForm.amount);
    if (!amount) return triggerToast('Please enter a valid amount', 'error');
    if (!ledgerAdjustmentForm.reason.trim()) return triggerToast('Please provide a reason for this adjustment', 'error');
    if (!ledgerAdjustmentForm.targetId) return triggerToast('Please select a target ledger/lot', 'error');
    
    onLedgerAdjustment(ledgerAdjustmentForm.targetId, amount, ledgerAdjustmentForm.reason);
    setLedgerAdjustmentForm({ targetId: 'l-balance', amount: '', reason: '' });
    setShowLedgerAdjustment(false);
  };

  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [editLotData, setEditLotData] = useState<Partial<LooseLot>>({});

  const startEditing = (item: LooseLot) => {
    if (!isCatalogUnlocked) {
      triggerToast("Authentication required! Please unlock catalog/inventory first to edit records.", "error");
      return;
    }
    setEditingLotId(item.id);
    setEditLotData({
      lotNumber: item.lotNumber,
      mark: item.mark,
      grade: item.grade,
      bags: item.bags,
      weightPerBag: item.weightPerBag,
      labels: item.labels ? [...item.labels] : []
    });
  };

  const cancelEditing = () => {
    setEditingLotId(null);
    setEditLotData({});
  };

  const saveEditing = () => {
    if (!editLotData.lotNumber || !editLotData.mark || !editLotData.grade) {
      triggerToast("Lot Number, Mark, and Grade cannot be empty.", "error");
      return;
    }
    if (editingLotId) {
      onEditLooseItem(editingLotId, editLotData);
    }
    setEditingLotId(null);
    setEditLotData({});
  };

  const [editingPacketId, setEditingPacketId] = useState<string | null>(null);
  const [editPacketData, setEditPacketData] = useState<Partial<CatalogProduct>>({});

  const startEditingPacket = (item: CatalogProduct) => {
    if (!isCatalogUnlocked) {
      triggerToast("Authentication required! Please unlock catalog/inventory first to edit records.", "error");
      return;
    }
    if (item.id === 'p-variance') {
      triggerToast("Cannot edit the system variance tracking ledger.", "error");
      return;
    }
    setEditingPacketId(item.id);
    setEditPacketData({
      name: item.name,
      unit: item.unit,
      size: item.size,
      stock: item.stock,
      hsnCode: item.hsnCode || '',
      gstRate: item.gstRate !== undefined ? item.gstRate : 5
    });
  };

  const cancelEditingPacket = () => {
    setEditingPacketId(null);
    setEditPacketData({});
  };

  const saveEditingPacket = () => {
    if (!editPacketData.name || !editPacketData.unit || editPacketData.size === undefined) {
      triggerToast("Name, Unit, and Multiplier cannot be empty.", "error");
      return;
    }
    if (editingPacketId) {
      onEditCatalogProduct(editingPacketId, editPacketData);
    }
    setEditingPacketId(null);
    setEditPacketData({});
  };

  const handleCreateNewProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCatalogUnlocked) {
      triggerToast("Access Denied! Enter Admin PIN to unlock management.", "error");
      return;
    }
    if (!newProductForm.name || !newProductForm.size) return triggerToast("All fields are required", "error");
    
    onAddCatalogProduct({
      name: newProductForm.name,
      unit: newProductForm.unit,
      size: parseFloat(newProductForm.size),
      hsnCode: newProductForm.hsnCode,
      gstRate: parseFloat(newProductForm.gstRate) || 5
    });

    setNewProductForm({ name: '', unit: 'KG', size: '', hsnCode: '', gstRate: '5' });
    setShowAddNewProduct(false);
  };

  const filteredLoose = useMemo(() => {
    let result = looseInventory.filter(item => {
      if (!searchTerm) return true;
      const searchLower = searchTerm.toLowerCase();
      return (
        item.lotNumber.toLowerCase().includes(searchLower) ||
        item.grade.toLowerCase().includes(searchLower) ||
        item.mark.toLowerCase().includes(searchLower) ||
        (item.labels && item.labels.some(l => l.toLowerCase().includes(searchLower)))
      );
    });

    if (looseSortBy === 'stock_asc') {
      result.sort((a, b) => a.weight - b.weight);
    } else if (looseSortBy === 'stock_desc') {
      result.sort((a, b) => b.weight - a.weight);
    } else if (looseSortBy === 'date') {
      result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } else if (looseSortBy === 'date_oldest') {
      result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    return result;
  }, [looseInventory, searchTerm, looseSortBy]);

  const filteredPackets = useMemo(() => {
    return packetCatalog.filter(item => {
      if (!searchTerm) return true;
      const searchLower = searchTerm.toLowerCase();
      return item.name.toLowerCase().includes(searchLower) || item.unit.toLowerCase().includes(searchLower);
    });
  }, [packetCatalog, searchTerm]);

  const aggregateLooseWeight = filteredLoose.reduce((sum, item) => sum + item.weight, 0);
  const aggregateLooseBags = filteredLoose.reduce((sum, item) => sum + (item.bags || 0), 0);

  const aggregatePacketUnits = filteredPackets.reduce((sum, item) => sum + item.stock, 0);
  const aggregatePacketWeight = filteredPackets.reduce((sum, item) => sum + (item.stock * item.size), 0);

  const exportLooseCSV = () => {
    let csv = "Lot Number,Mark,Grade,Bags,Weight Per Bag (kg),Total Weight (kg),Date Received,Labels\n";
    filteredLoose.forEach(l => {
      const isSystem = l.id.startsWith('l-');
      csv += `"${l.lotNumber}","${l.mark}","${l.grade}","${isSystem ? '-' : l.bags}","${isSystem ? '-' : l.weightPerBag}","${l.weight.toFixed(2)}","${l.date}","${(l.labels || []).join(', ')}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `loose_inventory_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    triggerToast("Loose Inventory CSV exported.");
  };

  const exportPacketCSV = () => {
    let csv = "Product Name,Unit Tracking,Multiplier (kg/unit),Stock Units,Total Weight (kg)\n";
    filteredPackets.forEach(p => {
      csv += `"${p.name}","${p.unit}","${p.size}","${p.stock}","${(p.stock * p.size).toFixed(2)}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `packet_inventory_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    triggerToast("Packet Inventory CSV exported.");
  };

  const exportLoosePDF = () => {
    const doc = new jsPDF('landscape');
    doc.setFontSize(16);
    doc.setTextColor(11, 23, 43);
    doc.text('Ledo Valley ERP - Raw Loose Tea Inventory', 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Exported on: ${new Date().toLocaleDateString()}`, 14, 28);

    const tableData = filteredLoose.map(l => {
      const isSystem = l.id.startsWith('l-');
      return [
        l.lotNumber,
        l.mark,
        l.grade,
        isSystem ? '-' : l.bags,
        isSystem ? '-' : l.weightPerBag,
        l.weight.toFixed(2),
        l.date,
        (l.labels || []).join(', ')
      ];
    });

    autoTable(doc, {
      startY: 35,
      head: [['Lot Number', 'Mark', 'Grade', 'Bags', 'Wt/Bag (kg)', 'Total Wt (kg)', 'Date Received', 'Labels']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [0, 153, 101], textColor: [255, 255, 255] }
    });

    doc.save(`loose_inventory_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportPacketPDF = () => {
    const doc = new jsPDF('landscape');
    doc.setFontSize(16);
    doc.setTextColor(11, 23, 43);
    doc.text('Ledo Valley ERP - Product Catalog', 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Exported on: ${new Date().toLocaleDateString()}`, 14, 28);

    const tableData = filteredPackets.map(p => [
      p.name,
      p.hsnCode || '-',
      p.gstRate !== undefined ? `${p.gstRate}%` : '5%',
      p.unit,
      p.size,
      p.stock,
      (p.stock * p.size).toFixed(2)
    ]);

    autoTable(doc, {
      startY: 35,
      head: [['Product Name', 'HSN Code', 'GST %', 'Tracking Unit', 'Multiplier (kg/unit)', 'Stock Units', 'Total Weight (kg)']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [0, 153, 101], textColor: [255, 255, 255] }
    });

    doc.save(`packet_inventory_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="bg-white rounded-2xl shadow-[0_10px_30px_rgba(11,23,43,0.04)] border border-[#0B172B]/8 h-full flex flex-col overflow-hidden">
      <div className="p-6 border-b border-[#0B172B]/8 bg-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-bold text-[#0B172B] font-sans">Warehouse Stockroom</h2>
            <p className="text-xs text-[#0B172B]/55">View real-time inventories of raw loose teas and consolidated packaging types.</p>
          </div>

          <div className="bg-[#F0F5F9]/50 px-4 py-3 rounded-2xl border border-[#0B172B]/8 flex items-center gap-3">
            {isCatalogUnlocked ? (
              <div className="flex items-center gap-2">
                <span className="p-1 bg-emerald-100 rounded text-emerald-700">
                  <Unlock size={16} />
                </span>
                <div className="text-left">
                  <span className="text-[10px] uppercase font-bold text-emerald-800 block leading-tight">Elevated Access</span>
                  <span className="text-xs text-[#0B172B]/55 leading-none">Settings editable</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-slate-200 rounded text-slate-500" title="Locked Configuration">
                  <Lock size={16} />
                </span>
                <div className="text-left">
                  <span className="text-[10px] uppercase font-bold text-[#0B172B]/70 block leading-tight">View Only</span>
                  <span className="text-xs text-[#0B172B]/55 leading-none">Catalog Locked</span>
                </div>
              </div>
            )}
          </div>
        </div>
        
        <div className="flex border-b border-[#0B172B]/8 mb-4">
          <button 
            onClick={() => setActiveTab('loose')} 
            className={`py-3 px-6 border-b-2 font-semibold text-sm transition-all flex items-center gap-2 ${activeTab === 'loose' ? 'border-[#009965] text-[#009965]' : 'border-transparent text-[#0B172B]/55 hover:text-[#0B172B]'}`}
          >
            <Boxes size={18} />
            Raw Loose Tea Stock
          </button>
          <button 
            onClick={() => setActiveTab('packet')} 
            className={`py-3 px-6 border-b-2 font-semibold text-sm transition-all flex items-center gap-2 ${activeTab === 'packet' ? 'border-[#009965] text-[#009965]' : 'border-transparent text-[#0B172B]/55 hover:text-[#0B172B]'}`}
          >
            <PackagePlus size={18} />
            Packet Stock Catalog
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
          <div className="flex-[2] flex items-center gap-2 bg-[#F0F5F9]/50 p-3 rounded-xl border border-[#0B172B]/8">
            <Filter size={18} className="text-[#0B172B]/40" />
            <input 
              type="text" 
              placeholder={activeTab === 'loose' ? "Search lot, grade, mark or labels..." : "Search product templates..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent border-none focus:ring-0 w-full text-sm outline-none font-sans font-medium text-[#0B172B] placeholder-[#0B172B]/40"
            />
          </div>

          <div className="flex border border-[#0B172B]/10 rounded-xl overflow-hidden shadow-sm shrink-0 h-10">
            <button 
              onClick={activeTab === 'loose' ? exportLooseCSV : exportPacketCSV}
              className="px-4 bg-white hover:bg-[#F0F5F9] text-[#0B172B]/80 text-xs font-bold transition-all flex items-center justify-center gap-2 border-r border-[#0B172B]/10"
              title={`Export ${activeTab === 'loose' ? 'Loose Tea' : 'Packet'} CSV`}
            >
              <FileText size={16} className="text-blue-600" /> CSV
            </button>
            <button 
              onClick={activeTab === 'loose' ? exportLoosePDF : exportPacketPDF}
              className="px-4 bg-white hover:bg-[#F0F5F9] text-[#0B172B]/80 text-xs font-bold transition-all flex items-center justify-center gap-2"
              title={`Export ${activeTab === 'loose' ? 'Loose Tea' : 'Packet'} PDF`}
            >
              <File size={16} className="text-red-500" /> PDF
            </button>
          </div>

          {activeTab === 'loose' && (
            <>
              <button 
                onClick={() => {
                  if (!isCatalogUnlocked) {
                    triggerToast("Authentication required! Please unlock catalog first.", "error");
                  } else {
                    setShowLedgerAdjustment(true);
                  }
                }}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${
                  isCatalogUnlocked 
                    ? 'bg-amber-50 hover:bg-amber-100 text-amber-600 border border-amber-200' 
                    : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                }`}
              >
                <Edit2 size={16} /> Adjust Ledger
              </button>

              <select 
                value={looseSortBy} 
                onChange={e => setLooseSortBy(e.target.value)}
                className="px-3 py-2 border border-[#0B172B]/8 rounded-xl text-xs font-bold text-[#0B172B]/70 bg-white outline-none focus:ring-1 focus:ring-[#009965] shrink-0"
              >
                <option value="default">Default Sort</option>
                <option value="stock_asc">Stock (Low to High)</option>
                <option value="stock_desc">Stock (High to Low)</option>
                <option value="date">Age (Newest First)</option>
                <option value="date_oldest">Age (Oldest First)</option>
              </select>

              <button 
                onClick={() => {
                  if (!isCatalogUnlocked) {
                    triggerToast("Authentication required! Please unlock catalog first.", "error");
                  } else {
                    onPurgeNilLoose();
                  }
                }}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${
                  isCatalogUnlocked 
                    ? 'bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200' 
                    : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                }`}
                title={!isCatalogUnlocked ? "Unlock Catalog to Purge NIL Stock" : "Delete all empty loose lots in one click"}
              >
                <Trash2 size={16} /> Purge NIL Stock
              </button>
              {systemUser.role !== 'user' && (
                <button 
                  onClick={() => setShowReceiveLoose(true)}
                  className="px-5 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all bg-[#0B172B] text-white hover:bg-[#009965] shadow-[0_10px_20px_rgba(11,23,43,0.15)] shrink-0"
                >
                  <Plus size={16} /> Receive Raw Loose Tea
                </button>
              )}
            </>
          )}



          {activeTab === 'packet' && (
            <>
              <button 
                onClick={() => {
                  if (!isCatalogUnlocked) {
                    triggerToast("Authentication required! Please unlock catalog first.", "error");
                  } else {
                    setShowAddNewProduct(true);
                  }
                }}
                className={`px-5 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                  isCatalogUnlocked 
                    ? 'bg-[#F0F5F9]/50 text-[#0B172B] hover:bg-[#0B172B] hover:text-white border border-[#0B172B]/10 shadow-[0_5px_15px_rgba(11,23,43,0.05)]' 
                    : 'bg-[#F0F5F9]/50 text-[#0B172B]/30 border border-[#0B172B]/10 cursor-not-allowed'
                }`}
                title={!isCatalogUnlocked ? "Unlock Catalog to Add Products" : "Register New Product Template"}
              >
                <Plus size={16} /> New Product Template
              </button>

              {systemUser.role !== 'user' && (
                <button 
                  onClick={() => setShowReceivePacket(true)}
                  className="px-5 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all bg-[#0B172B] text-white hover:bg-[#009965] shadow-[0_10px_20px_rgba(11,23,43,0.15)] shrink-0"
                >
                  <PackagePlus size={16} /> Receive Packaged Stock
                </button>
              )}
            </>
          )}
        </div>
        
        {showAddNewProduct && isCatalogUnlocked && activeTab === 'packet' && (
          <div className="fixed inset-0 bg-[#0B172B]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-[0_24px_80px_rgba(11,23,43,0.2)]">
              <div className="p-6 border-b border-[#0B172B]/8 flex justify-between items-center bg-[#F0F5F9]/50">
                <h3 className="font-bold text-[#0B172B] text-lg">Add New Fixed Product Template</h3>
                <button onClick={() => setShowAddNewProduct(false)} className="text-[#0B172B]/40 hover:text-[#0B172B]"><X size={20} /></button>
              </div>

              <form onSubmit={handleCreateNewProduct} className="p-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-[#0B172B]/70 uppercase mb-1">Product Brand/Name *</label>
                    <input required type="text" placeholder="e.g. Ledo Premium 250g Pouch" value={newProductForm.name} onChange={(e) => setNewProductForm({...newProductForm, name: e.target.value})} className="w-full px-4 py-3 border border-[#0B172B]/10 rounded-xl bg-[#F0F5F9]/50 focus:bg-white focus:ring-2 focus:ring-[#009965]/20 focus:border-[#009965] outline-none transition-all duration-200 text-sm font-medium text-[#0B172B] placeholder-[#0B172B]/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#0B172B]/70 uppercase mb-1">HSN Code (Optional)</label>
                    <input type="text" placeholder="e.g. 0902" value={newProductForm.hsnCode} onChange={(e) => setNewProductForm({...newProductForm, hsnCode: e.target.value})} className="w-full px-4 py-3 border border-[#0B172B]/10 rounded-xl bg-[#F0F5F9]/50 focus:bg-white focus:ring-2 focus:ring-[#009965]/20 focus:border-[#009965] outline-none transition-all duration-200 text-sm font-medium text-[#0B172B] placeholder-[#0B172B]/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#0B172B]/70 uppercase mb-1">GST Percentage *</label>
                    <select value={newProductForm.gstRate} onChange={(e) => setNewProductForm({...newProductForm, gstRate: e.target.value})} className="w-full px-4 py-3 border border-[#0B172B]/10 rounded-xl bg-[#F0F5F9]/50 focus:bg-white focus:ring-2 focus:ring-[#009965]/20 focus:border-[#009965] outline-none transition-all duration-200 text-sm font-medium text-[#0B172B]">
                      {[0, 5, 8, 9, 10, 12, 15, 18].map(rate => (
                        <option key={rate} value={rate}>{rate}%</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#0B172B]/70 uppercase mb-1">Tracking Stock Unit *</label>
                    <select value={newProductForm.unit} onChange={(e) => setNewProductForm({...newProductForm, unit: e.target.value})} className="w-full px-4 py-3 border border-[#0B172B]/10 rounded-xl bg-[#F0F5F9]/50 focus:bg-white focus:ring-2 focus:ring-[#009965]/20 focus:border-[#009965] outline-none transition-all duration-200 text-sm font-medium text-[#0B172B]">
                      <option value="KG">KG (Standard kilogram pouch/packs)</option>
                      <option value="Bundle">Bundle (Carton/Box/Pack Bundle)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#0B172B]/70 uppercase mb-1">Weight Sizing Factor (kg/unit) *</label>
                    <input required type="number" step="0.001" placeholder="e.g. 10.0 for 10kg bundle" value={newProductForm.size} onChange={(e) => setNewProductForm({...newProductForm, size: e.target.value})} className="w-full px-4 py-3 border border-[#0B172B]/10 rounded-xl bg-[#F0F5F9]/50 focus:bg-white focus:ring-2 focus:ring-[#009965]/20 focus:border-[#009965] outline-none transition-all duration-200 text-sm font-medium text-[#0B172B] placeholder-[#0B172B]/30" />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <button type="button" onClick={() => setShowAddNewProduct(false)} className="px-5 py-3 border border-[#0B172B]/10 rounded-xl text-sm font-bold text-[#0B172B]/60 hover:bg-[#F0F5F9] hover:text-[#0B172B] transition-colors">Cancel</button>
                  <button type="submit" className="px-5 py-3 bg-[#0B172B] hover:bg-[#009965] text-white rounded-xl text-sm font-bold transition-colors shadow-[0_5px_15px_rgba(11,23,43,0.1)] flex items-center gap-2"><Check size={16}/> Register Template</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showReceiveLoose && (
          <div className="fixed inset-0 bg-[#0B172B]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-4xl overflow-hidden shadow-[0_24px_80px_rgba(11,23,43,0.2)] flex flex-col max-h-[90vh]">
              <div className="p-6 border-b border-[#0B172B]/8 flex justify-between items-center bg-[#F0F5F9]/50 shrink-0">
                <div>
                  <h3 className="font-bold text-[#0B172B] text-xl">Receive Raw Loose Tea</h3>
                  <p className="text-xs text-[#0B172B]/55 mt-1">Record arrivals of bulk raw materials into the warehouse.</p>
                </div>
                <button onClick={() => setShowReceiveLoose(false)} className="text-[#0B172B]/40 hover:text-[#0B172B] bg-white p-2 rounded-xl shadow-sm"><X size={20} /></button>
              </div>

              <div className="overflow-y-auto p-6">
                <form id="receiveLooseForm" onSubmit={handleLooseSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-[#0B172B]/70 uppercase tracking-wider mb-1">Lot Number *</label>
                    <input required type="text" value={looseForm.lotNumber} onChange={(e) => setLooseForm({...looseForm, lotNumber: e.target.value})} className="w-full px-4 py-3 border border-[#0B172B]/10 rounded-xl bg-[#F0F5F9]/50 focus:bg-white focus:ring-2 focus:ring-[#009965]/20 focus:border-[#009965] outline-none transition-all duration-200 text-sm font-medium text-[#0B172B] placeholder-[#0B172B]/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#0B172B]/70 uppercase tracking-wider mb-1">Mark Name *</label>
                    <input required type="text" placeholder="e.g. Assam Gold" value={looseForm.mark} onChange={(e) => setLooseForm({...looseForm, mark: e.target.value})} className="w-full px-4 py-3 border border-[#0B172B]/10 rounded-xl bg-[#F0F5F9]/50 focus:bg-white focus:ring-2 focus:ring-[#009965]/20 focus:border-[#009965] outline-none transition-all duration-200 text-sm font-medium text-[#0B172B] placeholder-[#0B172B]/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#0B172B]/70 uppercase tracking-wider mb-1">Grade *</label>
                    <input required type="text" placeholder="e.g. BP or BOP" value={looseForm.grade} onChange={(e) => setLooseForm({...looseForm, grade: e.target.value})} className="w-full px-4 py-3 border border-[#0B172B]/10 rounded-xl bg-[#F0F5F9]/50 focus:bg-white focus:ring-2 focus:ring-[#009965]/20 focus:border-[#009965] outline-none transition-all duration-200 text-sm font-medium text-[#0B172B] placeholder-[#0B172B]/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#0B172B]/70 uppercase tracking-wider mb-1">Number of Bags *</label>
                    <input required type="number" min="1" value={looseForm.bags} onChange={(e) => setLooseForm({...looseForm, bags: e.target.value})} className="w-full px-4 py-3 border border-[#0B172B]/10 rounded-xl bg-[#F0F5F9]/50 focus:bg-white focus:ring-2 focus:ring-[#009965]/20 focus:border-[#009965] outline-none transition-all duration-200 text-sm font-medium text-[#0B172B] placeholder-[#0B172B]/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#0B172B]/70 uppercase tracking-wider mb-1">Weight per Bag (kg) *</label>
                    <input required type="number" step="0.01" min="0.01" value={looseForm.weightPerBag} onChange={(e) => setLooseForm({...looseForm, weightPerBag: e.target.value})} className="w-full px-4 py-3 border border-[#0B172B]/10 rounded-xl bg-[#F0F5F9]/50 focus:bg-white focus:ring-2 focus:ring-[#009965]/20 focus:border-[#009965] outline-none transition-all duration-200 text-sm font-medium text-[#0B172B] placeholder-[#0B172B]/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#0B172B]/70 uppercase tracking-wider mb-1">Calculated Combined Net Qty (kg)</label>
                    <div className="w-full p-3 border border-[#0B172B]/10 bg-[#FFFEE2]/50 text-[#004825] rounded-xl font-bold cursor-not-allowed">
                      {calculatedLooseTotalWeight > 0 ? `${calculatedLooseTotalWeight.toFixed(2)} kg` : '0.00 kg'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#0B172B]/70 uppercase tracking-wider mb-1">Date of Entry *</label>
                    <input required type="date" value={looseForm.date} onChange={(e) => setLooseForm({...looseForm, date: e.target.value})} className="w-full px-4 py-3 border border-[#0B172B]/10 rounded-xl bg-[#F0F5F9]/50 focus:bg-white focus:ring-2 focus:ring-[#009965]/20 focus:border-[#009965] outline-none transition-all duration-200 text-sm font-medium text-[#0B172B]" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#0B172B]/70 uppercase tracking-wider mb-1">Labels (Comma separated values)</label>
                    <input type="text" placeholder="e.g. A, Premium Quality, LV" value={looseForm.labels} onChange={(e) => setLooseForm({...looseForm, labels: e.target.value})} className="w-full px-4 py-3 border border-[#0B172B]/10 rounded-xl bg-[#F0F5F9]/50 focus:bg-white focus:ring-2 focus:ring-[#009965]/20 focus:border-[#009965] outline-none transition-all duration-200 text-sm font-medium text-[#0B172B] placeholder-[#0B172B]/30" />
                  </div>
                </form>
              </div>
              
              <div className="p-6 border-t border-[#0B172B]/8 bg-[#F0F5F9]/30 shrink-0 flex justify-end gap-3">
                <button type="button" onClick={() => setShowReceiveLoose(false)} className="px-5 py-3 border border-[#0B172B]/10 rounded-xl text-sm font-bold text-[#0B172B]/60 hover:bg-white hover:text-[#0B172B] transition-colors">Cancel</button>
                <button 
                  type="submit" 
                  form="receiveLooseForm"
                  disabled={!looseForm.lotNumber || !looseForm.mark || !looseForm.grade || !looseForm.bags || !looseForm.weightPerBag}
                  className="px-6 py-3 bg-[#009965] hover:bg-[#004825] disabled:bg-[#0B172B]/20 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-colors shadow-[0_5px_15px_rgba(0,153,101,0.2)] flex items-center gap-2"
                >
                  <Check size={16} /> Register Incoming Loose Stock
                </button>
              </div>
            </div>
          </div>
        )}

        {showReceivePacket && (
          <div className="fixed inset-0 bg-[#0B172B]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-3xl overflow-hidden shadow-[0_24px_80px_rgba(11,23,43,0.2)] flex flex-col max-h-[90vh]">
              <div className="p-6 border-b border-[#0B172B]/8 flex justify-between items-center bg-[#F0F5F9]/50 shrink-0">
                <div>
                  <h3 className="font-bold text-[#0B172B] text-xl">Receive Packaged Stock</h3>
                  <p className="text-xs text-[#0B172B]/55 mt-1">Record arrivals of finalized packaging units directly into stock.</p>
                </div>
                <button onClick={() => setShowReceivePacket(false)} className="text-[#0B172B]/40 hover:text-[#0B172B] bg-white p-2 rounded-xl shadow-sm"><X size={20} /></button>
              </div>

              <div className="overflow-y-auto p-6">
                <form id="receivePacketForm" onSubmit={handlePacketSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <div className="flex justify-between mb-1">
                        <label className="block text-xs font-bold text-[#0B172B]/70 uppercase tracking-wider">Select Product Master *</label>
                      </div>
                      <select 
                        required 
                        value={packetForm.productId} 
                        onChange={(e) => setPacketForm({...packetForm, productId: e.target.value})} 
                        className="w-full px-4 py-3 border border-[#0B172B]/10 rounded-xl bg-[#F0F5F9]/50 focus:bg-white focus:ring-2 focus:ring-[#009965]/20 focus:border-[#009965] outline-none transition-all duration-200 text-sm font-medium text-[#0B172B]"
                      >
                        <option value="">-- Choose Product Template --</option>
                        {packetCatalog.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                        ))}
                      </select>
                    </div>

                    {selectedProductDetail ? (
                      <div>
                        <label className="block text-xs font-bold text-[#0B172B]/70 uppercase tracking-wider mb-1">
                          Received Quantity ({selectedProductDetail.unit}s) *
                        </label>
                        <input required type="number" step="0.001" placeholder={`Number of ${selectedProductDetail.unit}s`} value={packetForm.quantity} onChange={(e) => setPacketForm({...packetForm, quantity: e.target.value})} className="w-full px-4 py-3 border border-[#0B172B]/10 rounded-xl bg-[#F0F5F9]/50 focus:bg-white focus:ring-2 focus:ring-[#009965]/20 focus:border-[#009965] outline-none transition-all duration-200 text-sm font-medium text-[#0B172B] placeholder-[#0B172B]/30" />
                      </div>
                    ) : (
                      <div className="bg-[#F0F5F9]/50 border border-[#0B172B]/5 rounded-xl p-3 text-[#0B172B]/40 text-xs flex items-center justify-center font-medium">
                        Select a product to declare quantities received.
                      </div>
                    )}

                    {selectedProductDetail && (
                      <>
                        <div className="bg-[#F0F5F9]/50 border border-[#0B172B]/8 p-4 rounded-xl flex flex-col gap-1.5 text-xs">
                          <span className="text-[#0B172B]/55 uppercase font-bold tracking-wider mb-1">Product Master Data</span>
                          <span className="font-medium text-[#0B172B]">Unit Sizing Multiplier: <strong className="text-[#009965]">{selectedProductDetail.size.toFixed(3)} kg</strong> per {selectedProductDetail.unit}</span>
                          <span className="font-medium text-[#0B172B]">Stock Count Tracking Unit: <strong className="text-[#009965]">{selectedProductDetail.unit}</strong></span>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-[#0B172B]/70 uppercase tracking-wider mb-1">Equivalent Total Net Weight</label>
                          <div className="w-full p-3 border border-[#0B172B]/10 bg-[#FFFEE2]/50 text-[#004825] rounded-xl font-bold cursor-not-allowed">
                            {calculatedPacketTotalWeight.toFixed(2)} kg
                          </div>
                        </div>
                      </>
                    )}

                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-[#0B172B]/70 uppercase tracking-wider mb-1">Receipt Date *</label>
                      <input required type="date" value={packetForm.date} onChange={(e) => setPacketForm({...packetForm, date: e.target.value})} className="w-full px-4 py-3 border border-[#0B172B]/10 rounded-xl bg-[#F0F5F9]/50 focus:bg-white focus:ring-2 focus:ring-[#009965]/20 focus:border-[#009965] outline-none transition-all duration-200 text-sm font-medium text-[#0B172B]" />
                    </div>
                  </div>
                </form>
              </div>

              <div className="p-6 border-t border-[#0B172B]/8 bg-[#F0F5F9]/30 shrink-0 flex justify-end gap-3">
                <button type="button" onClick={() => setShowReceivePacket(false)} className="px-5 py-3 border border-[#0B172B]/10 rounded-xl text-sm font-bold text-[#0B172B]/60 hover:bg-white hover:text-[#0B172B] transition-colors">Cancel</button>
                <button 
                  type="submit" 
                  form="receivePacketForm"
                  disabled={!packetForm.productId || !packetForm.quantity}
                  className="px-6 py-3 bg-[#009965] hover:bg-[#004825] disabled:bg-[#0B172B]/20 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-colors shadow-[0_5px_15px_rgba(0,153,101,0.2)] flex items-center gap-2"
                >
                  <Check size={16} /> Update Inventory Ledger
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          {activeTab === 'loose' ? (
            <>
              <thead className="bg-[#F0F5F9] sticky top-0 z-10">
                <tr>
                  <th className="p-4 font-bold text-[10px] text-[#0B172B]/55 uppercase tracking-wider border-b border-[#0B172B]/8">Lot/Batch No.</th>
                  <th className="p-4 font-bold text-[10px] text-[#0B172B]/55 uppercase tracking-wider border-b border-[#0B172B]/8">Mark Name</th>
                  <th className="p-4 font-bold text-[10px] text-[#0B172B]/55 uppercase tracking-wider border-b border-[#0B172B]/8">Grade</th>
                  <th className="p-4 font-bold text-[10px] text-[#0B172B]/55 uppercase tracking-wider border-b border-[#0B172B]/8 text-right">No. of Bags</th>
                  <th className="p-4 font-bold text-[10px] text-[#0B172B]/55 uppercase tracking-wider border-b border-[#0B172B]/8 text-right">Per Bag Wt</th>
                  <th className="p-4 font-bold text-[10px] text-[#0B172B] uppercase tracking-wider border-b border-[#0B172B]/8 text-right bg-[#F0F5F9]">Total Qty (kg)</th>
                  <th className="p-4 font-bold text-[10px] text-[#0B172B]/55 uppercase tracking-wider border-b border-[#0B172B]/8">Labels</th>
                  <th className="p-4 font-bold text-[10px] text-[#0B172B]/55 uppercase tracking-wider border-b border-[#0B172B]/8 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0B172B]/5 text-sm">
                {filteredLoose.length === 0 ? (
                  <tr><td colSpan={8} className="p-12 text-center text-slate-400">No loose lots found matching filter.</td></tr>
                ) : (
                  filteredLoose.map(item => {
                    const daysOld = Math.floor((new Date().getTime() - new Date(item.date).getTime()) / (1000 * 60 * 60 * 24));
                    const isVeryOld = daysOld >= 270;
                    const isOld = daysOld >= 180 && !isVeryOld;



                    return (
                      <tr key={item.id} className={`group hover:bg-[#F0F5F9]/50 transition-all ${item.bags === 0 && item.weight <= 0 ? 'bg-[#F0F5F9]/50 text-[#0B172B]/40 opacity-60' : ''}`}>
                        <td className="p-4">
                          <div className="font-bold text-[#0B172B] group-hover:text-[#009965] transition-colors">{item.lotNumber}</div>
                          {item.id !== 'l-balance' && (
                            <div className="flex items-center gap-1.5 mt-1">
                              {isVeryOld ? (
                                <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold flex items-center gap-1 whitespace-nowrap"><Clock size={10} /> &gt; 9 Mo Old</span>
                              ) : isOld ? (
                                <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold flex items-center gap-1 whitespace-nowrap"><Clock size={10} /> 6+ Mo Old</span>
                              ) : (
                                <span className="text-[10px] text-slate-400 font-mono">{item.date}</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-4 font-medium">{item.mark}</td>
                        <td className="p-4">{item.grade}</td>
                        <td className="p-4 text-right font-medium">{item.id.startsWith('l-') ? '-' : `${item.bags} bags`}</td>
                        <td className="p-4 text-right text-[#0B172B]/55 font-mono">{item.id.startsWith('l-') ? '-' : (item.weightPerBag ? `${parseFloat(item.weightPerBag.toString()).toFixed(2)} kg` : '-')}</td>
                        <td className="p-4 text-right font-bold text-[#0B172B] bg-[#F0F5F9] font-mono">{item.weight.toFixed(2)} kg</td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-1">
                            {(item.labels || []).map((lbl, idx) => (
                              <span key={idx} className="bg-slate-100 text-slate-700 border border-slate-200 text-[10px] px-2 py-0.5 rounded font-medium">{lbl}</span>
                            ))}
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {item.id.startsWith('l-') ? (
                              <div className="flex flex-col gap-1 items-center">
                                <div className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-1 rounded tracking-wide uppercase">
                                  <Shield size={12} className="text-emerald-500" /> {item.mark}
                                </div>
                              </div>
                            ) : systemUser.role !== 'user' ? (
                              <>
                                <button 
                                  onClick={() => startEditing(item)}
                                  className={`p-1.5 rounded-lg transition-all duration-200 ${isCatalogUnlocked ? 'bg-white text-[#0B172B]/70 border border-[#0B172B]/10 hover:bg-[#F0F5F9] hover:text-[#009965]' : 'bg-[#F0F5F9]/50 text-[#0B172B]/40 border border-[#0B172B]/10 cursor-not-allowed'}`}
                                  title={isCatalogUnlocked ? "Edit Lot Details" : "Elevated access required"}
                                >
                                  <Edit2 size={14} />
                                </button>
                                {item.bags === 0 || item.weight <= 0 ? (
                                  <button 
                                    onClick={() => onDeleteLoose(item.id)}
                                    className="bg-white text-rose-500 border border-slate-200 hover:bg-rose-50 p-1.5 rounded transition-all duration-200"
                                    title="Purge lot with zero stock"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                ) : (
                                  <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1.5 rounded">Active</span>
                                )}
                              </>
                            ) : (
                              <span className="text-[10px] font-semibold text-[#0B172B]/50 bg-[#F0F5F9] border border-[#0B172B]/10 px-2.5 py-1.5 rounded">View Only</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </>
          ) : (
            <>
              <thead className="bg-[#F0F5F9] sticky top-0 z-10">
                <tr>
                  <th className="p-4 font-bold text-[10px] text-[#0B172B]/55 uppercase tracking-wider border-b border-[#0B172B]/8">Product Name</th>
                  <th className="p-4 font-bold text-[10px] text-[#0B172B]/55 uppercase tracking-wider border-b border-[#0B172B]/8 text-center">HSN Code</th>
                  <th className="p-4 font-bold text-[10px] text-[#0B172B]/55 uppercase tracking-wider border-b border-[#0B172B]/8 text-center">GST %</th>
                  <th className="p-4 font-bold text-[10px] text-[#0B172B]/55 uppercase tracking-wider border-b border-[#0B172B]/8">Tracking Stock Unit</th>
                  <th className="p-4 font-bold text-[10px] text-[#0B172B]/55 uppercase tracking-wider border-b border-[#0B172B]/8 text-right">Unit Multiplier (kg/unit)</th>
                  <th className="p-4 font-bold text-[10px] text-[#0B172B]/55 uppercase tracking-wider border-b border-[#0B172B]/8 text-right">Units In Stock</th>
                  <th className="p-4 font-bold text-[10px] text-[#0B172B] uppercase tracking-wider border-b border-[#0B172B]/8 text-right bg-[#F0F5F9]">Combined Net Weight (kg)</th>
                  <th className="p-4 font-bold text-[10px] text-[#0B172B]/55 uppercase tracking-wider border-b border-[#0B172B]/8 text-center">Catalog Security Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0B172B]/5 text-sm">
                {filteredPackets.length === 0 ? (
                  <tr><td colSpan={8} className="p-12 text-center text-slate-400">No packaged templates stored in catalog yet.</td></tr>
                ) : (
                  filteredPackets.map(item => {


                    return (
                      <tr key={item.id} className={`group hover:bg-slate-50 transition-all ${item.stock === 0 ? 'bg-slate-50/50 text-slate-400 opacity-60' : ''}`}>
                        <td className="p-4 font-bold text-slate-800 group-hover:text-emerald-700 transition-colors">{item.name}</td>
                        <td className="p-4 text-center text-slate-500 font-mono text-xs">{item.hsnCode || '-'}</td>
                        <td className="p-4 text-center text-slate-500 font-mono text-xs">{item.gstRate !== undefined ? `${item.gstRate}%` : '5%'}</td>
                        <td className="p-4 font-medium">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${item.unit === 'Bundle' ? 'bg-amber-50 text-amber-700 border border-amber-200/50' : 'bg-blue-50 text-blue-700 border border-blue-200/50'}`}>
                            {item.unit}
                          </span>
                        </td>
                        <td className="p-4 text-right text-slate-600 font-mono">{parseFloat(item.size.toString()).toFixed(3)} kg</td>
                        <td className="p-4 text-right font-bold text-slate-700 font-mono">
                          {Number.isInteger(item.stock) ? item.stock : parseFloat(item.stock.toString()).toFixed(3)} {item.unit}(s)
                        </td>
                        <td className="p-4 text-right font-black text-slate-950 bg-slate-100 font-mono">
                          {(item.stock * item.size).toFixed(2)} kg
                        </td>
                        <td className="p-4 text-center">
                          {item.id === 'p-variance' ? (
                            <div className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-1 rounded tracking-wide">
                              <Shield size={12} className="text-emerald-500" /> SYSTEM LEDGER
                            </div>
                          ) : isCatalogUnlocked ? (
                            <div className="flex items-center justify-center gap-2">
                              <button 
                                onClick={() => startEditingPacket(item)}
                                className="p-1.5 rounded transition-all duration-200 bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                                title="Edit Product Details"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button 
                                onClick={() => onDeleteCatalog(item.id)}
                                className="bg-white text-rose-500 border border-slate-200 hover:bg-rose-50 p-1.5 rounded transition-all inline-flex items-center gap-1 text-xs font-bold"
                                title="Remove product template from inventory master completely"
                              >
                                <Trash2 size={13} /> Delete
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold bg-slate-100 border px-2 py-1 rounded">
                              <Lock size={11} className="text-slate-400" />
                              Password Locked
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </>
          )}
        </table>
      </div>

      <div className="p-4 bg-white border-t border-[#0B172B]/8 text-[#0B172B] flex flex-col sm:flex-row justify-between items-center gap-3 font-sans">
        <span className="font-medium text-xs text-[#0B172B]/55">Filtered View Totals:</span>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-[#0B172B]/40 block tracking-wider">{activeTab === 'loose' ? 'Total Loose Bags' : 'Total Units'}</span>
            <span className="text-sm font-bold text-[#0B172B]">
              {activeTab === 'loose' ? `${aggregateLooseBags} Bags` : `${aggregatePacketUnits} Unit Packets`}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-[#0B172B]/40 block tracking-wider">Total Combined Weight</span>
            <span className="text-sm font-bold text-[#009965] font-mono">
              {activeTab === 'loose' ? `${aggregateLooseWeight.toFixed(2)} kg` : `${aggregatePacketWeight.toFixed(2)} kg`}
            </span>
          </div>
        </div>
      </div>

      {editingLotId && (
        <div className="fixed inset-0 bg-[#0B172B]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-[0_24px_80px_rgba(11,23,43,0.2)]">
            <div className="p-6 border-b border-[#0B172B]/8 bg-[#F0F5F9]/50 flex justify-between items-center">
              <h3 className="font-bold text-[#0B172B] flex items-center gap-2"><Edit2 size={18} className="text-[#009965]" /> Edit Loose Lot Details</h3>
              <button onClick={cancelEditing} className="text-[#0B172B]/40 hover:text-[#0B172B] bg-white p-1 rounded shadow-sm">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-[#0B172B]/70 uppercase">Lot Number</label>
                  <input type="text" className="w-full mt-1 px-4 py-3 border border-[#0B172B]/10 rounded-xl focus:ring-2 focus:ring-[#009965]/30 outline-none text-sm bg-[#F0F5F9]/50" value={editLotData.lotNumber || ''} onChange={e => setEditLotData({...editLotData, lotNumber: e.target.value})} placeholder="Lot No" />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#0B172B]/70 uppercase">Mark</label>
                  <input type="text" className="w-full mt-1 px-4 py-3 border border-[#0B172B]/10 rounded-xl focus:ring-2 focus:ring-[#009965]/30 outline-none text-sm bg-[#F0F5F9]/50" value={editLotData.mark || ''} onChange={e => setEditLotData({...editLotData, mark: e.target.value})} placeholder="Mark" />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#0B172B]/70 uppercase">Grade</label>
                  <input type="text" className="w-full mt-1 px-4 py-3 border border-[#0B172B]/10 rounded-xl focus:ring-2 focus:ring-[#009965]/30 outline-none text-sm bg-[#F0F5F9]/50" value={editLotData.grade || ''} onChange={e => setEditLotData({...editLotData, grade: e.target.value})} placeholder="Grade" />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#0B172B]/70 uppercase">Bags</label>
                  <input type="number" min="0" className="w-full mt-1 px-4 py-3 border border-[#0B172B]/10 rounded-xl focus:ring-2 focus:ring-[#009965]/30 outline-none text-sm bg-[#F0F5F9]/50" value={editLotData.bags || ''} onChange={e => setEditLotData({...editLotData, bags: parseInt(e.target.value) || 0})} placeholder="Bags" />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#0B172B]/70 uppercase">Weight Per Bag (kg)</label>
                  <input type="number" step="0.01" min="0" className="w-full mt-1 px-4 py-3 border border-[#0B172B]/10 rounded-xl focus:ring-2 focus:ring-[#009965]/30 outline-none text-sm bg-[#F0F5F9]/50" value={editLotData.weightPerBag || ''} onChange={e => setEditLotData({...editLotData, weightPerBag: parseFloat(e.target.value) || 0})} placeholder="Wt/Bag" />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#0B172B]/70 uppercase">Labels (Comma Separated)</label>
                  <input type="text" className="w-full mt-1 px-4 py-3 border border-[#0B172B]/10 rounded-xl focus:ring-2 focus:ring-[#009965]/30 outline-none text-sm bg-[#F0F5F9]/50" value={editLotData.labels ? editLotData.labels.join(', ') : ''} onChange={e => setEditLotData({...editLotData, labels: e.target.value.split(',').map(s=>s.trim())})} placeholder="e.g. Organic, Export" />
                </div>
              </div>
              <div className="pt-2">
                <p className="text-sm font-bold text-right">Combined Net Weight: <span className="text-[#009965] font-mono">{((editLotData.bags || 0) * (editLotData.weightPerBag || 0)).toFixed(2)} kg</span></p>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-[#0B172B]/8">
                <button onClick={cancelEditing} className="px-5 py-2.5 rounded-xl border border-[#0B172B]/10 text-[#0B172B]/70 hover:bg-[#F0F5F9] font-bold text-sm transition-all">Cancel</button>
                <button onClick={saveEditing} className="px-5 py-2.5 rounded-xl bg-[#0B172B] hover:bg-[#009965] text-white font-bold text-sm transition-all shadow-md">Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingPacketId && (
        <div className="fixed inset-0 bg-[#0B172B]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-[0_24px_80px_rgba(11,23,43,0.2)]">
            <div className="p-6 border-b border-[#0B172B]/8 bg-[#F0F5F9]/50 flex justify-between items-center">
              <h3 className="font-bold text-[#0B172B] flex items-center gap-2"><Edit2 size={18} className="text-[#009965]" /> Edit Packet Details</h3>
              <button onClick={cancelEditingPacket} className="text-[#0B172B]/40 hover:text-[#0B172B] bg-white p-1 rounded shadow-sm">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-[#0B172B]/70 uppercase">Product Name</label>
                <input type="text" className="w-full mt-1 px-4 py-3 border border-[#0B172B]/10 rounded-xl focus:ring-2 focus:ring-[#009965]/30 outline-none text-sm bg-[#F0F5F9]/50" value={editPacketData.name || ''} onChange={e => setEditPacketData({...editPacketData, name: e.target.value})} placeholder="Product Name" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-[#0B172B]/70 uppercase">Tracking Unit</label>
                  <select className="w-full mt-1 px-4 py-3 border border-[#0B172B]/10 rounded-xl focus:ring-2 focus:ring-[#009965]/30 outline-none text-sm bg-[#F0F5F9]/50" value={editPacketData.unit || 'KG'} onChange={e => setEditPacketData({...editPacketData, unit: e.target.value})}>
                    <option value="KG">KG</option>
                    <option value="Bundle">Bundle</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#0B172B]/70 uppercase">Multiplier (kg/unit)</label>
                  <input type="number" step="0.001" min="0" className="w-full mt-1 px-4 py-3 border border-[#0B172B]/10 rounded-xl focus:ring-2 focus:ring-[#009965]/30 outline-none text-sm bg-[#F0F5F9]/50" value={editPacketData.size || ''} onChange={e => setEditPacketData({...editPacketData, size: parseFloat(e.target.value) || 0})} placeholder="Multiplier" />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#0B172B]/70 uppercase">Stock Units</label>
                  <input type="number" step="0.001" className="w-full mt-1 px-4 py-3 border border-[#0B172B]/10 rounded-xl focus:ring-2 focus:ring-[#009965]/30 outline-none text-sm bg-[#F0F5F9]/50" value={editPacketData.stock || ''} onChange={e => setEditPacketData({...editPacketData, stock: parseFloat(e.target.value) || 0})} placeholder="Stock" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-[#0B172B]/70 uppercase">HSN Code</label>
                  <input type="text" className="w-full mt-1 px-4 py-3 border border-[#0B172B]/10 rounded-xl focus:ring-2 focus:ring-[#009965]/30 outline-none text-sm bg-[#F0F5F9]/50" value={editPacketData.hsnCode || ''} onChange={e => setEditPacketData({...editPacketData, hsnCode: e.target.value})} placeholder="HSN Code" />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#0B172B]/70 uppercase">GST Rate</label>
                  <select className="w-full mt-1 px-4 py-3 border border-[#0B172B]/10 rounded-xl focus:ring-2 focus:ring-[#009965]/30 outline-none text-sm bg-[#F0F5F9]/50" value={editPacketData.gstRate !== undefined ? editPacketData.gstRate : 5} onChange={e => setEditPacketData({...editPacketData, gstRate: parseFloat(e.target.value)})}>
                    {[0, 5, 8, 9, 10, 12, 15, 18].map(rate => (
                      <option key={rate} value={rate}>{rate}%</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="pt-2">
                <p className="text-sm font-bold text-right">Combined Net Weight: <span className="text-[#009965] font-mono">{((editPacketData.stock || 0) * (editPacketData.size || 0)).toFixed(2)} kg</span></p>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-[#0B172B]/8">
                <button onClick={cancelEditingPacket} className="px-5 py-2.5 rounded-xl border border-[#0B172B]/10 text-[#0B172B]/70 hover:bg-[#F0F5F9] font-bold text-sm transition-all">Cancel</button>
                <button onClick={saveEditingPacket} className="px-5 py-2.5 rounded-xl bg-[#0B172B] hover:bg-[#009965] text-white font-bold text-sm transition-all shadow-md">Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showLedgerAdjustment && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden transform transition-all animate-slide-up">
            <div className="p-5 border-b border-[#0B172B]/8 bg-[#F0F5F9]/50 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-[#0B172B] flex items-center gap-2"><Edit2 size={18} className="text-amber-500"/> Adjust Ledger / Lot</h3>
                <p className="text-xs text-[#0B172B]/55 mt-1">Directly adjust inventory weights.</p>
              </div>
              <button onClick={() => setShowLedgerAdjustment(false)} className="text-[#0B172B]/40 hover:text-[#0B172B] bg-[#F0F5F9] hover:bg-[#0B172B]/10 rounded-full p-1.5 transition-colors">✕</button>
            </div>
            
            <form onSubmit={handleLedgerAdjustmentSubmit} className="p-6 space-y-5">
              
              <div>
                <label className="block text-xs font-bold text-[#0B172B]/70 uppercase tracking-wider mb-3">Select Target System Ledger *</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'l-balance', label: 'LOOSE TEA BALANCE' },
                    { id: 'l-orthodox', label: 'ORTHODOX BALANCE' },
                    { id: 'l-cardamom', label: 'CARDAMOM BALANCE' },
                    { id: 'l-cardamom-husk', label: 'CARDAMOM HUSK BALANCE' },
                  ].map(ledger => (
                    <button
                      key={ledger.id}
                      type="button"
                      onClick={() => setLedgerAdjustmentForm({...ledgerAdjustmentForm, targetId: ledger.id})}
                      className={`p-3 rounded-xl border text-left transition-all ${ledgerAdjustmentForm.targetId === ledger.id ? 'bg-amber-50 border-amber-500 ring-1 ring-amber-500' : 'bg-[#F0F5F9]/50 border-[#0B172B]/10 hover:border-amber-300'}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`p-1 rounded-full flex items-center justify-center ${ledgerAdjustmentForm.targetId === ledger.id ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                          {ledgerAdjustmentForm.targetId === ledger.id ? <Check size={10} /> : <div className="w-2.5 h-2.5"></div>}
                        </div>
                        <span className={`text-xs font-bold leading-tight ${ledgerAdjustmentForm.targetId === ledger.id ? 'text-amber-800' : 'text-[#0B172B]/70'}`}>
                          {ledger.label}
                        </span>
                      </div>
                      <div className="text-[10px] text-[#0B172B]/50 ml-6 font-mono">
                        Stock: {looseInventory.find(l => l.id === ledger.id)?.weight.toFixed(2) || '0.00'} kg
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-[#0B172B]/70 uppercase tracking-wider mb-1">Adjustment Amount (kg) *</label>
                  <input required type="number" step="0.001" value={ledgerAdjustmentForm.amount} onChange={(e) => setLedgerAdjustmentForm({...ledgerAdjustmentForm, amount: e.target.value})} className="w-full px-4 py-3 border border-[#0B172B]/10 rounded-xl bg-[#F0F5F9]/50 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all duration-200 text-sm font-medium" placeholder="e.g. 50 or -10" />
                  <p className="text-[10px] text-amber-600 mt-1.5 font-semibold leading-tight">Use a negative number to deduct. Current weight will be updated directly.</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0B172B]/70 uppercase tracking-wider mb-1">Reason for Adjustment *</label>
                <input required type="text" value={ledgerAdjustmentForm.reason} onChange={(e) => setLedgerAdjustmentForm({...ledgerAdjustmentForm, reason: e.target.value})} className="w-full px-4 py-3 border border-[#0B172B]/10 rounded-xl bg-[#F0F5F9]/50 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all duration-200 text-sm font-medium" placeholder="e.g. Received from farm, Stock taking override" />
              </div>
              
              <div className="pt-4 flex justify-end gap-3 border-t border-[#0B172B]/8 mt-2">
                <button type="button" onClick={() => setShowLedgerAdjustment(false)} className="px-5 py-2.5 font-bold text-sm text-[#0B172B]/60 hover:text-[#0B172B] hover:bg-[#F0F5F9] rounded-xl transition-colors border border-transparent">Cancel</button>
                <button type="submit" disabled={!ledgerAdjustmentForm.targetId} className="bg-[#0B172B] hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 text-sm shadow-md transition-colors">
                  <Check size={16} /> Apply Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
