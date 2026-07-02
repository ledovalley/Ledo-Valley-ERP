import React, { useState, useMemo } from 'react';
import { Search, AlertTriangle, Clock, User, ShieldAlert } from 'lucide-react';
import { AuditLog, SystemUser } from '@/types';

interface AuditLogsModuleProps {
  auditLogs: AuditLog[];
  systemUser: SystemUser;
}

export default function AuditLogsModule({ auditLogs, systemUser }: AuditLogsModuleProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('ALL');

  const filteredLogs = useMemo(() => {
    return auditLogs.filter(log => {
      if (filterType === 'ERRORS' && !log.isError) return false;
      if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        if (
          !log.action.toLowerCase().includes(lower) &&
          !log.details.toLowerCase().includes(lower) &&
          !log.userName.toLowerCase().includes(lower)
        ) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [auditLogs, searchTerm, filterType]);

  if (systemUser.role !== 'super_admin') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <ShieldAlert size={64} className="text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-[#0B172B]">Access Denied</h2>
        <p className="text-[#0B172B]/60 mt-2">You do not have permission to view the system audit logs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-[#0B172B] tracking-tight">System Audit Logs</h2>
          <p className="text-sm text-[#0B172B]/55 mt-1">Immutable chronological record of all system events</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#0B172B]/8 p-4 shadow-sm flex flex-col sm:flex-row gap-4 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0B172B]/40" size={18} />
          <input 
            type="text" 
            placeholder="Search logs by action, details, or user..." 
            className="w-full pl-10 pr-4 py-2 bg-[#F0F5F9] border border-transparent rounded-xl focus:border-[#009965] focus:bg-white transition-all text-sm outline-none font-medium"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="bg-[#F0F5F9] border border-transparent px-4 py-2 rounded-xl text-sm font-bold text-[#0B172B] focus:border-[#009965] focus:bg-white outline-none cursor-pointer"
        >
          <option value="ALL">All Actions</option>
          <option value="ERRORS">Critical / Deletions</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-[#0B172B]/8 shadow-[0_10px_30px_rgba(11,23,43,0.04)] overflow-hidden flex-1 flex flex-col">
        <div className="overflow-auto flex-1 p-2">
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#0B172B]/40">
              <Clock size={48} className="mb-4 opacity-20" />
              <p className="font-bold">No logs found matching your criteria.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLogs.map(log => (
                <div key={log.id} className={`p-4 rounded-xl border ${log.isError ? 'bg-red-50/50 border-red-100' : 'bg-white border-[#0B172B]/5'} flex flex-col md:flex-row gap-4 items-start md:items-center hover:bg-[#F0F5F9]/50 transition-colors`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${log.isError ? 'bg-red-100 text-red-700' : 'bg-[#009965]/10 text-[#009965]'}`}>
                        {log.action}
                      </span>
                      {log.isError && <AlertTriangle size={14} className="text-red-500" />}
                    </div>
                    <p className="text-sm font-medium text-[#0B172B]">{log.details}</p>
                  </div>
                  <div className="flex flex-col md:items-end text-xs text-[#0B172B]/55 whitespace-nowrap">
                    <div className="flex items-center gap-1 font-medium text-[#0B172B]/70 mb-0.5">
                      <User size={12} /> {log.userName}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock size={12} />
                      {new Date(log.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
