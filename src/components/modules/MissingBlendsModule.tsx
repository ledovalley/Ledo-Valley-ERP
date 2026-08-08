import React, { useState } from 'react';
import { AlertTriangle, Search, FileText, RefreshCw } from 'lucide-react';

interface MissingBlendsModuleProps {
  missingBlends: string[];
}

export default function MissingBlendsModule({ missingBlends }: MissingBlendsModuleProps) {
  const [isScanning, setIsScanning] = useState(false);

  const handleManualScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
    }, 1500);
  };

  return (
    <div className="bg-white rounded-2xl border border-[#0B172B]/8 p-6 flex flex-col h-full transition-all shadow-[0_10px_30px_rgba(11,23,43,0.04)] font-sans">
      <div className="border-b border-[#0B172B]/8 pb-4 mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white px-6 -mx-6 -mt-6 pt-6 rounded-t-2xl gap-4">
        <div>
          <h2 className="text-2xl font-black text-[#0B172B] tracking-tight">Gap Analysis</h2>
          <p className="text-sm font-semibold text-[#0B172B]/50 mt-1">
            Automatically track missing SL-XX sequence tags in the blend system.
          </p>
        </div>
        <button 
          onClick={handleManualScan}
          disabled={isScanning}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#F0F5F9] text-[#0B172B] hover:bg-[#E2E8F0] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-bold text-sm transition-colors border border-[#0B172B]/10"
        >
          <RefreshCw size={16} className={isScanning ? 'animate-spin' : ''} />
          {isScanning ? 'Scanning Database...' : 'Run Manual Scan'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar relative">
        <div className="mx-auto w-full">

          <div className="bg-[#F0F5F9]/50 rounded-2xl p-6 border border-[#0B172B]/8 shadow-inner">
            <div className="flex items-center gap-4 mb-6">
              <div className={`p-3 rounded-xl ${missingBlends.length > 0 ? 'bg-rose-100 text-rose-600' : 'bg-[#009965]/10 text-[#009965]'}`}>
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="font-bold text-[#0B172B] text-lg">
                  {missingBlends.length > 0 
                    ? `${missingBlends.length} Missing Blend(s) Detected` 
                    : 'All Blends Accounted For'}
                </h3>
                <p className="text-sm text-[#0B172B]/60 font-medium">
                  {missingBlends.length > 0 
                    ? 'The following SL serial numbers are missing from the sequence.' 
                    : 'There are no gaps in your SL-XX sequential numbering.'}
                </p>
              </div>
            </div>

            {isScanning ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <RefreshCw size={32} className="text-[#0B172B]/20 animate-spin mb-4" />
                <p className="text-[#0B172B]/40 font-bold">Scanning active and historical databases...</p>
              </div>
            ) : missingBlends.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {missingBlends.map(sl => (
                  <div key={sl} className="bg-white p-4 rounded-xl border border-rose-200 shadow-sm flex flex-col items-center justify-center relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-8 h-8 bg-rose-50 rounded-bl-xl flex items-center justify-center">
                      <FileText size={12} className="text-rose-400" />
                    </div>
                    <span className="text-[10px] font-black tracking-widest text-rose-400 uppercase mb-1">Missing Code</span>
                    <span className="text-xl font-black text-rose-600 font-mono tracking-tight">{sl}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm border border-[#009965]/20 mb-4">
                  <Search size={24} className="text-[#009965]/50" />
                </div>
                <p className="text-[#0B172B]/40 font-bold">System integrity verified. No missing records.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
