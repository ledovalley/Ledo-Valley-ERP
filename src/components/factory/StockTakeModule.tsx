"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ClipboardCheck, Search, Printer, Plus, Trash2, Eye, EyeOff, Loader2, ArrowLeft, Check, X, AlertTriangle
} from 'lucide-react';
import { LooseLot } from '@/types/factory';
import PasswordConfirmModal from '@/components/ui/PasswordConfirmModal';
import {
  fetchOpenStockTake,
  fetchStockTakeHistory,
  fetchLooseLots,
  startStockTake,
  saveStockTakeCount,
  deleteStockTakeCount,
  applyStockTake,
  cancelStockTake,
  type StockTake,
  type StockTakeCount
} from '@/app/factory/actions';

interface StockTakeModuleProps {
  looseInventory: LooseLot[];
  canManage: boolean;
  triggerToast: (msg: string, type?: 'success' | 'error') => void;
  /** Reload the whole factory screen from the database after stock is updated */
  onApplied: () => Promise<unknown> | void;
}

type Draft = { bags: string; kg: string; kgTouched: boolean; note: string };
type SaveState = 'saving' | 'saved' | 'error';

type DiffCategory = 'match' | 'excess' | 'short' | 'missing' | 'new';
type DiffRow = {
  key: string;
  category: DiffCategory;
  lotId: string | null;
  lotNumber: string;
  mark: string;
  grade: string;
  isSystemLot: boolean;
  notCounted: boolean;
  systemBags: number;
  systemKg: number;
  countedBags: number;
  countedKg: number;
  diffBags: number;
  diffKg: number;
  note: string | null;
};

const CATEGORY_LABEL: Record<DiffCategory, string> = {
  match: 'Matched',
  excess: 'Excess',
  short: 'Short',
  missing: 'Missing',
  new: 'New / unexpected lots'
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const fmtKg = (n: number) => n.toFixed(2);
const signed = (n: number, digits = 2) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${Math.abs(n).toFixed(digits)}`;
const isSystemLotId = (id: string | null) => !!id && id.startsWith('l-');

function escapeHtml(s: unknown) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** Compare counts against system stock. */
function computeDiffs(lots: LooseLot[], counts: StockTakeCount[], zeroUncounted: boolean): DiffRow[] {
  const byLot = new Map<string, StockTakeCount>();
  counts.forEach(c => { if (c.lotId) byLot.set(c.lotId, c); });
  const rows: DiffRow[] = [];

  for (const lot of lots) {
    const c = byLot.get(lot.id);
    const sysBags = Number(lot.bags) || 0;
    const sysKg = round3(Number(lot.weight) || 0);
    const isSys = isSystemLotId(lot.id);

    if (!c) {
      // Not counted: missing if the user says so, otherwise left out (stock stays as it is)
      if (zeroUncounted && (sysKg > 0 || sysBags > 0)) {
        rows.push({
          key: lot.id, category: 'missing', lotId: lot.id, lotNumber: lot.lotNumber,
          mark: lot.mark, grade: lot.grade, isSystemLot: isSys, notCounted: true,
          systemBags: isSys ? 0 : sysBags, systemKg: sysKg, countedBags: 0, countedKg: 0,
          diffBags: isSys ? 0 : -sysBags, diffKg: -sysKg, note: null
        });
      }
      continue;
    }

    const cBags = isSys ? 0 : c.countedBags;
    const cKg = round3(c.countedWeight);
    const dKg = round3(cKg - sysKg);
    const dBags = cBags - (isSys ? 0 : sysBags);
    let category: DiffCategory;
    if (dKg === 0 && dBags === 0) category = 'match';
    else if (cKg === 0 && cBags === 0) category = 'missing';
    else if (dKg > 0 || (dKg === 0 && dBags > 0)) category = 'excess';
    else category = 'short';

    rows.push({
      key: lot.id, category, lotId: lot.id, lotNumber: lot.lotNumber, mark: lot.mark, grade: lot.grade,
      isSystemLot: isSys, notCounted: false, systemBags: isSys ? 0 : sysBags, systemKg: sysKg,
      countedBags: cBags, countedKg: cKg, diffBags: dBags, diffKg: dKg, note: c.note
    });
  }

  for (const c of counts) {
    if (c.lotId) continue;
    if (c.countedWeight <= 0) continue;
    rows.push({
      key: c.id, category: 'new', lotId: null, lotNumber: c.lotNumber, mark: c.mark, grade: c.grade || '',
      isSystemLot: false, notCounted: false, systemBags: 0, systemKg: 0,
      countedBags: c.countedBags, countedKg: round3(c.countedWeight),
      diffBags: c.countedBags, diffKg: round3(c.countedWeight), note: c.note
    });
  }

  const order: DiffCategory[] = ['missing', 'short', 'excess', 'new', 'match'];
  return rows.sort((a, b) =>
    order.indexOf(a.category) - order.indexOf(b.category) ||
    a.mark.localeCompare(b.mark) || a.lotNumber.localeCompare(b.lotNumber, undefined, { numeric: true }));
}

function summarize(rows: DiffRow[]) {
  const s = { match: 0, excess: 0, short: 0, missing: 0, new: 0, excessKg: 0, shortKg: 0, missingKg: 0, newKg: 0, netKg: 0 };
  for (const r of rows) {
    s[r.category] += 1;
    if (r.category === 'excess') s.excessKg += r.diffKg;
    if (r.category === 'short') s.shortKg += -r.diffKg;
    if (r.category === 'missing') s.missingKg += r.systemKg;
    if (r.category === 'new') s.newKg += r.countedKg;
  }
  s.netKg = s.excessKg + s.newKg - s.shortKg - s.missingKg;
  return s;
}

/** Open a print window with the given body HTML. */
function printHtml(title: string, body: string) {
  const w = window.open('', '_blank');
  if (!w) {
    alert('Your browser blocked the print window. Allow pop-ups for this site and try again.');
    return;
  }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 24px; font-size: 12px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  h2 { font-size: 14px; margin: 18px 0 6px; }
  .meta { color: #555; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th, td { border: 1px solid #999; padding: 5px 6px; text-align: left; vertical-align: top; }
  th { background: #eee; font-size: 11px; text-transform: uppercase; }
  td.num, th.num { text-align: right; font-family: "Courier New", monospace; }
  td.blank { height: 26px; }
  .summary td { font-weight: bold; }
  .pos { color: #0a6b3d; } .neg { color: #b42318; }
  .sign { display: flex; justify-content: space-between; margin-top: 48px; }
  .sign div { width: 30%; border-top: 1px solid #333; padding-top: 4px; text-align: center; font-size: 11px; }
  @page { size: A4; margin: 12mm; }
  @media print { body { margin: 0; } tr { page-break-inside: avoid; } }
</style></head><body>${body}
<script>window.onload = function () { window.focus(); window.print(); };</script>
</body></html>`);
  w.document.close();
}

export default function StockTakeModule({ looseInventory, canManage, triggerToast, onApplied }: StockTakeModuleProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [take, setTake] = useState<StockTake | null>(null);
  const [counts, setCounts] = useState<StockTakeCount[]>([]);
  const countsRef = useRef<StockTakeCount[]>([]);
  useEffect(() => { countsRef.current = counts; }, [counts]);
  const [history, setHistory] = useState<StockTake[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // counting
  const [blind, setBlind] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'not_counted' | 'counted'>('all');
  const [showEmpty, setShowEmpty] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});
  const draftsRef = useRef<Record<string, Draft>>({});
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [newLot, setNewLot] = useState({ lotNumber: '', mark: '', grade: '', bags: '', weightPerBag: '', kg: '', note: '' });
  const [showNewLot, setShowNewLot] = useState(false);

  // review
  const [view, setView] = useState<'count' | 'review'>('count');
  const [snapshot, setSnapshot] = useState<LooseLot[] | null>(null);
  const [zeroUncounted, setZeroUncounted] = useState(true);
  const [confirmApply, setConfirmApply] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [lastResult, setLastResult] = useState<{ rows: DiffRow[]; take: StockTake; appliedAt: string } | null>(null);

  // -------------------------------------------------------------------------
  // Load
  // -------------------------------------------------------------------------
  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [open, hist] = await Promise.all([fetchOpenStockTake(), fetchStockTakeHistory(10)]);
      if ('error' in open) throw new Error(open.error);
      setTake(open.take);
      setCounts(open.counts);
      if ('takes' in hist) setHistory(hist.takes);
      const d: Record<string, Draft> = {};
      open.counts.forEach(c => {
        if (c.lotId) d[c.lotId] = { bags: String(c.countedBags), kg: String(c.countedWeight), kgTouched: true, note: c.note || '' };
      });
      draftsRef.current = d;
      setDrafts(d);
      setSaveState({});
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load the stock take.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    return () => { Object.values(timersRef.current).forEach(t => clearTimeout(t)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const countsByLot = useMemo(() => {
    const m = new Map<string, StockTakeCount>();
    counts.forEach(c => { if (c.lotId) m.set(c.lotId, c); });
    return m;
  }, [counts]);
  const newLotCounts = useMemo(() => counts.filter(c => !c.lotId), [counts]);

  // -------------------------------------------------------------------------
  // Counting
  // -------------------------------------------------------------------------
  const lotById = useMemo(() => new Map(looseInventory.map(l => [l.id, l])), [looseInventory]);

  // Saves still running, and lots whose last save failed (read after awaiting, unlike state)
  const inflightRef = useRef<Record<string, Promise<void>>>({});
  const failedRef = useRef<Set<string>>(new Set());
  const runSave = (lotId: string) => {
    const p = saveLot(lotId).finally(() => {
      if (inflightRef.current[lotId] === p) delete inflightRef.current[lotId];
    });
    inflightRef.current[lotId] = p;
    return p;
  };

  const saveLot = async (lotId: string) => {
    if (!take) return;
    const d = draftsRef.current[lotId];
    const lot = lotById.get(lotId);
    if (!d || !lot) return;
    const isSys = isSystemLotId(lotId);

    // Both fields cleared = remove the count (back to "not counted")
    if (d.bags.trim() === '' && d.kg.trim() === '') {
      // read the latest counts (this can run from a delayed save)
      const existing = countsRef.current.find(c => c.lotId === lotId);
      if (!existing) {
        failedRef.current.delete(lotId); setSaveState(s => { const n = { ...s }; delete n[lotId]; return n; });
        return;
      }
      setSaveState(s => ({ ...s, [lotId]: 'saving' }));
      const res = await deleteStockTakeCount(take.id, existing.id);
      if ('error' in res) {
        failedRef.current.add(lotId); setSaveState(s => ({ ...s, [lotId]: 'error' }));
        triggerToast(res.error, 'error');
        return;
      }
      setCounts(prev => prev.filter(c => c.id !== existing.id));
      failedRef.current.delete(lotId); setSaveState(s => { const n = { ...s }; delete n[lotId]; return n; });
      return;
    }

    const bags = isSys ? 0 : parseInt(d.bags || '0', 10);
    const kg = parseFloat(d.kg || '0');
    if ((!isSys && (!Number.isInteger(bags) || bags < 0)) || !Number.isFinite(kg) || kg < 0) {
      failedRef.current.add(lotId); setSaveState(s => ({ ...s, [lotId]: 'error' }));
      return;
    }

    setSaveState(s => ({ ...s, [lotId]: 'saving' }));
    const res = await saveStockTakeCount(take.id, {
      lotId,
      lotNumber: lot.lotNumber,
      mark: lot.mark,
      grade: lot.grade,
      countedBags: bags,
      weightPerBag: lot.weightPerBag,
      countedWeight: kg,
      note: d.note
    });
    if ('error' in res) {
      failedRef.current.add(lotId); setSaveState(s => ({ ...s, [lotId]: 'error' }));
      triggerToast(res.error, 'error');
      return;
    }
    const saved = res.count;
    setCounts(prev => [...prev.filter(c => c.lotId !== lotId), saved]);
    failedRef.current.delete(lotId); setSaveState(s => ({ ...s, [lotId]: 'saved' }));
  };

  const scheduleSave = (lotId: string) => {
    if (timersRef.current[lotId]) clearTimeout(timersRef.current[lotId]);
    timersRef.current[lotId] = setTimeout(() => {
      delete timersRef.current[lotId];
      runSave(lotId);
    }, 900);
  };

  /** Saves everything typed so far, waits for saves already running, and
   *  returns false if any count is not saved. */
  const flushSaves = async () => {
    const pending = Object.keys(timersRef.current);
    pending.forEach(id => clearTimeout(timersRef.current[id]));
    timersRef.current = {};
    pending.forEach(id => runSave(id));
    await Promise.all(Object.values(inflightRef.current));
    return failedRef.current.size === 0;
  };

  const updateDraft = (lot: LooseLot, field: 'bags' | 'kg' | 'note', value: string) => {
    const prev = draftsRef.current[lot.id] || { bags: '', kg: '', kgTouched: false, note: '' };
    const next: Draft = { ...prev, [field]: value };
    if (field === 'kg') next.kgTouched = value.trim() !== '';
    // Weight follows bags x weight per bag until the user types a weight themselves
    if (field === 'bags' && !isSystemLotId(lot.id) && !prev.kgTouched) {
      const b = parseInt(value, 10);
      next.kg = value.trim() === '' ? '' : Number.isFinite(b) ? String(round3(b * (Number(lot.weightPerBag) || 0))) : prev.kg;
    }
    draftsRef.current = { ...draftsRef.current, [lot.id]: next };
    setDrafts(draftsRef.current);
    setSaveState(s => ({ ...s, [lot.id]: 'saving' }));
    scheduleSave(lot.id);
  };

  const clearLot = (lot: LooseLot) => {
    draftsRef.current = { ...draftsRef.current, [lot.id]: { bags: '', kg: '', kgTouched: false, note: '' } };
    setDrafts(draftsRef.current);
    if (timersRef.current[lot.id]) clearTimeout(timersRef.current[lot.id]);
    delete timersRef.current[lot.id];
    runSave(lot.id);
  };

  const addNewLot = async () => {
    if (!take) return;
    const lotNumber = newLot.lotNumber.trim();
    const mark = newLot.mark.trim();
    if (!lotNumber || !mark) return triggerToast('Lot number and mark are required.', 'error');
    const bags = parseInt(newLot.bags || '0', 10);
    const wpb = parseFloat(newLot.weightPerBag || '0');
    const kg = newLot.kg.trim() !== '' ? parseFloat(newLot.kg) : bags * wpb;
    if (!Number.isFinite(kg) || kg <= 0) return triggerToast('Enter the bags and weight per bag, or the total kg.', 'error');

    // Already in the system (even if empty)? Count it against that lot instead.
    const existing = looseInventory.find(l =>
      l.lotNumber.trim().toLowerCase() === lotNumber.toLowerCase() && l.mark.trim().toLowerCase() === mark.toLowerCase());
    if (existing) {
      draftsRef.current = {
        ...draftsRef.current,
        [existing.id]: { bags: String(bags || 0), kg: String(round3(kg)), kgTouched: true, note: newLot.note }
      };
      setDrafts(draftsRef.current);
      await saveLot(existing.id);
      setShowEmpty(true);
      setSearch(lotNumber);
      triggerToast(`Lot ${lotNumber} (${mark}) is already in the system, so it was counted against that lot.`);
      setNewLot({ lotNumber: '', mark: '', grade: '', bags: '', weightPerBag: '', kg: '', note: '' });
      setShowNewLot(false);
      return;
    }

    setBusy(true);
    const res = await saveStockTakeCount(take.id, {
      lotId: null, lotNumber, mark, grade: newLot.grade, countedBags: bags || 0,
      weightPerBag: Number.isFinite(wpb) && wpb > 0 ? wpb : null, countedWeight: round3(kg), note: newLot.note
    });
    setBusy(false);
    if ('error' in res) return triggerToast(res.error, 'error');
    setCounts(prev => [...prev, res.count]);
    setNewLot({ lotNumber: '', mark: '', grade: '', bags: '', weightPerBag: '', kg: '', note: '' });
    setShowNewLot(false);
    triggerToast(`Added found lot ${lotNumber} (${mark}).`);
  };

  const removeNewLot = async (c: StockTakeCount) => {
    if (!take) return;
    if (!window.confirm(`Remove found lot ${c.lotNumber} (${c.mark}) from this count?`)) return;
    const res = await deleteStockTakeCount(take.id, c.id);
    if ('error' in res) return triggerToast(res.error, 'error');
    setCounts(prev => prev.filter(x => x.id !== c.id));
  };

  // Lots shown on the count screen
  const countRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return looseInventory
      .filter(l => showEmpty || l.weight > 0 || l.bags > 0 || countsByLot.has(l.id))
      .filter(l => {
        if (filter === 'counted') return countsByLot.has(l.id);
        if (filter === 'not_counted') return !countsByLot.has(l.id);
        return true;
      })
      .filter(l => !q ||
        l.lotNumber.toLowerCase().includes(q) || l.mark.toLowerCase().includes(q) ||
        (l.grade || '').toLowerCase().includes(q) || (l.labels || []).some(x => x.toLowerCase().includes(q)))
      .sort((a, b) =>
        Number(isSystemLotId(b.id)) - Number(isSystemLotId(a.id)) ||
        a.mark.localeCompare(b.mark) || a.lotNumber.localeCompare(b.lotNumber, undefined, { numeric: true }));
  }, [looseInventory, search, filter, showEmpty, countsByLot]);

  const lotsWithStock = looseInventory.filter(l => l.weight > 0 || l.bags > 0);
  const countedWithStock = lotsWithStock.filter(l => countsByLot.has(l.id)).length;
  const pendingSaves = Object.values(saveState).some(s => s === 'saving');
  const failedSaves = Object.values(saveState).some(s => s === 'error');

  // -------------------------------------------------------------------------
  // Start / review / apply / cancel
  // -------------------------------------------------------------------------
  const handleStart = async () => {
    setBusy(true);
    const res = await startStockTake(note);
    setBusy(false);
    if ('error' in res) return triggerToast(res.error, 'error');
    setNote('');
    setLastResult(null);
    await load();
    triggerToast('Stock take started. Enter the physical count for each lot.');
  };

  const openReview = async () => {
    setBusy(true);
    // Never review with a count that didn't save: it would count as "not counted"
    // and could be set to zero.
    if (!(await flushSaves())) {
      setBusy(false);
      triggerToast('Some counts could not be saved (marked in red). Fix or re-enter them, then review again.', 'error');
      return;
    }
    try {
      // Fresh system figures from the database: these are what the update will check against
      const fresh = await fetchLooseLots();
      setSnapshot(fresh);
      setView('review');
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : 'Could not load current stock.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const diffRows = useMemo(
    () => (snapshot ? computeDiffs(snapshot, counts, zeroUncounted) : []),
    [snapshot, counts, zeroUncounted]
  );
  const summary = useMemo(() => summarize(diffRows), [diffRows]);
  // Lots with stock that nobody counted (shown whether or not they will be zeroed)
  const notCountedRows = useMemo(() => {
    if (!snapshot) return [] as LooseLot[];
    const counted = new Set(counts.filter(c => c.lotId).map(c => c.lotId as string));
    return snapshot.filter(l => (l.weight > 0 || l.bags > 0) && !counted.has(l.id));
  }, [snapshot, counts]);

  const handleApply = async () => {
    if (!take || !snapshot) return;
    if (failedRef.current.size > 0 || Object.keys(inflightRef.current).length > 0) {
      triggerToast('Some counts are not saved yet. Go back, fix the counts marked in red, and review again.', 'error');
      return;
    }
    setBusy(true);
    const res = await applyStockTake(
      take.id,
      snapshot.map(l => ({ lotId: l.id, bags: l.bags, weight: l.weight })),
      zeroUncounted
    );
    setBusy(false);
    setConfirmApply(false);
    if ('error' in res) {
      triggerToast(res.error, 'error');
      return;
    }
    setLastResult({ rows: diffRows, take, appliedAt: new Date().toISOString() });
    triggerToast('Stock updated to match the physical count.');
    await onApplied();
    setView('count');
    setSnapshot(null);
    await load();
  };

  const handleCancel = () => {
    if (take) setConfirmCancel(true);
  };

  /** Runs from the delete-password dialog. Returns an error to show there, or null when done. */
  const doCancel = async (password: string): Promise<string | null> => {
    if (!take) return null;
    setBusy(true);
    const res = await cancelStockTake(take.id, password);
    setBusy(false);
    if ('error' in res) return res.error;
    setView('count');
    setSnapshot(null);
    await load();
    triggerToast('Stock take cancelled. No stock was changed.');
    return null;
  };

  // -------------------------------------------------------------------------
  // Printing
  // -------------------------------------------------------------------------
  const printCountSheet = () => {
    const lots = looseInventory
      .filter(l => l.weight > 0 || l.bags > 0 || showEmpty)
      .sort((a, b) =>
        Number(isSystemLotId(b.id)) - Number(isSystemLotId(a.id)) ||
        a.mark.localeCompare(b.mark) || a.lotNumber.localeCompare(b.lotNumber, undefined, { numeric: true }));
    const showSystem = !blind;
    const head = `<tr><th>#</th><th>Mark</th><th>Lot No.</th><th>Grade</th><th class="num">Kg/bag</th>
      ${showSystem ? '<th class="num">System bags</th><th class="num">System kg</th>' : ''}
      <th class="num" style="width:13%">Counted bags</th><th class="num" style="width:13%">Counted kg</th><th style="width:20%">Remarks</th></tr>`;
    const body = lots.map((l, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(l.mark)}</td><td>${escapeHtml(l.lotNumber)}</td>
      <td>${escapeHtml(l.grade)}</td><td class="num">${isSystemLotId(l.id) ? '-' : escapeHtml(l.weightPerBag)}</td>
      ${showSystem ? `<td class="num">${isSystemLotId(l.id) ? '-' : l.bags}</td><td class="num">${fmtKg(l.weight)}</td>` : ''}
      <td class="blank">${isSystemLotId(l.id) ? '<span style="color:#999">kg only</span>' : ''}</td><td class="blank"></td><td class="blank"></td></tr>`).join('');
    const extra = Array.from({ length: 8 }).map(() =>
      `<tr><td class="blank"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join('');
    printHtml('Stock count sheet', `
      <h1>Ledo Valley - Physical Stock Count Sheet</h1>
      <div class="meta">Printed ${escapeHtml(new Date().toLocaleString())}${take ? ` &middot; Stock take started ${escapeHtml(new Date(take.startedAt).toLocaleDateString())}` : ''} &middot; ${lots.length} lots${showSystem ? '' : ' &middot; blind count (system figures hidden)'}</div>
      <table><thead>${head}</thead><tbody>${body}</tbody></table>
      <h2>Lots found that are not on this list</h2>
      <table><thead><tr><th>Mark</th><th>Lot No.</th><th>Grade</th><th class="num">Kg/bag</th><th class="num">Bags</th><th class="num">Kg</th><th>Location</th><th>Remarks</th></tr></thead><tbody>${extra}</tbody></table>
      <div class="sign"><div>Counted by</div><div>Checked by</div><div>Date</div></div>`);
  };

  const printResults = (rows: DiffRow[], heading: string, takeInfo: StockTake | null, statusLine: string) => {
    const s = summarize(rows);
    const section = (cat: DiffCategory) => {
      const list = rows.filter(r => r.category === cat);
      if (list.length === 0) return '';
      return `<h2>${escapeHtml(CATEGORY_LABEL[cat])} (${list.length})</h2>
        <table><thead><tr><th>Mark</th><th>Lot No.</th><th>Grade</th><th class="num">System bags</th><th class="num">System kg</th>
        <th class="num">Counted bags</th><th class="num">Counted kg</th><th class="num">Diff bags</th><th class="num">Diff kg</th><th>Remarks</th></tr></thead><tbody>
        ${list.map(r => `<tr><td>${escapeHtml(r.mark)}</td><td>${escapeHtml(r.lotNumber)}</td><td>${escapeHtml(r.grade)}</td>
          <td class="num">${r.isSystemLot || r.category === 'new' ? '-' : r.systemBags}</td><td class="num">${r.category === 'new' ? '-' : fmtKg(r.systemKg)}</td>
          <td class="num">${r.isSystemLot ? '-' : r.countedBags}</td><td class="num">${fmtKg(r.countedKg)}</td>
          <td class="num ${r.diffBags > 0 ? 'pos' : r.diffBags < 0 ? 'neg' : ''}">${r.isSystemLot ? '-' : signed(r.diffBags, 0)}</td>
          <td class="num ${r.diffKg > 0 ? 'pos' : r.diffKg < 0 ? 'neg' : ''}">${signed(r.diffKg)}</td>
          <td>${escapeHtml([r.notCounted ? 'Not counted' : '', r.note || ''].filter(Boolean).join(' - '))}</td></tr>`).join('')}
        </tbody></table>`;
    };
    printHtml('Stock take results', `
      <h1>Ledo Valley - ${escapeHtml(heading)}</h1>
      <div class="meta">${takeInfo ? `Started ${escapeHtml(new Date(takeInfo.startedAt).toLocaleString())} by ${escapeHtml(takeInfo.startedByName || '-')}${takeInfo.note ? ` &middot; ${escapeHtml(takeInfo.note)}` : ''} &middot; ` : ''}${escapeHtml(statusLine)} &middot; printed ${escapeHtml(new Date().toLocaleString())}</div>
      <table class="summary"><tbody>
        <tr><td>Matched</td><td class="num">${s.match}</td><td>Excess</td><td class="num">${s.excess} (${signed(s.excessKg)} kg)</td><td>Short</td><td class="num">${s.short} (${signed(-s.shortKg)} kg)</td></tr>
        <tr><td>Missing</td><td class="num">${s.missing} (${signed(-s.missingKg)} kg)</td><td>New lots</td><td class="num">${s.new} (${signed(s.newKg)} kg)</td><td>Net change</td><td class="num">${signed(s.netKg)} kg</td></tr>
      </tbody></table>
      ${(['missing', 'short', 'excess', 'new', 'match'] as DiffCategory[]).map(section).join('')}
      <div class="sign"><div>Counted by</div><div>Verified by</div><div>Approved by</div></div>`);
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const card = 'bg-white rounded-2xl border border-[#0B172B]/8 p-4 sm:p-6 shadow-[0_10px_30px_rgba(11,23,43,0.04)] font-sans';
  const input = 'w-full px-3 py-2 border border-[#0B172B]/10 rounded-xl bg-white focus:ring-2 focus:ring-[#009965]/30 outline-none text-sm text-[#0B172B]';

  if (!canManage) {
    return <div className={card}><p className="text-sm text-[#0B172B]/60">Only admins and managers can run a stock take.</p></div>;
  }

  if (loading) {
    return <div className={`${card} flex items-center gap-2 text-sm text-[#0B172B]/60`}><Loader2 size={16} className="animate-spin" /> Loading stock take…</div>;
  }

  if (loadError) {
    return (
      <div className={card}>
        <p className="text-sm text-rose-600 mb-3">Could not load the stock take: {loadError}</p>
        <button onClick={load} className="px-4 py-2 bg-[#0B172B] text-white rounded-xl text-sm font-bold">Try again</button>
      </div>
    );
  }

  // ---------- No stock take open ----------
  if (!take) {
    return (
      <div className={card}>
        <div className="flex items-start gap-3 mb-5">
          <ClipboardCheck className="text-[#009965] shrink-0" size={28} />
          <div>
            <h2 className="text-xl font-bold text-[#0B172B]">Stock Take</h2>
            <p className="text-sm text-[#0B172B]/60 mt-1">
              Count the loose tea physically whenever you need to. The app compares your count with the system and shows
              excess, short, missing and unexpected lots, then updates stock to match in one click.
            </p>
          </div>
        </div>

        {lastResult && (
          <div className="mb-5 bg-[#009965]/5 border border-[#009965]/20 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-sm text-[#004825] font-semibold">
              Stock updated to match the physical count ({summarize(lastResult.rows).netKg >= 0 ? '+' : ''}{fmtKg(summarize(lastResult.rows).netKg)} kg net).
            </div>
            <button
              onClick={() => printResults(lastResult.rows, 'Stock Take Results', lastResult.take, `Stock updated ${new Date(lastResult.appliedAt).toLocaleString()}`)}
              className="px-4 py-2 bg-white border border-[#0B172B]/10 rounded-xl text-sm font-bold text-[#0B172B] flex items-center gap-2 hover:bg-[#F0F5F9]"
            >
              <Printer size={15} /> Print results
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <input className={input} placeholder="Note (optional), e.g. Godown 2, year-end count" value={note} onChange={e => setNote(e.target.value)} />
          <button
            onClick={handleStart}
            disabled={busy}
            className="px-5 py-2.5 bg-[#0B172B] hover:bg-[#009965] disabled:opacity-60 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shrink-0"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />} Start stock take
          </button>
        </div>

        <h3 className="font-bold text-[#0B172B] text-sm mb-2">Previous stock takes</h3>
        {history.length === 0 ? (
          <p className="text-sm text-[#0B172B]/40 italic">None yet.</p>
        ) : (
          <div className="overflow-x-auto border border-[#0B172B]/8 rounded-xl">
            <table className="w-full min-w-[640px] text-xs text-left">
              <thead className="bg-[#F0F5F9]"><tr>
                <th className="p-3 font-bold text-[#0B172B]/55 uppercase">Started</th>
                <th className="p-3 font-bold text-[#0B172B]/55 uppercase">Status</th>
                <th className="p-3 font-bold text-[#0B172B]/55 uppercase">Result</th>
                <th className="p-3 font-bold text-[#0B172B]/55 uppercase text-right">Net kg</th>
              </tr></thead>
              <tbody className="divide-y divide-[#0B172B]/5">
                {history.map(h => (
                  <tr key={h.id}>
                    <td className="p-3">
                      <div className="font-semibold text-[#0B172B]">{new Date(h.startedAt).toLocaleString()}</div>
                      <div className="text-[#0B172B]/50">{h.startedByName}{h.note ? ` • ${h.note}` : ''}</div>
                    </td>
                    <td className="p-3">{h.status === 'APPLIED' ? `Applied by ${h.closedByName || '-'}` : 'Cancelled'}</td>
                    <td className="p-3 text-[#0B172B]/70">
                      {h.status === 'APPLIED' && h.summary
                        ? `${h.summary.match ?? 0} matched, ${h.summary.excess ?? 0} excess, ${h.summary.short ?? 0} short, ${h.summary.missing ?? 0} missing, ${h.summary.new ?? 0} new`
                        : '-'}
                    </td>
                    <td className="p-3 text-right font-mono font-bold">{h.status === 'APPLIED' && h.summary ? signed(Number(h.summary.netKg) || 0) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ---------- Review ----------
  if (view === 'review' && snapshot) {
    const groups: DiffCategory[] = ['missing', 'short', 'excess', 'new', 'match'];
    return (
      <div className={card}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <button onClick={() => setView('count')} className="text-xs font-bold text-[#0B172B]/55 hover:text-[#0B172B] flex items-center gap-1 mb-1">
              <ArrowLeft size={14} /> Back to counting
            </button>
            <h2 className="text-xl font-bold text-[#0B172B]">Review Differences</h2>
            <p className="text-xs text-[#0B172B]/55 mt-0.5">Compared with system stock as of {new Date().toLocaleTimeString()}.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => printResults(diffRows, 'Stock Take Differences (before update)', take, 'Not applied yet')}
              className="px-4 py-2.5 bg-white border border-[#0B172B]/10 rounded-xl text-sm font-bold text-[#0B172B] flex items-center gap-2 hover:bg-[#F0F5F9]"
            >
              <Printer size={15} /> Print
            </button>
            <button
              onClick={() => setConfirmApply(true)}
              disabled={busy}
              className="px-5 py-2.5 bg-[#009965] hover:bg-[#004825] disabled:opacity-60 text-white rounded-xl text-sm font-bold flex items-center gap-2"
            >
              <Check size={16} /> Update stock to match count
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
          {[
            { label: 'Matched', value: `${summary.match}`, tone: 'text-[#0B172B]' },
            { label: 'Excess', value: `${summary.excess} • ${signed(summary.excessKg)} kg`, tone: 'text-[#009965]' },
            { label: 'Short', value: `${summary.short} • ${signed(-summary.shortKg)} kg`, tone: 'text-rose-600' },
            { label: 'Missing', value: `${summary.missing} • ${signed(-summary.missingKg)} kg`, tone: 'text-rose-600' },
            { label: 'New lots', value: `${summary.new} • ${signed(summary.newKg)} kg`, tone: 'text-purple-700' },
            { label: 'Net change', value: `${signed(summary.netKg)} kg`, tone: summary.netKg < 0 ? 'text-rose-600' : 'text-[#009965]' }
          ].map(k => (
            <div key={k.label} className="bg-[#F0F5F9]/50 border border-[#0B172B]/5 rounded-xl p-3">
              <div className="text-[10px] uppercase font-bold tracking-wider text-[#0B172B]/50">{k.label}</div>
              <div className={`text-sm font-bold font-mono mt-1 ${k.tone}`}>{k.value}</div>
            </div>
          ))}
        </div>

        <label className="flex items-start gap-2 text-sm text-[#0B172B] bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5">
          <input type="checkbox" className="mt-0.5" checked={zeroUncounted} onChange={e => setZeroUncounted(e.target.checked)} />
          <span>
            <b>Treat lots that were not counted as missing</b> (set them to zero).
            {notCountedRows.length > 0 && (
              <span className="text-amber-800"> {notCountedRows.length} lot(s) with {fmtKg(notCountedRows.reduce((s, l) => s + l.weight, 0))} kg were not counted.</span>
            )}
            <span className="block text-xs text-[#0B172B]/55 mt-0.5">Untick this if you only counted part of the stock: uncounted lots are then left as they are.</span>
          </span>
        </label>

        {groups.map(cat => {
          const list = diffRows.filter(r => r.category === cat);
          if (list.length === 0) return null;
          return (
            <div key={cat} className="mb-5">
              <h3 className={`font-bold text-sm mb-2 ${cat === 'missing' || cat === 'short' ? 'text-rose-600' : cat === 'excess' ? 'text-[#009965]' : cat === 'new' ? 'text-purple-700' : 'text-[#0B172B]'}`}>
                {CATEGORY_LABEL[cat]} ({list.length})
              </h3>
              <div className="overflow-x-auto border border-[#0B172B]/8 rounded-xl">
                <table className="w-full min-w-[760px] text-xs text-left">
                  <thead className="bg-[#F0F5F9]"><tr>
                    <th className="p-2.5 font-bold text-[#0B172B]/55 uppercase">Mark / Lot</th>
                    <th className="p-2.5 font-bold text-[#0B172B]/55 uppercase text-right">System</th>
                    <th className="p-2.5 font-bold text-[#0B172B]/55 uppercase text-right">Counted</th>
                    <th className="p-2.5 font-bold text-[#0B172B]/55 uppercase text-right">Difference</th>
                    <th className="p-2.5 font-bold text-[#0B172B]/55 uppercase">Remarks</th>
                  </tr></thead>
                  <tbody className="divide-y divide-[#0B172B]/5">
                    {list.map(r => (
                      <tr key={r.key}>
                        <td className="p-2.5">
                          <div className="font-bold text-[#0B172B]">{r.mark}</div>
                          <div className="text-[#0B172B]/55">Lot {r.lotNumber}{r.grade ? ` • ${r.grade}` : ''}</div>
                        </td>
                        <td className="p-2.5 text-right font-mono">{r.category === 'new' ? '-' : `${r.isSystemLot ? '' : `${r.systemBags} bags • `}${fmtKg(r.systemKg)} kg`}</td>
                        <td className="p-2.5 text-right font-mono">{r.isSystemLot ? '' : `${r.countedBags} bags • `}{fmtKg(r.countedKg)} kg</td>
                        <td className={`p-2.5 text-right font-mono font-bold ${r.diffKg > 0 ? 'text-[#009965]' : r.diffKg < 0 ? 'text-rose-600' : 'text-[#0B172B]/50'}`}>
                          {r.isSystemLot ? '' : `${signed(r.diffBags, 0)} bags • `}{signed(r.diffKg)} kg
                        </td>
                        <td className="p-2.5 text-[#0B172B]/60">{[r.notCounted ? 'Not counted' : '', r.note || ''].filter(Boolean).join(' • ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {confirmApply && (
          <div className="fixed inset-0 z-50 bg-[#0B172B]/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-[#0B172B] flex items-center gap-2"><AlertTriangle size={20} className="text-amber-500" /> Update stock to the physical count?</h3>
              <ul className="text-sm text-[#0B172B]/80 mt-4 space-y-1.5">
                <li>• {summary.excess} lot(s) increased: <b className="text-[#009965]">{signed(summary.excessKg)} kg</b></li>
                <li>• {summary.short} lot(s) reduced: <b className="text-rose-600">{signed(-summary.shortKg)} kg</b></li>
                <li>• {summary.missing} lot(s) set to zero{zeroUncounted && notCountedRows.length ? ` (incl. ${notCountedRows.length} not counted)` : ''}: <b className="text-rose-600">{signed(-summary.missingKg)} kg</b></li>
                <li>• {summary.new} new lot(s) created: <b className="text-purple-700">{signed(summary.newKg)} kg</b></li>
                <li className="pt-1 font-bold">Net change: {signed(summary.netKg)} kg</li>
              </ul>
              <p className="text-xs text-[#0B172B]/55 mt-4">
                Every change is recorded in History as a stock correction. If any lot changed after this review (for example a blend was made), nothing is updated and you'll be asked to review again.
              </p>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setConfirmApply(false)} className="px-4 py-2 text-sm font-bold text-[#0B172B]/60">Go back</button>
                <button onClick={handleApply} disabled={busy} className="px-5 py-2.5 bg-[#009965] hover:bg-[#004825] disabled:opacity-60 text-white rounded-xl text-sm font-bold flex items-center gap-2">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Update stock
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------- Counting ----------
  return (
    <div className={card}>
      <PasswordConfirmModal
        isOpen={confirmCancel}
        title="Cancel stock take?"
        message="All counts entered so far are discarded. No stock is changed."
        confirmText="Cancel stock take"
        onConfirm={doCancel}
        onClose={() => setConfirmCancel(false)}
      />
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-bold text-[#0B172B] flex items-center gap-2"><ClipboardCheck size={20} className="text-[#009965]" /> Stock Take in Progress</h2>
          <p className="text-xs text-[#0B172B]/55 mt-0.5">
            Started {new Date(take.startedAt).toLocaleString()} by {take.startedByName || '-'}{take.note ? ` • ${take.note}` : ''} •
            Counted {countedWithStock} of {lotsWithStock.length} lots with stock{newLotCounts.length ? ` • ${newLotCounts.length} found lot(s)` : ''}
            {pendingSaves ? ' • Saving…' : failedSaves ? ' • Some counts not saved' : ' • All counts saved'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={printCountSheet} className="px-4 py-2.5 bg-white border border-[#0B172B]/10 rounded-xl text-sm font-bold text-[#0B172B] flex items-center gap-2 hover:bg-[#F0F5F9]">
            <Printer size={15} /> Print count sheet
          </button>
          <button onClick={handleCancel} disabled={busy} className="px-4 py-2.5 bg-white border border-rose-200 text-rose-600 rounded-xl text-sm font-bold hover:bg-rose-50 disabled:opacity-60">
            Cancel stock take
          </button>
          <button
            onClick={openReview}
            disabled={busy || failedSaves}
            title={failedSaves ? 'Fix the counts marked in red first' : ''}
            className="px-5 py-2.5 bg-[#0B172B] hover:bg-[#009965] disabled:opacity-60 text-white rounded-xl text-sm font-bold flex items-center gap-2"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Review differences
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0B172B]/40" size={15} />
          <input className={`${input} pl-9`} placeholder="Search lot, mark, grade or label…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value as typeof filter)} className="py-2 px-3 text-xs border border-[#0B172B]/10 rounded-xl bg-white text-[#0B172B]/80 font-medium">
          <option value="all">All lots</option>
          <option value="not_counted">Not counted yet</option>
          <option value="counted">Counted</option>
        </select>
        <label className="text-xs font-semibold text-[#0B172B]/70 flex items-center gap-1.5">
          <input type="checkbox" checked={showEmpty} onChange={e => setShowEmpty(e.target.checked)} /> Show empty lots
        </label>
        <button onClick={() => setBlind(b => !b)} className="text-xs font-bold text-[#0B172B]/70 flex items-center gap-1.5 px-3 py-2 border border-[#0B172B]/10 rounded-xl bg-white">
          {blind ? <><EyeOff size={14} /> System figures hidden</> : <><Eye size={14} /> System figures shown</>}
        </button>
        <button onClick={() => setShowNewLot(v => !v)} className="text-xs font-bold text-purple-700 flex items-center gap-1.5 px-3 py-2 border border-purple-200 rounded-xl bg-purple-50">
          <Plus size={14} /> Lot not in list
        </button>
      </div>

      {showNewLot && (
        <div className="mb-4 p-4 border border-purple-200 bg-purple-50/50 rounded-xl">
          <div className="text-sm font-bold text-purple-800 mb-3">Lot found that isn't in the system</div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
            <input className={input} placeholder="Lot no. *" value={newLot.lotNumber} onChange={e => setNewLot({ ...newLot, lotNumber: e.target.value })} />
            <input className={input} placeholder="Mark *" value={newLot.mark} onChange={e => setNewLot({ ...newLot, mark: e.target.value })} />
            <input className={input} placeholder="Grade" value={newLot.grade} onChange={e => setNewLot({ ...newLot, grade: e.target.value })} />
            <input className={input} type="number" min="0" placeholder="Bags" value={newLot.bags} onChange={e => setNewLot({ ...newLot, bags: e.target.value })} />
            <input className={input} type="number" min="0" step="0.01" placeholder="Kg / bag" value={newLot.weightPerBag} onChange={e => setNewLot({ ...newLot, weightPerBag: e.target.value })} />
            <input className={input} type="number" min="0" step="0.01" placeholder={`Kg (${round3((parseInt(newLot.bags) || 0) * (parseFloat(newLot.weightPerBag) || 0))})`} value={newLot.kg} onChange={e => setNewLot({ ...newLot, kg: e.target.value })} />
            <input className={input} placeholder="Remarks" value={newLot.note} onChange={e => setNewLot({ ...newLot, note: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => setShowNewLot(false)} className="px-4 py-2 text-xs font-bold text-[#0B172B]/60">Cancel</button>
            <button onClick={addNewLot} disabled={busy} className="px-4 py-2 bg-purple-700 text-white rounded-xl text-xs font-bold disabled:opacity-60">Add found lot</button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto border border-[#0B172B]/8 rounded-xl">
        <table className="w-full min-w-[820px] text-xs text-left">
          <thead className="bg-[#F0F5F9] sticky top-0 z-10"><tr>
            <th className="p-2.5 font-bold text-[#0B172B]/55 uppercase">Mark / Lot</th>
            {!blind && <th className="p-2.5 font-bold text-[#0B172B]/55 uppercase text-right">System</th>}
            <th className="p-2.5 font-bold text-[#0B172B] uppercase w-28">Counted bags</th>
            <th className="p-2.5 font-bold text-[#0B172B] uppercase w-32">Counted kg</th>
            <th className="p-2.5 font-bold text-[#0B172B]/55 uppercase">Remarks</th>
            <th className="p-2.5 font-bold text-[#0B172B]/55 uppercase w-24 text-center">Status</th>
          </tr></thead>
          <tbody className="divide-y divide-[#0B172B]/5">
            {countRows.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-[#0B172B]/40">No lots match.</td></tr>
            )}
            {countRows.map(lot => {
              const d = drafts[lot.id] || { bags: '', kg: '', kgTouched: false, note: '' };
              const isSys = isSystemLotId(lot.id);
              const st = saveState[lot.id];
              const counted = countsByLot.has(lot.id);
              return (
                <tr key={lot.id} className={counted ? 'bg-[#009965]/[0.03]' : ''}>
                  <td className="p-2.5">
                    <div className="font-bold text-[#0B172B] text-sm">{lot.mark}{isSys && <span className="ml-2 text-[9px] bg-[#009965]/10 text-[#009965] px-1.5 py-0.5 rounded">SYSTEM</span>}</div>
                    <div className="text-[#0B172B]/55">Lot {lot.lotNumber}{lot.grade ? ` • ${lot.grade}` : ''}{!isSys ? ` • ${lot.weightPerBag} kg/bag` : ''}</div>
                  </td>
                  {!blind && (
                    <td className="p-2.5 text-right font-mono text-[#0B172B]/70">{isSys ? '' : `${lot.bags} bags • `}{fmtKg(lot.weight)} kg</td>
                  )}
                  <td className="p-2.5">
                    {isSys ? <span className="text-[#0B172B]/35">kg only</span> : (
                      <input type="number" min="0" step="1" className={input} value={d.bags} placeholder="-"
                        onChange={e => updateDraft(lot, 'bags', e.target.value)} />
                    )}
                  </td>
                  <td className="p-2.5">
                    <input type="number" min="0" step="0.01" className={input} value={d.kg} placeholder="-"
                      onChange={e => updateDraft(lot, 'kg', e.target.value)} />
                    {!isSys && d.bags !== '' && !d.kgTouched && <div className="text-[10px] text-[#0B172B]/40 mt-0.5">bags x {lot.weightPerBag}</div>}
                  </td>
                  <td className="p-2.5">
                    <input className={input} value={d.note} placeholder="Location, condition…" onChange={e => updateDraft(lot, 'note', e.target.value)} />
                  </td>
                  <td className="p-2.5 text-center">
                    {st === 'saving' ? <Loader2 size={14} className="animate-spin inline text-[#0B172B]/40" />
                      : st === 'error' ? <span className="text-rose-600 font-bold">Not saved</span>
                      : counted ? (
                        <span className="inline-flex items-center gap-1 text-[#009965] font-bold">
                          <Check size={13} /> Counted
                          <button onClick={() => clearLot(lot)} title="Clear count" className="ml-1 text-[#0B172B]/30 hover:text-rose-600"><X size={13} /></button>
                        </span>
                      ) : <span className="text-[#0B172B]/35">Not counted</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {newLotCounts.length > 0 && (
        <div className="mt-5">
          <h3 className="font-bold text-sm text-purple-800 mb-2">Found lots not in the system ({newLotCounts.length})</h3>
          <div className="overflow-x-auto border border-purple-200 rounded-xl">
            <table className="w-full min-w-[640px] text-xs text-left">
              <thead className="bg-purple-50"><tr>
                <th className="p-2.5 font-bold text-purple-900/70 uppercase">Mark / Lot</th>
                <th className="p-2.5 font-bold text-purple-900/70 uppercase text-right">Bags</th>
                <th className="p-2.5 font-bold text-purple-900/70 uppercase text-right">Kg</th>
                <th className="p-2.5 font-bold text-purple-900/70 uppercase">Remarks</th>
                <th className="p-2.5 w-10"></th>
              </tr></thead>
              <tbody className="divide-y divide-purple-100">
                {newLotCounts.map(c => (
                  <tr key={c.id}>
                    <td className="p-2.5"><div className="font-bold text-[#0B172B]">{c.mark}</div><div className="text-[#0B172B]/55">Lot {c.lotNumber}{c.grade ? ` • ${c.grade}` : ''}{c.weightPerBag ? ` • ${c.weightPerBag} kg/bag` : ''}</div></td>
                    <td className="p-2.5 text-right font-mono">{c.countedBags}</td>
                    <td className="p-2.5 text-right font-mono font-bold">{fmtKg(c.countedWeight)}</td>
                    <td className="p-2.5 text-[#0B172B]/60">{c.note}</td>
                    <td className="p-2.5 text-center"><button onClick={() => removeNewLot(c)} className="text-[#0B172B]/30 hover:text-rose-600"><Trash2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[11px] text-[#0B172B]/45 mt-4">
        Counts save automatically as you type and are kept if you close the page. Leave both boxes empty for a lot you haven't counted;
        enter 0 for a lot you looked for and didn't find. Weight fills in from bags x kg/bag until you type a weight yourself (for part bags).
      </p>
    </div>
  );
}
