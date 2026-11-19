'use client';

// Admin-only tools on the Sales page: cancel a sale, delete a retailer, and the
// records of cancelled orders and removed retailers (with Restore).

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, RotateCcw, Trash2, X } from 'lucide-react';
import {
  cancelSale, deleteRetailer, restoreRetailer, fetchSalesAdminRecords,
  type CancelledSale, type RemovedRetailer
} from './actions';

const rs = (n: number) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const when = (ts: string | null) => ts ? new Date(ts).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

function Shell({ title, onClose, working, children }: { title: string; onClose: () => void; working: boolean; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md" onClick={() => !working && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-rose-100 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 pb-0 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 leading-tight">{title}</h3>
          </div>
          <button type="button" onClick={onClose} disabled={working} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center shrink-0 disabled:opacity-50">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}

const inputCls = 'w-full mt-1 px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-200 focus:border-rose-400 outline-none text-sm text-slate-900 bg-white placeholder:text-slate-400 font-medium';

/** Cancel one sale: shows what will happen, asks for a reason and the delete password. */
export function CancelSaleDialog({ sale, salesPersonName, onClose, onDone }: {
  sale: any; salesPersonName?: string; onClose: () => void; onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const amount = Number(sale.amount) || 0;
  const cash = Number(sale.cash_amount) || 0;
  const online = Number(sale.online_amount) || 0;
  const due = sale.due_amount !== undefined && sale.due_amount !== null ? Number(sale.due_amount) : Math.max(0, amount - cash - online);
  const shop = sale.retailers?.shop_name || sale.retailers?.name || 'this retailer';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (working || done) return;
    if (!password.trim()) { setError('Enter the delete password.'); return; }
    setWorking(true); setError('');
    try {
      const res: any = await cancelSale(sale.id, password, reason);
      if (res?.error) { setError(res.error); return; }
      const parts = [`Order of ${rs(res.amount)} cancelled.`];
      if (res.cashOffShiftNow) parts.push(`${rs(res.cash)} cash taken off ${salesPersonName || 'the sales person'}'s running shift.`);
      if (res.cashOffNextShift) parts.push(`${rs(res.cash)} cash will come off ${salesPersonName || 'the sales person'}'s next shift.`);
      if (res.online > 0) parts.push(`${rs(res.online)} was paid online: refund it from the office.`);
      setDone(parts.join(' '));
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Not cancelled. Please try again.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <Shell title={done ? 'Order cancelled' : 'Cancel this order?'} onClose={onClose} working={working}>
      {done ? (
        <>
          <p className="text-sm text-slate-700 leading-relaxed">{done}</p>
          <div className="flex justify-end">
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm">Close</button>
          </div>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm">
            <div className="font-bold text-slate-900">{shop}</div>
            <div className="text-slate-600 mt-0.5">
              {when(sale.created_at)}{salesPersonName ? ` • ${salesPersonName}` : ''}
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2 text-center">
              {[['Amount', amount], ['Cash', cash], ['Online', online], ['Due', due]].map(([k, v]) => (
                <div key={k as string} className="bg-white border border-slate-200 rounded-lg py-1.5">
                  <div className="text-[10px] uppercase font-bold text-slate-500">{k}</div>
                  <div className="font-bold text-slate-900 text-xs">{rs(v as number)}</div>
                </div>
              ))}
            </div>
          </div>
          <ul className="text-xs text-slate-600 space-y-1 list-disc pl-4">
            <li>The order leaves all totals, dues, targets and reports. It is kept in Cancelled orders.</li>
            {cash > 0 && <li><strong>{rs(cash)} cash</strong> comes off {salesPersonName || 'the sales person'}&apos;s running shift, or their next shift if none is running.</li>}
            {online > 0 && <li><strong>{rs(online)} paid online</strong> is only recorded: refund it from the office.</li>}
            <li>This cannot be undone. To put it back, enter the order again.</li>
          </ul>
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase">Reason</label>
            <input type="text" maxLength={300} className={inputCls} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. entered twice, goods returned" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase">Delete password *</label>
            <input type="password" autoComplete="off" className={inputCls} value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-sm font-bold text-rose-600">{error}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} disabled={working} className="px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-sm disabled:opacity-50">Keep it</button>
            <button type="submit" disabled={working} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm disabled:opacity-60">
              <Trash2 className="w-4 h-4" /> {working ? 'Cancelling…' : 'Cancel order'}
            </button>
          </div>
        </form>
      )}
    </Shell>
  );
}

/** Delete a retailer (or hide it, if it has orders or visits). */
export function DeleteRetailerDialog({ retailer, onClose, onDone }: { retailer: any; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const shop = retailer.shop_name || retailer.name || 'this retailer';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (working || done) return;
    if (!password.trim()) { setError('Enter the delete password.'); return; }
    setWorking(true); setError('');
    try {
      const res: any = await deleteRetailer(retailer.id, password);
      if (res?.error) { setError(res.error); return; }
      setDone(res.mode === 'deleted'
        ? `${shop} had no orders or visits and was deleted.`
        : `${shop} has ${res.orders} order(s) and ${res.visits} visit(s) on record, so it was hidden instead of deleted. Past orders keep its name. You can restore it from Admin records.`);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Not deleted. Please try again.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <Shell title={done ? 'Retailer removed' : 'Delete this retailer?'} onClose={onClose} working={working}>
      {done ? (
        <>
          <p className="text-sm text-slate-700 leading-relaxed">{done}</p>
          <div className="flex justify-end">
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm">Close</button>
          </div>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-slate-700"><strong>{shop}</strong>{retailer.name && retailer.shop_name ? ` (${retailer.name})` : ''}</p>
          <ul className="text-xs text-slate-600 space-y-1 list-disc pl-4">
            <li>If it still owes money, this is refused: collect the dues or cancel those orders first.</li>
            <li>With no orders or visits, it is deleted for good.</li>
            <li>Otherwise it is hidden: sales people no longer see it, past orders keep its name, and you can restore it.</li>
          </ul>
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase">Delete password *</label>
            <input type="password" autoComplete="off" className={inputCls} value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-sm font-bold text-rose-600">{error}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} disabled={working} className="px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-sm disabled:opacity-50">Keep it</button>
            <button type="submit" disabled={working} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm disabled:opacity-60">
              <Trash2 className="w-4 h-4" /> {working ? 'Deleting…' : 'Delete retailer'}
            </button>
          </div>
        </form>
      )}
    </Shell>
  );
}

/** Collapsed panel for admins: cancelled orders, and removed retailers with Restore. */
export function SalesAdminRecords({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<{ cancelled: CancelledSale[]; removed: RemovedRetailer[]; needsSql: boolean } | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetchSalesAdminRecords();
      if ('error' in res) setError(res.error); else setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load.');
    } finally {
      setLoading(false);
    }
  };
  // Load when opened, and again after a cancel / delete / restore
  useEffect(() => { if (open) load(); }, [open, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const restore = async (r: RemovedRetailer) => {
    if (restoring) return;
    if (!confirm(`Restore ${r.shopName || r.name}? Sales people will see it again.`)) return;
    setRestoring(r.id);
    try {
      const res: any = await restoreRetailer(r.id);
      if (res?.error) alert(res.error); else onChanged();
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className="mt-4 bg-white border border-slate-200/80 rounded-[24px] overflow-hidden shadow-xs">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-slate-50">
        <span className="text-sm font-bold text-slate-800">Admin records: cancelled orders and removed retailers</span>
        <span className="text-xs font-semibold text-slate-500">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 p-4 sm:p-5 space-y-6">
          {loading && <p className="text-sm text-slate-500">Loading…</p>}
          {error && <p className="text-sm font-bold text-rose-600">{error}</p>}
          {data?.needsSql && (
            <p className="text-sm font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              This needs a one-time database update: run 20261117_sale_cancel_retailer_delete.sql in Supabase.
            </p>
          )}
          {data && !data.needsSql && (
            <>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Cancelled orders ({data.cancelled.length})</h4>
                {data.cancelled.length === 0 ? <p className="text-sm text-slate-500">None.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[720px]">
                      <thead>
                        <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-200">
                          <th className="py-2 pr-3">Cancelled</th><th className="py-2 pr-3">Retailer</th><th className="py-2 pr-3">Sales person</th>
                          <th className="py-2 pr-3 text-right">Amount</th><th className="py-2 pr-3 text-right">Cash</th><th className="py-2 pr-3 text-right">Online</th>
                          <th className="py-2 pr-3">Cash refund</th><th className="py-2">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.cancelled.map(c => (
                          <tr key={c.id} className="border-b border-slate-100 align-top">
                            <td className="py-2 pr-3 whitespace-nowrap">{when(c.cancelledAt)}<div className="text-[11px] text-slate-500">by {c.cancelledByName || 'admin'}</div></td>
                            <td className="py-2 pr-3">{c.shopName || c.retailerName || '-'}<div className="text-[11px] text-slate-500">ordered {when(c.saleCreatedAt)}</div></td>
                            <td className="py-2 pr-3">{c.salesPersonName || '-'}</td>
                            <td className="py-2 pr-3 text-right font-semibold">{rs(c.amount)}</td>
                            <td className="py-2 pr-3 text-right">{rs(c.cash)}</td>
                            <td className="py-2 pr-3 text-right">{rs(c.online)}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">
                              {c.cashRefund <= 0 ? '-' : c.cashRefundPending
                                ? <span className="text-amber-700 font-semibold">{rs(c.cashRefund)} waiting for next shift</span>
                                : <span className="text-emerald-700 font-semibold">{rs(c.cashRefund)} taken off shift</span>}
                            </td>
                            <td className="py-2 text-slate-600">{c.reason || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Removed retailers ({data.removed.length})</h4>
                {data.removed.length === 0 ? <p className="text-sm text-slate-500">None.</p> : (
                  <div className="space-y-2">
                    {data.removed.map(r => (
                      <div key={r.id} className="flex items-center justify-between gap-3 border border-slate-200 rounded-xl px-4 py-2.5">
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-slate-900 truncate">{r.shopName || r.name}</div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {[r.name, r.territory, r.salesPersonName].filter(Boolean).join(' • ')}
                            {r.removedAt ? ` • removed ${when(r.removedAt)}${r.removedByName ? ` by ${r.removedByName}` : ''}` : ''}
                          </div>
                        </div>
                        <button type="button" onClick={() => restore(r)} disabled={restoring === r.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-xs font-bold disabled:opacity-50 shrink-0">
                          <RotateCcw className="w-3.5 h-3.5" /> {restoring === r.id ? 'Restoring…' : 'Restore'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
