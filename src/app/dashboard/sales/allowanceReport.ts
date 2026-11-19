// Detailed allowance report (Excel): a Summary sheet and one sheet per person
// with every shift (odometer readings, times, km...) and a day-by-day breakdown.
// Used for both the weekly and the monthly download.

import { buildXlsx, type XCell, type XSheet } from '@/utils/xlsx';
import { dayLabel } from '@/utils/allowanceWeek';
import type { AllowanceShift, CorrectionRecord } from './actions';

export type ReportDay = { date: string; shifts: number; km: number; foodRate: number; kmRate: number; food: number; travel: number; paid?: boolean };
export type ReportPerson = {
  userId: string; name: string; role: string; daysPresent: number; km: number; food: number; travel: number; extra?: number; total: number;
  openShifts: number; noRates: boolean; foodRate: number; kmRate: number; days: ReportDay[];
};
export type ReportInput = {
  title: string;
  info: [string, string][];          // rows like ['Week', 'Mon 26 Oct – Sun 1 Nov 2026']
  people: ReportPerson[];
  shifts: Record<string, AllowanceShift[]>;
  weeks?: { label: string; paid: boolean; paidAt: string | null; paidByName: string }[]; // monthly report
  showPaidColumn?: boolean;          // monthly report: say per day whether its week was paid
  personNote?: string;               // extra line on each person's sheet
  corrections?: CorrectionRecord[];  // admin corrections: listed on their own 'Corrections' sheet only
};

const H = (v: string): XCell => ({ v, s: 4 });
const B = (v: string | number): XCell => ({ v, s: 1 });
const M = (v: number): XCell => ({ v, s: 2 });
const MB = (v: number): XCell => ({ v, s: 3 });
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const when = (ts: string) => new Date(ts).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

export function buildAllowanceWorkbook(rep: ReportInput): Uint8Array {
  const totals = rep.people.reduce((t, r) => ({
    days: t.days + r.daysPresent, km: r2(t.km + r.km), food: r2(t.food + r.food), travel: r2(t.travel + r.travel), total: r2(t.total + r.total)
  }), { days: 0, km: 0, food: 0, travel: 0, total: 0 });
  // People with an admin correction in use: their sheet shows only final figures; the recorded
  // shifts and every correction are on the separate Corrections sheet.
  const inUse = (rep.corrections || []).filter(c => !c.cancelledAt);
  const editedIds = new Set(inUse.map(c => c.userId));
  const shiftCount = (r: ReportPerson) => editedIds.has(r.userId) ? r.days.reduce((t, d) => t + d.shifts, 0) : (rep.shifts[r.userId] || []).length;
  const allShifts = rep.people.reduce((t, r) => t + shiftCount(r), 0);

  // ---- Summary ----
  const summary: XCell[][] = [
    [{ v: rep.title, s: 5 }],
    ...rep.info.map(([k, v]) => [B(k), v] as XCell[]),
    [B('Downloaded'), when(new Date().toISOString())],
    [],
    ['Name', 'Role', 'Days present', 'Food rate (Rs/day)', 'Food (Rs)', 'Km', 'Rate (Rs/km)', 'Travel (Rs)', 'Total to pay (Rs)', 'Shifts', 'Shifts still running'].map(H),
    ...rep.people.map(r => [r.name, r.role, r.daysPresent, M(r.foodRate), M(r.food), r.km, M(r.kmRate), M(r.travel), MB(r.total), shiftCount(r), r.openShifts] as XCell[]),
    [B('Total'), '', B(totals.days), '', MB(totals.food), B(totals.km), '', MB(totals.travel), MB(totals.total), B(allShifts), B(rep.people.reduce((t, r) => t + r.openShifts, 0))],
  ];
  if (rep.weeks?.length) {
    summary.push([], [B('Weeks in this month')], ['Week', 'Paid?', 'Paid on', 'Paid by'].map(H),
      ...rep.weeks.map(w => [w.label, w.paid ? 'Paid' : 'Not paid yet', w.paidAt ? when(w.paidAt) : '', w.paidByName] as XCell[]));
  }
  summary.push([], ['Food = days present x Food Allowance / DA rate. Travel = km x Bike Allowance rate. A day counts once, however many shifts were started. Km come from each ended shift (closing minus opening odometer).']);
  if (rep.showPaidColumn) summary.push(['Days in weeks already marked as paid use the days, km and rates saved when that week was paid. Other days use the shifts and the current rates. The rates shown here are the current ones.']);
  const sheets: XSheet[] = [{ name: 'Summary', rows: summary, widths: [34, 14, 13, 17, 13, 10, 13, 13, 17, 9, 18] }];

  // ---- One sheet per person ----
  for (const r of rep.people.filter(x => x.daysPresent > 0 || (x.extra || 0) !== 0)) {
    const list = rep.shifts[r.userId] || [];
    const sum = (f: (x: AllowanceShift) => number) => list.reduce((t, x) => t + f(x), 0);
    const dayHead = ['Date', 'Day', 'Shifts', 'Km', 'Food rate (Rs)', 'Rate (Rs/km)', 'Food (Rs)', 'Travel (Rs)', 'Day total (Rs)', ...(rep.showPaidColumn ? ['Week paid?'] : [])];
    const rows: XCell[][] = [
      [{ v: r.name, s: 5 }],
      ...rep.info.map(([k, v]) => [B(k), v] as XCell[]),
      ...(rep.personNote ? [[B('Note'), rep.personNote] as XCell[]] : []),
      [],
      [H('Rates (current)'), H('')],
      ['Food Allowance / DA (Rs per day)', M(r.foodRate)],
      ['Bike Allowance (Rs per km)', M(r.kmRate)],
      [],
      [H('Totals'), H('')],
      ['Days present', r.daysPresent],
      ['Km travelled', r.km],
      ['Food (Rs)', M(r.food)],
      ['Travel (Rs)', M(r.travel)],
      [B('Total to pay (Rs)'), MB(r.total)],
      ...(r.noRates ? [['Note', 'No allowance rates are set for this person on the Users page.'] as XCell[]] : []),
      ...(r.openShifts > 0 ? [['Note', `${r.openShifts} shift(s) still running: their km are not counted yet.`] as XCell[]] : []),
      ...(editedIds.has(r.userId) ? [] : [
      [] as XCell[],
      [B('Shifts')],
      ['Date', 'Day', 'Vehicle', 'Odometer start', 'Odometer end', 'Km', 'Status', 'Orders', 'Visits', 'Order value (Rs)', 'Cash (Rs)', 'Online (Rs)', 'Due (Rs)', 'Start location', 'End location'].map(H),
      ...list.map(sh => [
        sh.date, dayLabel(sh.date).split(' ')[0], sh.vehicle, sh.odometerStart, sh.odometerEnd,
        sh.km === null ? 'not ended' : sh.km, sh.km === null ? 'still running' : sh.status,
        sh.orders, sh.visits, M(sh.orderValue), M(sh.cash), M(sh.online), M(sh.due), sh.startLocation, sh.endLocation
      ] as XCell[]),
      [B('Total'), '', '', '', '', B(r2(sum(x => x.km ?? 0))), '', B(sum(x => x.orders)), B(sum(x => x.visits)), MB(sum(x => x.orderValue)), MB(sum(x => x.cash)), MB(sum(x => x.online)), MB(sum(x => x.due))],
      ]),
      [],
      [B('Day by day')],
      dayHead.map(H),
      ...r.days.map(d => [d.date, dayLabel(d.date).split(' ')[0], d.shifts, d.km, M(d.foodRate), M(d.kmRate), M(d.food), M(d.travel), M(r2(d.food + d.travel)),
        ...(rep.showPaidColumn ? [d.paid ? 'Paid' : 'Not paid yet'] : [])] as XCell[]),
      [B('Total'), '', B(r.days.reduce((t, d) => t + d.shifts, 0)), B(r.km), '', '', MB(r.food), MB(r.travel), MB(r.total)],
    ];
    sheets.push({ name: r.name, rows, widths: [32, 7, 10, 15, 14, 12, 13, 8, 8, 15, 11, 11, 11, 32, 32] });
  }

  // ---- Corrections (admin edits), kept apart so the sheets above are the clean final data ----
  // oldest first; within one save by person, then by day (the one-off extra last)
  const corr = [...(rep.corrections || [])].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt) || a.userName.localeCompare(b.userName) || (a.date || '9999').localeCompare(b.date || '9999'));
  if (corr.length > 0) {
    const dayText = (present: boolean | null, km: number | null) => present === null ? '' : present ? `Present, ${km ?? 0} km` : 'Absent';
    const crows: XCell[][] = [
      [{ v: 'Corrections made by an admin', s: 5 }],
      ...rep.info.map(([k, v]) => [B(k), v] as XCell[]),
      [],
      ['The other sheets show only the final, corrected figures. This sheet is the only place that shows the original data and the corrections: every correction is listed, including ones later replaced or reset. The recorded shifts themselves are never changed.'],
      [],
      ['Person', 'Week starting', 'Date', 'What', 'Original', 'Corrected', 'Reason', 'Corrected by', 'Corrected on', 'Status', 'Retired on', 'Retired by'].map(H),
      ...corr.map(c => [
        c.userName, dayLabel(c.weekStart), c.date ? dayLabel(c.date) : '',
        c.date ? 'Day' : 'Other adjustment (Rs)',
        c.date ? dayText(c.origPresent, c.origKm) : 0,
        c.date ? dayText(c.present, c.km) : M(c.extra ?? 0),
        c.reason, c.createdByName, when(c.createdAt),
        c.cancelledAt ? 'Replaced / reset' : 'In use',
        c.cancelledAt ? when(c.cancelledAt) : '', c.cancelledAt ? c.cancelledByName : ''
      ] as XCell[])
    ];
    // One-off amounts included in each person's Total to pay (corrections in use)
    const adj = new Map<string, { name: string; amount: number }>();
    for (const c of inUse) if (!c.date) adj.set(c.userId, { name: c.userName, amount: r2((adj.get(c.userId)?.amount || 0) + (c.extra || 0)) });
    if (adj.size > 0) {
      crows.push([], [B('Other adjustments included in Total to pay (corrections in use)')], ['Person', 'Amount (Rs)'].map(H),
        ...[...adj.values()].sort((a, b) => a.name.localeCompare(b.name)).map(a => [a.name, M(a.amount)] as XCell[]));
    }
    // The recorded shifts of people with corrections (not shown on their own sheet)
    const shown = rep.people.filter(x => editedIds.has(x.userId));
    if (shown.length > 0) {
      crows.push([], [B('Recorded shifts of people with corrections (as recorded, before any correction)')],
        ['Person', 'Date', 'Day', 'Vehicle', 'Odometer start', 'Odometer end', 'Km', 'Status', 'Orders', 'Visits', 'Cash (Rs)', 'Online (Rs)', 'Due (Rs)'].map(H));
      for (const x of shown) {
        for (const sh of rep.shifts[x.userId] || []) {
          crows.push([x.name, sh.date, dayLabel(sh.date).split(' ')[0], sh.vehicle, sh.odometerStart, sh.odometerEnd,
            sh.km === null ? 'not ended' : sh.km, sh.km === null ? 'still running' : sh.status, sh.orders, sh.visits, M(sh.cash), M(sh.online), M(sh.due)] as XCell[]);
        }
      }
    }
    sheets.push({ name: 'Corrections', rows: crows, widths: [24, 16, 14, 22, 18, 18, 36, 22, 22, 16, 22, 22, 14] });
  }
  return buildXlsx(sheets);
}

export function saveXlsx(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

