'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Download, Search, ChevronDown, ChevronUp, AlertTriangle, Info, Store } from 'lucide-react';
import { fetchRetailerInsights, type InsightsData } from './insightsActions';
import { buildInsightsWorkbook } from './retailerInsightsReport';
import { saveXlsx } from './allowanceReport';
import RetailerHistoryDialog from './RetailerHistoryDialog';
import { PERIOD_CHOICES, TAG_LABEL, TAG_HELP, DORMANT_DAYS, byTerritory, type InsightTag, type InsightResult } from '@/utils/retailerInsights';
import { istDate } from '@/utils/allowanceWeek';

const inr = (n: number) => `${n < 0 ? '-' : ''}₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const TAG_STYLE: Record<InsightTag, string> = {
  top: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  growing: 'bg-green-50 text-green-800 border-green-200',
  new: 'bg-sky-50 text-sky-800 border-sky-200',
  slipping: 'bg-amber-50 text-amber-800 border-amber-200',
  dormant: 'bg-red-50 text-red-700 border-red-200',
  never: 'bg-slate-100 text-slate-600 border-slate-200',
  highdue: 'bg-orange-50 text-orange-800 border-orange-200'
};
const TAG_ORDER: InsightTag[] = ['top', 'growing', 'new', 'slipping', 'dormant', 'never', 'highdue'];

type SortKey = 'revenue' | 'orders' | 'last' | 'due' | 'conversion' | 'name';
const PAGE = 50;

const shortDate = (ts: string | null) => {
  if (!ts) return '—';
  const d = new Date(istDate(ts) + 'T00:00:00Z');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });
};
const since = (n: number | null) => (n === null ? '' : n === 0 ? 'today' : n === 1 ? '1 day ago' : `${n} days ago`);

export default function RetailerInsights() {
  const [days, setDays] = useState<number>(90);
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tag, setTag] = useState<InsightTag | 'all'>('all');
  const [search, setSearch] = useState('');
  const [territory, setTerritory] = useState('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'revenue', dir: -1 });
  const [shown, setShown] = useState(PAGE);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true); setError('');
    fetchRetailerInsights(days)
      .then(res => {
        if (!live) return;
        if ('error' in res) { setError(res.error); setData(null); } else setData(res);
      })
      .catch(e => { if (live) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [days]);

  useEffect(() => { setShown(PAGE); }, [tag, search, territory, sort, days]);

  const rows = data?.rows || [];
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const t of TAG_ORDER) c[t] = rows.filter(r => r.tags.includes(t)).length;
    return c;
  }, [rows]);
  const territories = useMemo(() => [...new Set(rows.map(r => r.territory.trim() || 'No territory'))].sort(), [rows]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const f = rows.filter(r =>
      (tag === 'all' || r.tags.includes(tag)) &&
      (territory === 'all' || (r.territory.trim() || 'No territory') === territory) &&
      (!q || `${r.shopName} ${r.name} ${r.territory}`.toLowerCase().includes(q)));
    const val = (r: InsightResult): number | string => {
      switch (sort.key) {
        case 'revenue': return r.revenuePeriod;
        case 'orders': return r.ordersPeriod;
        case 'last': return r.daysSinceOrder === null ? Number.POSITIVE_INFINITY : r.daysSinceOrder;
        case 'due': return r.dueOutstanding;
        case 'conversion': return r.conversion === null ? -1 : r.conversion;
        default: return (r.shopName || r.name).toLowerCase();
      }
    };
    return [...f].sort((a, b) => {
      const x = val(a), y = val(b);
      const c = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number);
      return (c || (a.shopName || a.name).localeCompare(b.shopName || b.name)) * sort.dir;
    });
  }, [rows, tag, territory, search, sort]);

  const totals = useMemo(() => ({
    revenue: rows.reduce((t, r) => t + r.revenuePeriod, 0),
    ordered: rows.filter(r => r.ordersPeriod > 0).length,
    due: rows.reduce((t, r) => t + r.dueOutstanding, 0)
  }), [rows]);
  const terr = useMemo(() => byTerritory(rows), [rows]);
  const maxReason = Math.max(1, ...(data?.reasons.map(r => r.visits) || [1]));

  const setSortKey = (key: SortKey) => setSort(s => s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'name' ? 1 : -1 });
  const arrow = (key: SortKey) => sort.key === key ? (sort.dir === -1 ? <ChevronDown className="inline w-3 h-3" /> : <ChevronUp className="inline w-3 h-3" />) : null;

  const download = () => {
    if (!data) return;
    const bits = [tag !== 'all' ? (TAG_LABEL as Record<string, string>)[tag] : '', territory !== 'all' ? territory : '', search.trim() ? `search "${search.trim()}"` : ''].filter(Boolean).join(', ');
    saveXlsx(buildInsightsWorkbook(data, list, bits), `Retailer_Insights_${days}_days.xlsx`);
  };

  const Th = ({ k, children, className = '' }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <button type="button" onClick={() => setSortKey(k)} className={`text-left uppercase tracking-wide hover:text-slate-900 ${sort.key === k ? 'text-slate-900' : ''} ${className}`}>{children} {arrow(k)}</button>
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Period and download */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex p-1 bg-white rounded-full border border-slate-200 gap-1">
            {PERIOD_CHOICES.map(n => (
              <button key={n} type="button" onClick={() => setDays(n)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold ${days === n ? 'bg-[#0D4728] text-[#FFF9CD]' : 'text-slate-600 hover:bg-slate-100'}`}>{n} days</button>
            ))}
          </div>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          {data && !loading && <span className="text-[11px] sm:text-xs text-slate-500">{data.periodLabel}, compared with the {data.previousLabel}</span>}
        </div>
        <button type="button" onClick={download} disabled={!data || list.length === 0}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-white border border-slate-200 text-xs sm:text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40">
          <Download className="w-4 h-4" /> Download Excel
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-2xl bg-red-50 border border-red-200 text-sm text-red-700"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>
      )}

      {!error && !data && loading && <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Adding up every retailer…</div>}

      {data && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3">
            {[
              { l: 'Retailers', v: String(rows.length), s: `${totals.ordered} ordered in ${days} days` },
              { l: `Revenue, ${days} days`, v: inr(totals.revenue), s: '' },
              { l: 'Dormant', v: String(counts.dormant), s: `no order for ${DORMANT_DAYS}+ days`, t: 'dormant' as InsightTag },
              { l: 'Never ordered', v: String(counts.never), s: 'visited or added only', t: 'never' as InsightTag },
              { l: 'Outstanding due', v: inr(totals.due), s: (() => { const n = rows.filter(r => r.dueOutstanding > 0).length; return `${n} ${n === 1 ? 'retailer owes' : 'retailers owe'}`; })() }
            ].map(c => (
              <button key={c.l} type="button" disabled={!c.t} onClick={() => c.t && setTag(tag === c.t ? 'all' : c.t)}
                className={`text-left bg-white border rounded-2xl px-3.5 py-3 ${c.t ? 'hover:bg-slate-50' : 'cursor-default'} ${c.t && tag === c.t ? 'border-[#0D4728]' : 'border-slate-200'}`}>
                <div className="text-[10px] sm:text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{c.l}</div>
                <div className="text-lg sm:text-xl font-semibold text-slate-900 mt-0.5">{c.v}</div>
                {c.s && <div className="text-[10px] sm:text-[11px] text-slate-400">{c.s}</div>}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button type="button" onClick={() => setTag('all')} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${tag === 'all' ? 'bg-[#0D4728] text-[#FFF9CD] border-[#0D4728]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>All ({counts.all})</button>
              {TAG_ORDER.map(t => (
                <button key={t} type="button" title={TAG_HELP[t]} onClick={() => setTag(tag === t ? 'all' : t)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${tag === t ? 'bg-[#0D4728] text-[#FFF9CD] border-[#0D4728]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{TAG_LABEL[t]} ({counts[t]})</button>
              ))}
            </div>
            <div className="flex items-center gap-2 lg:ml-auto">
              <div className="relative flex-1 lg:w-56">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search shop or owner"
                  className="w-full bg-white border border-slate-200 rounded-full pl-8 pr-3 py-2 text-xs sm:text-sm" />
              </div>
              <select value={territory} onChange={e => setTerritory(e.target.value)} className="bg-white border border-slate-200 rounded-full px-3 py-2 text-xs sm:text-sm max-w-[9rem]">
                <option value="all">All territories</option>
                {territories.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="hidden lg:grid grid-cols-[2.2fr_1.3fr_0.7fr_1.2fr_1fr_0.8fr_1.6fr] gap-3 px-4 py-2.5 bg-slate-50 text-[11px] text-slate-500 font-semibold">
              <Th k="name">Retailer</Th>
              <Th k="revenue">Revenue ({days}d)</Th>
              <Th k="orders">Orders</Th>
              <Th k="last">Last order</Th>
              <Th k="due">Due</Th>
              <Th k="conversion" className="">Visits → order</Th>
              <span className="uppercase tracking-wide">Tags</span>
            </div>
            {list.length === 0 ? (
              <div className="py-14 text-center text-sm text-slate-400"><Store className="w-5 h-5 mx-auto mb-2" />No retailers match.</div>
            ) : list.slice(0, shown).map(r => (
              <button key={r.retailerId} type="button" onClick={() => setOpenId(r.retailerId)}
                className="w-full text-left grid grid-cols-2 lg:grid-cols-[2.2fr_1.3fr_0.7fr_1.2fr_1fr_0.8fr_1.6fr] gap-x-3 gap-y-1.5 px-4 py-3 border-t border-slate-100 hover:bg-slate-50 items-center text-xs sm:text-sm">
                <div className="col-span-2 lg:col-span-1 min-w-0">
                  <div className="font-semibold text-slate-900 truncate">{r.shopName || r.name}</div>
                  <div className="text-[11px] text-slate-500 truncate">{[r.shopName ? r.name : '', r.territory, data.names[r.salesPersonId || ''] ].filter(Boolean).join(' · ')}</div>
                </div>
                <div>
                  <div className="font-semibold text-slate-900">{inr(r.revenuePeriod)}</div>
                  {r.changePct !== null && <div className={`text-[11px] ${r.changePct < 0 ? 'text-amber-700' : 'text-green-700'}`}>{r.changePct > 0 ? '+' : ''}{r.changePct}% vs before</div>}
                </div>
                <div className="text-slate-700"><span className="lg:hidden text-slate-400 text-[11px]">Orders </span>{r.ordersPeriod}<span className="text-[11px] text-slate-400"> / {r.ordersTotal} ever</span></div>
                <div>
                  <div className="text-slate-800">{shortDate(r.lastOrderAt)}</div>
                  <div className={`text-[11px] ${r.daysSinceOrder !== null && r.daysSinceOrder >= DORMANT_DAYS ? 'text-red-600 font-medium' : 'text-slate-400'}`}>{r.ordersTotal === 0 ? 'never ordered' : since(r.daysSinceOrder)}{r.avgGapDays ? ` · every ~${r.avgGapDays}d` : ''}</div>
                </div>
                <div className={r.dueOutstanding > 0 ? 'text-orange-700 font-medium' : 'text-slate-400'}><span className="lg:hidden text-slate-400 text-[11px] font-normal">Due </span>{r.dueOutstanding > 0 ? inr(r.dueOutstanding) : '—'}</div>
                <div className="text-slate-700">{r.conversion === null ? <span className="text-slate-400">no visits</span> : <>{Math.round(r.conversion * 100)}% <span className="text-[11px] text-slate-400">({r.orderVisitsPeriod}/{r.visitsPeriod})</span></>}</div>
                <div className="col-span-2 lg:col-span-1 flex flex-wrap gap-1">
                  {r.tags.map(t => <span key={t} className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${(TAG_STYLE as Record<string, string>)[t]}`}>{(TAG_LABEL as Record<string, string>)[t]}</span>)}
                </div>
              </button>
            ))}
            {list.length > shown && (
              <div className="p-3 border-t border-slate-100 text-center">
                <button type="button" onClick={() => setShown(s => s + PAGE)} className="px-4 py-2 rounded-full text-xs font-semibold text-[#0D4728] hover:bg-[#0D4728]/5">Show more ({list.length - shown} left)</button>
              </div>
            )}
          </div>
          <p className="text-[11px] text-slate-400 px-1">{list.length} of {rows.length} retailers. Tap a retailer to see its full history. Hover a tag for what it means.</p>

          {/* Visits that ended without an order + territories */}
          <div className="grid lg:grid-cols-2 gap-3 sm:gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-slate-900">Why visits ended without an order</h3>
              <p className="text-[11px] text-slate-500 mb-3">Last {days} days, all retailers</p>
              {data.reasons.length === 0 ? <p className="text-xs text-slate-400 py-4">No visits without an order in this period.</p> : (
                <div className="space-y-2">
                  {data.reasons.slice(0, 10).map(x => (
                    <div key={x.reason}>
                      <div className="flex justify-between gap-2 text-xs"><span className="text-slate-700 truncate">{x.reason}</span><span className="text-slate-500 shrink-0">{x.visits} visit{x.visits === 1 ? '' : 's'} · {x.retailers} retailer{x.retailers === 1 ? '' : 's'}</span></div>
                      <div className="h-1.5 rounded-full bg-slate-100 mt-1"><div className="h-1.5 rounded-full bg-[#E4B84D]" style={{ width: `${(x.visits / maxReason) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 overflow-x-auto">
              <h3 className="text-sm font-semibold text-slate-900">Territories</h3>
              <p className="text-[11px] text-slate-500 mb-3">Last {days} days</p>
              <table className="w-full text-xs">
                <thead><tr className="text-left text-[10px] uppercase tracking-wide text-slate-500"><th className="pb-1.5 font-semibold">Territory</th><th className="pb-1.5 font-semibold text-right">Retailers</th><th className="pb-1.5 font-semibold text-right">Dormant</th><th className="pb-1.5 font-semibold text-right">Revenue</th><th className="pb-1.5 font-semibold text-right">Visits → order</th></tr></thead>
                <tbody>
                  {terr.map(t => (
                    <tr key={t.territory} className="border-t border-slate-100">
                      <td className="py-1.5 text-slate-800">{t.territory}</td>
                      <td className="py-1.5 text-right text-slate-600">{t.active}/{t.retailers}</td>
                      <td className={`py-1.5 text-right ${t.dormant ? 'text-red-600' : 'text-slate-400'}`}>{t.dormant}</td>
                      <td className="py-1.5 text-right font-medium text-slate-900">{inr(t.revenue)}</td>
                      <td className="py-1.5 text-right text-slate-600">{t.visits > 0 ? `${Math.round((t.orderVisits / t.visits) * 100)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-slate-400 mt-2">Retailers: how many ordered in the period / how many there are.</p>
            </div>
          </div>

          <button type="button" onClick={() => setShowMore(v => !v)} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
            <Info className="w-3.5 h-3.5" /> How these figures are worked out {showMore ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {showMore && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-600 space-y-1.5">
              {TAG_ORDER.map(t => <div key={t}><span className={`inline-block px-2 py-0.5 mr-2 rounded-full border text-[10px] font-semibold ${(TAG_STYLE as Record<string, string>)[t]}`}>{TAG_LABEL[t]}</span>{TAG_HELP[t]}</div>)}
              <p className="pt-1.5">Revenue and orders count every order on the Sales page; cancelled orders are not counted. Due is what is still unpaid today. “Visits → order” is the share of visits in the period that ended in an order. “vs before” compares with the same number of days just before the period. Dormant always means {DORMANT_DAYS}+ days without an order, whichever period is chosen. Removed retailers are left out.</p>
            </div>
          )}
        </>
      )}

      {openId && <RetailerHistoryDialog retailerId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
