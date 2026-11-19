'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X, Download, Phone, MapPin, ShoppingBag, Eye, AlertTriangle } from 'lucide-react';
import { fetchRetailerHistory, type RetailerHistory } from './insightsActions';
import { buildHistoryWorkbook } from './retailerInsightsReport';
import { saveXlsx } from './allowanceReport';
import { productLines, monthlyRevenue, paymentMix, timeline, orderItems, daysBetween, DORMANT_DAYS } from '@/utils/retailerInsights';
import { istDate } from '@/utils/allowanceWeek';

const inr = (n: number) => `${n < 0 ? '-' : ''}₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const dt = (ts: string) => new Date(ts).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: '2-digit', hour: 'numeric', minute: '2-digit' });
const TL_PAGE = 30;

/** One retailer's whole history (admins only, read only). */
export default function RetailerHistoryDialog({ retailerId, onClose }: { retailerId: string; onClose: () => void }) {
  const [h, setH] = useState<RetailerHistory | null>(null);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);
  const [tlShown, setTlShown] = useState(TL_PAGE);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    let live = true;
    fetchRetailerHistory(retailerId)
      .then(res => { if (!live) return; if ('error' in res) setError(res.error); else setH(res); })
      .catch(e => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [retailerId]);

  const d = useMemo(() => {
    if (!h) return null;
    const revenue = h.orders.reduce((t, o) => t + o.amount, 0);
    const last = h.orders[0]?.createdAt || null;
    const first = h.orders[h.orders.length - 1]?.createdAt || null;
    const gap = h.orders.length >= 2 && first && last ? Math.round((daysBetween(istDate(first), istDate(last)) / (h.orders.length - 1)) * 10) / 10 : null;
    const monthly = monthlyRevenue(h.orders, 12);
    return {
      revenue, last, first, gap,
      daysSince: last ? Math.max(0, daysBetween(istDate(last), h.today)) : null,
      mix: paymentMix(h.orders),
      products: productLines(h.orders),
      monthly,
      maxMonth: Math.max(1, ...monthly.map(m => m.revenue)),
      tl: timeline(h.orders, h.visits),
      visitsOrder: h.visits.filter(v => v.type === 'order').length,
      visitsNo: h.visits.filter(v => v.type === 'no_order').length,
      reasons: Object.entries(h.visits.filter(v => v.type === 'no_order').reduce<Record<string, number>>((m, v) => { const k = v.reason.trim() || 'Other'; m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, b) => (b[1] as number) - (a[1] as number))
    };
  }, [h]);

  if (!mounted) return null;
  const name = (id: string | null) => (id && h?.names[id]) || '';
  const mixTotal = d ? d.mix.cash + d.mix.online + d.mix.due : 0;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white w-full sm:max-w-3xl max-h-[94vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl">
        <div className="sticky top-0 bg-white z-10 flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 truncate">{h ? (h.retailer.shopName || h.retailer.name) : 'Retailer history'}</h3>
            {h && <p className="text-xs text-slate-500 truncate">{[h.retailer.shopName ? h.retailer.name : '', h.retailer.territory, name(h.retailer.salesPersonId) && `Sales person: ${name(h.retailer.salesPersonId)}`].filter(Boolean).join(' · ')}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {h && <button type="button" onClick={() => saveXlsx(buildHistoryWorkbook(h), `Retailer_${(h.retailer.shopName || h.retailer.name || 'history').replace(/[^A-Za-z0-9]+/g, '_')}.xlsx`)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Download className="w-3.5 h-3.5" /> Excel</button>}
            <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-500" aria-label="Close"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {error ? (
            <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
          ) : !h || !d ? (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : (
            <>
              {h.retailer.removed && <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800">This retailer was removed by an admin. Its history is kept here for reference.</div>}
              {h.truncated && <div className="flex items-start gap-2 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800"><AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />Only the most recent records are shown. The totals on the Insights table are always complete.</div>}

              {(h.retailer.phone || h.retailer.address) && (
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
                  {h.retailer.phone && <span className="inline-flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{h.retailer.phone}</span>}
                  {h.retailer.address && <span className="inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{h.retailer.address}</span>}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { l: 'Orders', v: String(h.orders.length) },
                  { l: 'Revenue', v: inr(d.revenue) },
                  { l: 'Average order', v: h.orders.length ? inr(Math.round(d.revenue / h.orders.length)) : '—' },
                  { l: 'Still due', v: d.mix.due > 0 ? inr(d.mix.due) : '—', warn: d.mix.due > 0 },
                  { l: 'Last order', v: d.last ? dt(d.last).replace(/,.*$/, '') : 'never', s: d.daysSince === null ? '' : d.daysSince === 0 ? 'today' : `${d.daysSince} days ago`, red: d.daysSince !== null && d.daysSince >= DORMANT_DAYS },
                  { l: 'Orders every', v: d.gap ? `~${d.gap} days` : '—' },
                  { l: 'Visits', v: String(h.visits.length), s: h.visits.length ? `${d.visitsOrder} ended in an order` : '' },
                  { l: 'First order', v: d.first ? dt(d.first).replace(/,.*$/, '') : '—' }
                ].map(c => (
                  <div key={c.l} className="bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2.5">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{c.l}</div>
                    <div className={`text-base font-semibold ${c.warn ? 'text-orange-700' : c.red ? 'text-red-600' : 'text-slate-900'}`}>{c.v}</div>
                    {c.s && <div className={`text-[10px] ${c.red ? 'text-red-600' : 'text-slate-400'}`}>{c.s}</div>}
                  </div>
                ))}
              </div>

              <section>
                <h4 className="text-sm font-semibold text-slate-900 mb-2">Revenue by month</h4>
                <div className="flex items-end gap-1.5 h-28">
                  {d.monthly.map(m => (
                    <div key={m.month} className="flex-1 flex flex-col items-center justify-end h-full min-w-0" title={`${monthLabel(m.month)}: ${inr(m.revenue)} from ${m.orders} order${m.orders === 1 ? '' : 's'}`}>
                      <div className="w-full rounded-t bg-[#0D4728]" style={{ height: `${m.revenue > 0 ? Math.max(3, (m.revenue / d.maxMonth) * 100) : 0}%`, minHeight: m.revenue > 0 ? 3 : 0 }} />
                      <div className="h-px w-full bg-slate-200" />
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5 mt-1">{d.monthly.map(m => <div key={m.month} className="flex-1 text-center text-[9px] text-slate-400 truncate">{monthLabel(m.month).split(' ')[0]}</div>)}</div>
              </section>

              <section>
                <h4 className="text-sm font-semibold text-slate-900 mb-2">How they pay</h4>
                {mixTotal === 0 ? <p className="text-xs text-slate-400">No payments yet.</p> : (
                  <>
                    <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100">
                      <div className="bg-[#0D4728]" style={{ width: `${(d.mix.cash / mixTotal) * 100}%` }} />
                      <div className="bg-[#E4B84D]" style={{ width: `${(d.mix.online / mixTotal) * 100}%` }} />
                      <div className="bg-orange-400" style={{ width: `${(d.mix.due / mixTotal) * 100}%` }} />
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-600">
                      <span><i className="inline-block w-2 h-2 rounded-full bg-[#0D4728] mr-1.5" />Cash {inr(d.mix.cash)}</span>
                      <span><i className="inline-block w-2 h-2 rounded-full bg-[#E4B84D] mr-1.5" />Online {inr(d.mix.online)}</span>
                      <span><i className="inline-block w-2 h-2 rounded-full bg-orange-400 mr-1.5" />Still due {inr(d.mix.due)}</span>
                    </div>
                  </>
                )}
              </section>

              <section>
                <h4 className="text-sm font-semibold text-slate-900 mb-2">What they buy</h4>
                {d.products.lines.length === 0 ? <p className="text-xs text-slate-400">None of the orders have a product list.</p> : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden text-xs">
                    <div className="grid grid-cols-[1.5fr_0.8fr_1.6fr] gap-2 px-3 py-2 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 font-semibold"><span>Product</span><span>Orders</span><span>Total quantity</span></div>
                    {d.products.lines.map(l => (
                      <div key={l.name} className="grid grid-cols-[1.5fr_0.8fr_1.6fr] gap-2 px-3 py-2 border-t border-slate-100">
                        <span className="font-medium text-slate-800 truncate">{l.name}</span>
                        <span className="text-slate-600">{l.orders}</span>
                        <span className="text-slate-600">{l.quantities.length ? l.quantities.map(q => `${q.total.toLocaleString('en-IN')}${q.unit ? ' ' + q.unit : ''}`).join(' + ') : '—'}{l.unparsed ? <span className="text-slate-400"> ({l.unparsed} not added up)</span> : null}</span>
                      </div>
                    ))}
                  </div>
                )}
                {d.products.ordersWithoutProducts > 0 && <p className="text-[11px] text-slate-400 mt-1.5">{d.products.ordersWithoutProducts} order{d.products.ordersWithoutProducts === 1 ? ' has' : 's have'} no product list. Quantities are as typed on each order.</p>}
              </section>

              {d.reasons.length > 0 && (
                <section>
                  <h4 className="text-sm font-semibold text-slate-900 mb-2">Why visits ended without an order</h4>
                  <div className="flex flex-wrap gap-2">{d.reasons.map(([r, n]) => <span key={r} className="px-2.5 py-1 rounded-full bg-slate-100 text-xs text-slate-700">{r} · {n}</span>)}</div>
                </section>
              )}

              <section>
                <h4 className="text-sm font-semibold text-slate-900 mb-2">Orders and visits, newest first</h4>
                {d.tl.length === 0 ? <p className="text-xs text-slate-400">Nothing recorded yet.</p> : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    {d.tl.slice(0, tlShown).map(e => e.kind === 'order' ? (
                      <div key={'o' + e.order.id} className="flex gap-3 px-3 py-2.5 border-t first:border-t-0 border-slate-100 text-xs">
                        <ShoppingBag className="w-4 h-4 text-[#0D4728] mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between gap-2"><span className="font-semibold text-slate-900">Order {inr(e.order.amount)}</span><span className="text-slate-400 shrink-0">{dt(e.order.createdAt)}</span></div>
                          <div className="text-slate-500">{name(e.order.salesPersonId)}{e.order.due > 0 ? ` · ${inr(e.order.due)} due` : ' · paid'}{e.order.deliveryStatus === 'pending' ? ' · not delivered yet' : ''}</div>
                          {(() => { const it = orderItems(e.order.notes); return it.length ? <div className="text-slate-600 truncate">{it.map(i => `${i.name} (${i.quantity ?? ''})`).join(', ')}</div> : null; })()}
                        </div>
                      </div>
                    ) : (
                      <div key={'v' + e.visit.id} className="flex gap-3 px-3 py-2.5 border-t first:border-t-0 border-slate-100 text-xs bg-slate-50/60">
                        <Eye className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between gap-2"><span className="font-medium text-slate-700">Visit, no order: {e.visit.reason || 'Other'}</span><span className="text-slate-400 shrink-0">{dt(e.visit.createdAt)}</span></div>
                          <div className="text-slate-500">{name(e.visit.salesPersonId)}{e.visit.notes ? ` · ${e.visit.notes}` : ''}</div>
                        </div>
                      </div>
                    ))}
                    {d.tl.length > tlShown && <div className="p-2.5 text-center border-t border-slate-100"><button type="button" onClick={() => setTlShown(n => n + TL_PAGE)} className="px-4 py-1.5 rounded-full text-xs font-semibold text-[#0D4728] hover:bg-[#0D4728]/5">Show more ({d.tl.length - tlShown} left)</button></div>}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
