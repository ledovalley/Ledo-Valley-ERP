'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X, RotateCcw, AlertTriangle, Info } from 'lucide-react';
import { fetchAllowanceEditData, saveAllowanceCorrection, type AllowanceEditData } from './actions';
import { dayLabel } from '@/utils/allowanceWeek';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const inr = (n: number) =>
  `${n < 0 ? '-' : ''}₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
const num = (v: string) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

type Row = { present: boolean; km: string };

/**
 * Correct one person's week, day by day (admins only).
 * The recorded shifts are never changed: a correction sits on top of them.
 * Every save is kept with who, when and why.
 */
export default function AllowanceEditDialog({ monday, userId, name, onClose, onSaved }: {
  monday: string;
  userId: string;
  name: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState<AllowanceEditData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [extra, setExtra] = useState('');
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    let live = true;
    fetchAllowanceEditData(monday, userId)
      .then(res => {
        if (!live) return;
        if ('error' in res) { setLoadError(res.error); return; }
        setData(res);
        setRows(res.days.map(d => ({ present: d.present, km: d.present ? String(d.km) : '0' })));
        setExtra(res.extra !== 0 ? String(res.extra) : '');
      })
      .catch(err => { if (live) setLoadError(err instanceof Error ? err.message : String(err)); });
    return () => { live = false; };
  }, [monday, userId]);

  // What the table says right now
  const calc = useMemo(() => {
    if (!data) return null;
    const live = rows.map((r, i) => ({ date: data.days[i].date, present: r.present, km: r.present ? Math.max(0, num(r.km)) : 0 }));
    const days = live.filter(d => d.present).length;
    const km = r2(live.reduce((t, d) => t + d.km, 0));
    const food = r2(days * data.foodRate);
    const travel = r2(km * data.kmRate);
    const ex = r2(num(extra));
    const origDays = data.days.filter(d => d.origPresent).length;
    const origKm = r2(data.days.reduce((t, d) => t + (d.origPresent ? d.origKm : 0), 0));
    const origTotal = r2(origDays * data.foodRate + r2(origKm * data.kmRate));
    return { live, days, km, food, travel, ex, total: r2(food + travel + ex), origDays, origKm, origTotal };
  }, [data, rows, extra]);

  const differsFromShifts = (i: number) => {
    if (!data) return false;
    const d = data.days[i], r = rows[i];
    return r.present !== d.origPresent || (r.present && Math.abs(num(r.km) - d.origKm) > 0.004);
  };
  const differsFromSaved = (i: number) => {
    if (!data) return false;
    const d = data.days[i], r = rows[i];
    return r.present !== d.present || (r.present && Math.abs(num(r.km) - d.km) > 0.004);
  };

  const dirty = !!data && (rows.some((_, i) => differsFromSaved(i)) || r2(num(extra)) !== data.extra);
  const hasCorrections = !!data && (rows.some((_, i) => differsFromShifts(i)) || r2(num(extra)) !== 0);
  const negative = !!calc && calc.total < 0;

  const setRow = (i: number, patch: Partial<Row>) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const close = () => {
    if (saving) return;
    if (dirty && !window.confirm('Close without saving? Your changes will be lost.')) return;
    onClose();
  };

  const resetAll = () => {
    if (!data) return;
    setRows(data.days.map(d => ({ present: d.origPresent, km: d.origPresent ? String(d.origKm) : '0' })));
    setExtra('');
  };

  const save = async () => {
    if (!data || !calc || saving) return;
    if (hasCorrections && reason.trim().length < 3) { setError('Please write a short reason for the correction.'); return; }
    if (negative) { setError('The total cannot be negative.'); return; }
    if (!password.trim()) { setError('Please enter the delete password.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await saveAllowanceCorrection(
        monday, userId,
        calc.live.filter(d => d.date <= data.today),
        calc.ex, reason.trim(), data.token, password
      );
      if ('error' in res) { setError(res.error); return; }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="bg-white w-full sm:max-w-2xl max-h-[94vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl">
        <div className="sticky top-0 bg-white z-10 flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 truncate">Edit allowance: {data?.name || name}</h3>
            <p className="text-xs text-slate-500">{data?.label || 'Loading week…'}</p>
          </div>
          <button type="button" onClick={close} className="p-2 rounded-full hover:bg-slate-100 text-slate-500" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          {loadError ? (
            <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-sm text-red-700">{loadError}</div>
          ) : !data || !calc ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : (
            <>
              <div className="flex items-start gap-2 p-3 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] sm:text-xs text-slate-600">
                <Info className="w-3.5 h-3.5 mt-px shrink-0" />
                <span>
                  Change the days or km that were entered wrongly. The recorded shifts are not changed; this only corrects the allowance.
                  Rates: food {inr(data.foodRate)} per day, travel {inr(data.kmRate)} per km.
                </span>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="grid grid-cols-[1.3fr_0.9fr_0.7fr_1.1fr] sm:grid-cols-[1.4fr_1fr_0.8fr_1.2fr] gap-2 px-3 py-2 bg-slate-50 text-[10px] sm:text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                  <span>Day</span><span>Shifts</span><span className="text-center">Present</span><span>Km</span>
                </div>
                {data.days.map((d, i) => {
                  const future = d.date > data.today;
                  const r = rows[i];
                  const changed = differsFromShifts(i);
                  return (
                    <div key={d.date} className={`grid grid-cols-[1.3fr_0.9fr_0.7fr_1.1fr] sm:grid-cols-[1.4fr_1fr_0.8fr_1.2fr] gap-2 px-3 py-2 items-center border-t border-slate-100 text-xs sm:text-sm ${future ? 'opacity-40' : ''} ${changed ? 'bg-amber-50/60' : ''}`}>
                      <span className="font-medium text-slate-800">{dayLabel(d.date)}</span>
                      <span className="text-slate-500 text-[11px] sm:text-xs">
                        {future ? 'not yet' : d.origShifts > 0 ? `${d.origShifts} shift${d.origShifts > 1 ? 's' : ''} · ${d.origKm} km` : 'no shift'}
                        {d.openShifts > 0 && <span className="block text-amber-700">{d.openShifts} still running</span>}
                      </span>
                      <span className="flex justify-center">
                        <input
                          type="checkbox"
                          checked={r?.present ?? false}
                          disabled={future || saving}
                          onChange={e => setRow(i, { present: e.target.checked, km: e.target.checked ? (r.km && r.km !== '0' ? r.km : String(d.origKm || 0)) : '0' })}
                          className="w-4 h-4 accent-[#0D4728]"
                          aria-label={`Present on ${dayLabel(d.date)}`}
                        />
                      </span>
                      <span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          value={r?.present ? r.km : ''}
                          placeholder={r?.present ? '0' : '—'}
                          disabled={future || saving || !r?.present}
                          onChange={e => setRow(i, { km: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs sm:text-sm disabled:bg-slate-50"
                          aria-label={`Km on ${dayLabel(d.date)}`}
                        />
                        {changed && (
                          <span className="block text-[10px] text-amber-700 mt-0.5">
                            was {d.origPresent ? `${d.origKm} km` : 'absent'}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>

              <label className="flex items-center justify-between gap-3 text-xs sm:text-sm text-slate-700">
                <span>
                  Other adjustment <span className="text-slate-400">(₹, optional; use − to deduct)</span>
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={extra}
                  disabled={saving}
                  onChange={e => setExtra(e.target.value)}
                  placeholder="0"
                  className="w-28 bg-white border border-slate-200 rounded-lg px-2 py-1 text-right"
                />
              </label>

              {/* Live result */}
              <div className="rounded-2xl bg-[#0D4728] text-[#FFF9CD] p-4 text-xs sm:text-sm">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <span className="opacity-80">Days present</span><span className="text-right font-mono">{calc.days}</span>
                  <span className="opacity-80">Food ({calc.days} × {inr(data.foodRate)})</span><span className="text-right font-mono">{inr(calc.food)}</span>
                  <span className="opacity-80">Travel ({calc.km} km × {inr(data.kmRate)})</span><span className="text-right font-mono">{inr(calc.travel)}</span>
                  {calc.ex !== 0 && (<><span className="opacity-80">Other adjustment</span><span className="text-right font-mono">{inr(calc.ex)}</span></>)}
                </div>
                <div className="flex justify-between font-semibold mt-1.5 pt-1.5 border-t border-white/20">
                  <span>Total to pay</span>
                  <span className="font-mono">{inr(calc.total)}</span>
                </div>
                {calc.total !== calc.origTotal && (
                  <p className="mt-2 text-[11px] opacity-80">Worked out from the shifts alone it would be {inr(calc.origTotal)}.</p>
                )}
              </div>

              {hasCorrections && (
                <label className="block text-xs sm:text-sm text-slate-700">
                  Reason for the correction <span className="text-red-600">*</span>
                  <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    rows={2}
                    maxLength={300}
                    disabled={saving}
                    placeholder="e.g. Closing odometer was typed wrongly on Tuesday"
                    className="mt-1 w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  />
                </label>
              )}

              {data.history.length > 0 && (
                <details className="text-xs text-slate-600">
                  <summary className="cursor-pointer font-semibold text-slate-700">Earlier corrections for this week ({data.history.length})</summary>
                  <ul className="mt-2 space-y-1.5">
                    {data.history.map(h => (
                      <li key={h.id} className="rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-1.5">
                        <span className="font-medium">
                          {h.date ? `${dayLabel(h.date)}: ${h.present ? `present, ${h.km} km` : 'absent'} (was ${h.origPresent ? `${h.origKm} km` : 'absent'})` : `Other adjustment ${inr(h.extra ?? 0)}`}
                        </span>
                        <span className="block text-slate-500">
                          {h.reason} · {h.createdByName || 'admin'}, {new Date(h.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                          {h.cancelledAt ? ' · replaced/reset later' : ' · in use'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <label className="block text-xs sm:text-sm text-slate-700">
                Delete password <span className="text-red-600">*</span>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="off"
                  disabled={saving}
                  placeholder="Needed to save a correction"
                  className="mt-1 w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm"
                />
              </label>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-2xl bg-red-50 border border-red-200 text-xs sm:text-sm text-red-700">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={resetAll}
                  disabled={saving || !hasCorrections}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-full border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reset to calculated
                </button>
                <div className="flex gap-2">
                  <button type="button" onClick={close} disabled={saving} className="flex-1 sm:flex-none px-4 py-2 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">Cancel</button>
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving || !dirty || negative}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2 rounded-full bg-[#0D4728] text-[#FFF9CD] text-sm font-semibold disabled:opacity-40"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save changes
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
