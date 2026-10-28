'use client';

import { useState, useTransition } from 'react';
import { Activity, AlertTriangle, ShieldCheck, Download, FileText, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { fetchLogs, getArchiveDownloadUrl } from './actions';

export default function LogsClient({ initialSystemLogs, initialErrorLogs, archives }: any) {
  const [activeTab, setActiveTab] = useState<'system' | 'error'>('system');
  const [isPending, startTransition] = useTransition();

  // Pagination state
  const [sysPage, setSysPage] = useState(1);
  const [errPage, setErrPage] = useState(1);

  const [sysLogs, setSysLogs] = useState(initialSystemLogs.data);
  const [errLogs, setErrLogs] = useState(initialErrorLogs.data);

  const handleNextPage = () => {
    const isSys = activeTab === 'system';
    const nextPage = (isSys ? sysPage : errPage) + 1;
    
    startTransition(async () => {
      const res = await fetchLogs(activeTab, nextPage);
      if (isSys) {
        setSysLogs(res.data);
        setSysPage(nextPage);
      } else {
        setErrLogs(res.data);
        setErrPage(nextPage);
      }
    });
  };

  const handlePrevPage = () => {
    const isSys = activeTab === 'system';
    const prevPage = Math.max(1, (isSys ? sysPage : errPage) - 1);
    if (prevPage === (isSys ? sysPage : errPage)) return;
    
    startTransition(async () => {
      const res = await fetchLogs(activeTab, prevPage);
      if (isSys) {
        setSysLogs(res.data);
        setSysPage(prevPage);
      } else {
        setErrLogs(res.data);
        setErrPage(prevPage);
      }
    });
  };

  const handleDownloadArchive = async (filePath: string) => {
    const res = await getArchiveDownloadUrl(filePath);
    if (res.url) {
      window.open(res.url, '_blank');
    } else {
      alert("Failed to download archive. It may have expired.");
    }
  };

  const renderLogsTable = (logs: any[], type: 'system'|'error') => {
    if (logs.length === 0) {
      return (
        <div className="flex-1 p-8 bg-slate-50/50 flex flex-col items-center justify-center text-center border-dashed border-2 border-slate-200 m-8 rounded-2xl">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${type === 'system' ? 'bg-brand-primary/10' : 'bg-red-100'}`}>
            {type === 'system' ? <ShieldCheck className="w-8 h-8 text-brand-primary" /> : <AlertTriangle className="w-8 h-8 text-red-500" />}
          </div>
          <p className="text-slate-700 font-medium mb-1">No logs found.</p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto w-full">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-500 uppercase tracking-wider text-xs">
              <th className="p-4">Timestamp</th>
              <th className="p-4">Message</th>
              <th className="p-4">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map(log => (
              <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="p-4 text-slate-600 font-mono text-sm whitespace-nowrap">
                  {log.created_at ? log.created_at.replace('T', ' ').substring(0, 19) : ''}
                </td>
                <td className="p-4 font-medium text-slate-900 text-sm">{log.message}</td>
                <td className="p-4 text-slate-500 font-mono text-xs max-w-xs truncate" title={JSON.stringify(log.details || log.context || {})}>
                  {JSON.stringify(log.details || log.context || {})}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      
      {/* Header and Archives */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">System Logs</h2>
          <p className="text-slate-500 text-sm sm:text-base max-w-xl mt-1">
            Live monitoring. Logs older than 36 hours are automatically archived into CSV files to preserve storage limits, and held for 3 days.
          </p>
        </div>

        {archives.length > 0 && (
          <div className="flex flex-col gap-2 min-w-[300px]">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Recent CSV Archives</h3>
            {archives.map((arc: any, idx: number) => (
              <button 
                key={arc.id}
                onClick={() => handleDownloadArchive(arc.file_path)}
                className="flex items-center justify-between p-3.5 bg-white border border-slate-200 rounded-2xl hover:border-[#0D4728]/40 hover:shadow-xs transition-all text-left"
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-[#0D4728]" />
                  <div>
                    <p className="text-sm font-bold text-slate-900">Archive {idx + 1}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{new Date(arc.start_date).toLocaleDateString()} - {new Date(arc.end_date).toLocaleDateString()}</p>
                  </div>
                </div>
                <Download className="w-4.5 h-4.5 text-slate-400" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Logs Area */}
      <div className="bg-white border border-slate-200/80 rounded-[28px] overflow-hidden shadow-xs flex flex-col min-h-[500px]">
        {/* Tabs - Dribbble Segmented Capsule Bar */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="inline-flex p-1 bg-slate-100 rounded-full border border-slate-200/80 gap-1">
            <button 
              onClick={() => setActiveTab('system')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all ${
                activeTab === 'system' 
                ? 'bg-[#0D4728] text-[#FFF9CD] font-semibold shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Activity className="w-4 h-4" />
              System Logs
            </button>
            <button 
              onClick={() => setActiveTab('error')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all ${
                activeTab === 'error' 
                ? 'bg-[#0D4728] text-[#FFF9CD] font-semibold shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Error Logs
            </button>
          </div>
          
          <div className="px-6 flex items-center gap-3">
            {isPending && <Loader2 className="w-4 h-4 animate-spin text-[#0D4728]" />}
            <span className="text-sm text-slate-500 font-medium">Page {activeTab === 'system' ? sysPage : errPage}</span>
            <div className="flex items-center gap-1">
              <button 
                onClick={handlePrevPage}
                disabled={isPending || (activeTab === 'system' ? sysPage === 1 : errPage === 1)}
                className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button 
                onClick={handleNextPage}
                disabled={isPending}
                className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Table Content */}
        {activeTab === 'system' ? renderLogsTable(sysLogs, 'system') : renderLogsTable(errLogs, 'error')}
      </div>
    </div>
  );
}
