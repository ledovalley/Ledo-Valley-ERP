'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Wallet, Bike, Utensils, Calendar, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Download, Loader2, AlertTriangle, Users, Info, CheckCircle2, RotateCcw
} from 'lucide-react';
import { fetchWeeklyAllowances, fetchWeeklyAllowanceReport, fetchAllowanceMonthReport, markAllowanceWeekPaid, undoAllowanceWeekPaid, type AllowanceRow, type AllowancePaidInfo } from './actions';
import { buildAllowanceWorkbook, saveXlsx } from './allowanceReport';
import { addDays, dayLabel, mondayOf, todayIST } from '@/utils/allowanceWeek';

type WeekData = {
  monday: string;
  label: string;
  rows: AllowanceRow[];
  totals: { food: number; travel: number; total: number; km: number; days: number };
  weekEnded: boolean;
  paid: AllowancePaidInfo | null;
};

const inr = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
const kmText = (n: number) => `${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })} km`;

/**
 * Weekly allowance for each person (admins and managers):
 * food (days present x per-day rate) + travel (km x per-km rate).
 * A finished week can be marked as paid: its amounts are then saved and never
 * change, even if rates or shifts are changed later. Admins only.
 */
export default function WeeklyAllowances() {
  const thisMonday = mondayOf(todayIST());
  const [monday, setMonday] = useState(thisMonday);
  const [data, setData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    const req = ++requestRef.current;
    setLoading(true);
    setError('');
    fetchWeeklyAllowances(monday)
      .then(res => {
        if (req !== requestRef.current) return; // a newer week was chosen meanwhile
        if ('error' in res) { setError(res.error); return; }
        setData(res);
      })
      .catch(err => { if (req === requestRef.current) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (req === requestRef.current) setLoading(false); });
  }, [monday, reloadKey]);

  const isThisWeek = monday === thisMonday;
  const shown = data && data.monday === monday ? data : null;
  const openShifts = shown ? shown.rows.reduce((t, r) => t + r.openShifts, 0) : 0;
  const worked = shown ? shown.rows.filter(r => r.daysPresent > 0).length : 0;

  const markPaid = async () => {
    if (!shown || saving) return;
    const ok = window.confirm(
      `Mark ${shown.label} as paid?\n\n${worked} ${worked === 1 ? 'person' : 'people'}, total ₹${shown.totals.total.toLocaleString('en-IN')}.\n\n` +
      'These amounts will be saved and will not change later, even if rates or shifts are changed.'
    );
    if (!ok) return;
    setSaving(true);
    try {
      const res = await markAllowanceWeekPaid(shown.monday, shown.totals.total);
      if ('error' in res) alert(res.error);
    } catch (err) {
      alert(`Could not mark the week as paid: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
      setReloadKey(k => k + 1);
    }
  };

  const undoPaid = async () => {
    if (!shown || saving) return;
    const pw = window.prompt(`Undo "paid" for ${shown.label}?\n\nThe saved record is kept (marked cancelled), and the week shows today's figures again.\n\nEnter the delete password:`);
    if (pw === null) return;
    setSaving(true);
    try {
      const res = await undoAllowanceWeekPaid(shown.monday, pw);
      if ('error' in res) alert(res.error);
    } catch (err) {
      alert(`Could not undo: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
      setReloadKey(k => k + 1);
    }
  };

  const [downloading, setDownloading] = useState(false);

  const thisMonth = todayIST().slice(0, 7);
  const [reportMonth, setReportMonth] = useState(thisMonth);

  /** Detailed Excel report for the week on screen: Summary + one sheet per person (every shift, odometer readings, day by day). */
  const downloadReport = async () => {
    if (!shown || downloading) return;
    setDownloading(true);
    try {
      const rep = await fetchWeeklyAllowanceReport(shown.monday);
      if ('error' in rep) { alert(`Could not make the report: ${rep.error}`); return; }
      const status = rep.paid
        ? `Paid on ${new Date(rep.paid.paidAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}${rep.paid.paidByName ? ' by ' + rep.paid.paidByName : ''}. Amounts are the ones saved then.`
        : rep.weekEnded ? 'Not marked as paid yet. Amounts use the current rates.' : 'Week still going on. Amounts can still change.';
      const bytes = buildAllowanceWorkbook({
        title: 'Weekly allowance report',
        info: [
          ['Week', rep.label],
          ['Status', status],
          ...(rep.paid?.changedSincePaid ? [['Note', `Shifts or rates changed after this week was paid. Worked out today it would be Rs ${rep.paid.liveTotal}. The paid amounts are unchanged.`] as [string, string]] : [])
        ],
        personNote: rep.paid ? 'Shift details are as recorded now. The amounts in Totals are the ones saved when the week was paid.' : undefined,
        people: rep.rows.map(r => ({
          ...r,
          days: r.days.map(d => ({ date: d.date, shifts: d.shifts, km: d.km, foodRate: r.foodRate, kmRate: r.kmRate, food: r.foodRate, travel: d.km * r.kmRate }))
        })),
        shifts: rep.shifts
      });
      saveXlsx(bytes, `Weekly_Allowance_${rep.monday}.xlsx`);
    } catch (err) {
      alert(`Could not make the report: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDownloading(false);
    }
  };

  /** The same detailed report for a whole calendar month. */
  const downloadMonth = async () => {
    if (downloading || !reportMonth) return;
    setDownloading(true);
    try {
      const rep = await fetchAllowanceMonthReport(reportMonth);
      if ('error' in rep) { alert(`Could not make the report: ${rep.error}`); return; }
      if (rep.people.length === 0) { alert(`No shifts in ${rep.label}.`); return; }
      const paidWeeks = rep.weeks.filter(w => w.paid).length;
      const bytes = buildAllowanceWorkbook({
        title: 'Monthly allowance report',
        info: [
          ['Month', rep.label],
          ['Status', `${rep.monthEnded ? 'Month ended.' : 'Month still going on: amounts can still change.'} ${paidWeeks} of ${rep.weeks.length} weeks touching this month are marked as paid.`]
        ],
        people: rep.people,
        shifts: rep.shifts,
        weeks: rep.weeks,
        showPaidColumn: true
      });
      saveXlsx(bytes, `Monthly_Allowance_${rep.month}.xlsx`);
    } catch (err) {
      alert(`Could not make the report: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-[24px] sm:rounded-[28px] overflow-hidden shadow-xs flex flex-col min-h-[500px]">
      {/* Week picker */}
      <div className="p-3.5 sm:p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setMonday(addDays(monday, -7))}
            title="Previous week"
            className="p-2 rounded-full border border-slate-200 bg-white hover:bg-slate-100 text-slate-700"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-white border border-slate-200 text-xs sm:text-sm font-semibold text-slate-900 min-w-0">
            <Calendar className="w-4 h-4 text-[#0D4728] shrink-0" />
            <span className="truncate">{shown?.label ?? data?.label ?? 'Loading week…'}</span>
          </div>
          <button
            type="button"
            onClick={() => setMonday(addDays(monday, 7))}
            disabled={isThisWeek}
            title="Next week"
            className="p-2 rounded-full border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {!isThisWeek && (
            <button
              type="button"
              onClick={() => setMonday(thisMonday)}
              className="px-3 py-2 rounded-full text-xs font-semibold text-[#0D4728] hover:bg-[#0D4728]/5"
            >
              This week
            </button>
          )}
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="hidden sm:inline">Go to</span>
            <input
              type="date"
              max={todayIST()}
              onChange={e => { if (e.target.value) setMonday(mondayOf(e.target.value)); }}
              className="bg-white border border-slate-200 rounded-full px-3 py-1.5 text-xs text-slate-800"
            />
          </label>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
        </div>
        <div className="flex items-center gap-2 flex-wrap self-start lg:self-auto">
          {shown && !shown.paid && shown.weekEnded && worked > 0 && (
            <button
              type="button"
              onClick={markPaid}
              disabled={saving || loading || openShifts > 0}
              title={openShifts > 0 ? 'End the running shifts first' : 'Save these amounts for good'}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#E4B84D] text-[#0B172B] text-xs sm:text-sm font-semibold disabled:opacity-40"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Mark week as paid
            </button>
          )}
          <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white pl-3 pr-1 py-1">
            <span className="text-xs text-slate-500">Month</span>
            <input
              type="month"
              value={reportMonth}
              max={thisMonth}
              onChange={e => setReportMonth(e.target.value)}
              className="bg-transparent text-xs text-slate-800 outline-none"
              aria-label="Month for the monthly report"
            />
            <button
              type="button"
              onClick={downloadMonth}
              disabled={downloading || !reportMonth}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900 text-white text-xs font-semibold disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" /> Monthly report
            </button>
          </div>
          <button
            type="button"
            onClick={downloadReport}
            disabled={!shown || shown.rows.length === 0 || downloading}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#0D4728] text-[#FFF9CD] text-xs sm:text-sm font-semibold disabled:opacity-40"
          >
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Weekly report (Excel)
          </button>
        </div>
      </div>

      {error && (
        <div className="m-4 p-3 rounded-2xl bg-red-50 border border-red-200 text-sm text-red-700">Could not load allowances: {error}</div>
      )}

      {shown && (
        <div className="p-3.5 sm:p-5 space-y-4 flex-1">
          {shown.paid ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs sm:text-sm text-emerald-900">
              <span className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  <b>Paid</b> on {new Date(shown.paid.paidAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  {shown.paid.paidByName ? ` by ${shown.paid.paidByName}` : ''}. These are the amounts saved then; they don&apos;t change if rates or shifts change.
                  {shown.paid.changedSincePaid && (
                    <span className="block mt-1 text-amber-800">
                      Shifts or rates have changed since: worked out today this week would be {inr(shown.paid.liveTotal)}. The paid amounts above stay as they are.
                    </span>
                  )}
                </span>
              </span>
              <button type="button" onClick={undoPaid} disabled={saving} className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-300 bg-white text-emerald-900 text-xs font-semibold hover:bg-emerald-100 disabled:opacity-40">
                <RotateCcw className="w-3.5 h-3.5" /> Undo paid
              </button>
            </div>
          ) : !shown.weekEnded ? (
            <div className="flex items-start gap-2 p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-600">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <span>This week is still going on, so the figures can still change. It can be marked as paid from the Monday after.</span>
            </div>
          ) : worked > 0 ? (
            <div className="flex items-start gap-2 p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-600">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Not marked as paid yet: these figures use today&apos;s rates. Press <b>Mark week as paid</b> once you pay, to keep these amounts for good.</span>
            </div>
          ) : null}

          {/* Totals */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-2xl bg-[#0D4728] text-[#FFF9CD] p-4">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide opacity-80"><Wallet className="w-3.5 h-3.5" /> Total to pay</div>
              <div className="text-xl sm:text-2xl font-semibold font-mono mt-1">{inr(shown.totals.total)}</div>
            </div>
            <div className="rounded-2xl bg-white border border-slate-200 p-4">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500"><Utensils className="w-3.5 h-3.5" /> Food allowance</div>
              <div className="text-lg sm:text-xl font-semibold font-mono text-slate-900 mt-1">{inr(shown.totals.food)}</div>
              <div className="text-[11px] text-slate-500">{shown.totals.days} days present in all</div>
            </div>
            <div className="rounded-2xl bg-white border border-slate-200 p-4">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500"><Bike className="w-3.5 h-3.5" /> Travel allowance</div>
              <div className="text-lg sm:text-xl font-semibold font-mono text-slate-900 mt-1">{inr(shown.totals.travel)}</div>
              <div className="text-[11px] text-slate-500">{kmText(shown.totals.km)} in all</div>
            </div>
            <div className="rounded-2xl bg-white border border-slate-200 p-4">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500"><Users className="w-3.5 h-3.5" /> People</div>
              <div className="text-lg sm:text-xl font-semibold font-mono text-slate-900 mt-1">{shown.rows.filter(r => r.daysPresent > 0).length}</div>
              <div className="text-[11px] text-slate-500">worked this week</div>
            </div>
          </div>

          {openShifts > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs sm:text-sm text-amber-900">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                {openShifts} shift{openShifts > 1 ? 's are' : ' is'} still running this week. {openShifts > 1 ? 'Their' : 'Its'} day counts as present,
                but {openShifts > 1 ? 'their' : 'its'} km are added only once {openShifts > 1 ? 'they are' : 'it is'} ended. Check again before paying.
              </span>
            </div>
          )}

          {shown.rows.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-400">No shifts this week, and no one has allowance rates set.</div>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              {/* Header (wide screens) */}
              <div className="hidden md:grid grid-cols-[1.6fr_0.7fr_1fr_0.9fr_1fr_1fr_28px] gap-3 px-4 py-2.5 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                <span>Person</span>
                <span className="text-right">Days</span>
                <span className="text-right">Food</span>
                <span className="text-right">Km</span>
                <span className="text-right">Travel</span>
                <span className="text-right">Total</span>
                <span />
              </div>
              {shown.rows.map(r => {
                const isOpen = open === r.userId;
                return (
                  <div key={r.userId} className="border-t border-slate-100 first:border-t-0">
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : r.userId)}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50/70 grid grid-cols-2 md:grid-cols-[1.6fr_0.7fr_1fr_0.9fr_1fr_1fr_28px] gap-x-3 gap-y-1 items-center"
                    >
                      <span className="col-span-2 md:col-span-1 min-w-0">
                        <span className="block text-sm font-semibold text-slate-900 truncate">{r.name}</span>
                        <span className="block text-[11px] text-slate-500 capitalize">
                          {r.role || 'staff'}
                          {r.noRates && <span className="ml-1.5 text-amber-700 normal-case">· no allowance rates set</span>}
                        </span>
                      </span>
                      <span className="text-xs md:text-sm md:text-right text-slate-700"><span className="md:hidden text-slate-400">Days: </span>{r.daysPresent}</span>
                      <span className="text-xs md:text-sm md:text-right text-slate-700">
                        <span className="md:hidden text-slate-400">Food: </span>{inr(r.food)}
                        <span className="block text-[10px] text-slate-400">{r.foodRate > 0 ? `${r.daysPresent} × ${inr(r.foodRate)}` : 'no rate'}</span>
                      </span>
                      <span className="text-xs md:text-sm md:text-right text-slate-700"><span className="md:hidden text-slate-400">Km: </span>{kmText(r.km)}</span>
                      <span className="text-xs md:text-sm md:text-right text-slate-700">
                        <span className="md:hidden text-slate-400">Travel: </span>{inr(r.travel)}
                        <span className="block text-[10px] text-slate-400">{r.kmRate > 0 ? `${r.km} × ${inr(r.kmRate)}` : 'no rate'}</span>
                      </span>
                      <span className="text-sm md:text-right font-semibold font-mono text-[#0D4728]"><span className="md:hidden text-slate-400 font-sans font-normal">Total: </span>{inr(r.total)}</span>
                      <span className="hidden md:flex justify-end text-slate-400">{isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4">
                        {r.days.length === 0 ? (
                          <p className="text-xs text-slate-400">No shifts this week.</p>
                        ) : (
                          <div className="rounded-xl bg-slate-50 border border-slate-100 divide-y divide-slate-100">
                            {r.days.map(d => (
                              <div key={d.date} className="flex items-center justify-between px-3 py-2 text-xs text-slate-700">
                                <span className="font-medium">{dayLabel(d.date)}</span>
                                <span className="text-slate-500">
                                  {d.shifts} shift{d.shifts > 1 ? 's' : ''} · {kmText(d.km)}
                                  {d.openShifts > 0 && <span className="text-amber-700"> · {d.openShifts} still running</span>}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Grand total */}
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 grid grid-cols-2 md:grid-cols-[1.6fr_0.7fr_1fr_0.9fr_1fr_1fr_28px] gap-x-3 items-center text-sm font-semibold text-slate-900">
                <span className="col-span-2 md:col-span-1">Total</span>
                <span className="md:text-right"><span className="md:hidden text-slate-400 font-normal">Days: </span>{shown.totals.days}</span>
                <span className="md:text-right"><span className="md:hidden text-slate-400 font-normal">Food: </span>{inr(shown.totals.food)}</span>
                <span className="md:text-right"><span className="md:hidden text-slate-400 font-normal">Km: </span>{kmText(shown.totals.km)}</span>
                <span className="md:text-right"><span className="md:hidden text-slate-400 font-normal">Travel: </span>{inr(shown.totals.travel)}</span>
                <span className="md:text-right font-mono text-[#0D4728]"><span className="md:hidden text-slate-400 font-sans font-normal">Total: </span>{inr(shown.totals.total)}</span>
                <span />
              </div>
            </div>
          )}

          <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
            <Info className="w-3.5 h-3.5 mt-px shrink-0" />
            Food = days present × the person&apos;s Food Allowance / DA rate. Travel = km travelled × their Bike Allowance rate.
            A day counts once, however many shifts were started. Km come from the opening and closing odometer readings.
            Rates are set on the Users page. Weeks marked as paid keep the amounts saved when they were paid.
          </p>
        </div>
      )}

      {!shown && !error && (
        <div className="flex-1 flex items-center justify-center p-12 text-sm text-slate-400 gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Working out the week…
        </div>
      )}
    </div>
  );
}
