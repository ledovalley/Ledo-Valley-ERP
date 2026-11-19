// Excel downloads for Retailer insights: the comparison table, and one retailer's history.

import { buildXlsx, type XCell, type XSheet } from '@/utils/xlsx';
import { istDate } from '@/utils/allowanceWeek';
import {
  TAG_LABEL, TAG_HELP, DORMANT_DAYS, byTerritory, productLines, monthlyRevenue, paymentMix, orderItems,
  type InsightResult
} from '@/utils/retailerInsights';
import type { InsightsData, RetailerHistory } from './insightsActions';

const H = (v: string): XCell => ({ v, s: 4 });
const B = (v: string | number): XCell => ({ v, s: 1 });
const M = (v: number): XCell => ({ v, s: 2 });
const MB = (v: number): XCell => ({ v, s: 3 });
const when = (ts: string) => new Date(ts).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
const dateOnly = (ts: string | null) => (ts ? istDate(ts) : '');
const pct = (n: number | null) => (n === null ? '' : `${Math.round(n * 1000) / 10}%`);
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The comparison table as shown on screen (`rows` = what the filters and sort currently show). */
export function buildInsightsWorkbook(data: InsightsData, rows: InsightResult[], filterNote: string): Uint8Array {
  const person = (id: string | null) => (id && data.names[id]) || '';
  const sum = (f: (r: InsightResult) => number) => r2(rows.reduce((t, r) => t + f(r), 0));

  const table: XCell[][] = [
    [{ v: 'Retailer insights', s: 5 }],
    [B('Period'), data.periodLabel],
    [B('Compared with'), data.previousLabel],
    [B('Showing'), `${rows.length} retailers${filterNote ? ` (${filterNote})` : ''}`],
    [B('Downloaded'), when(data.generatedAt)],
    [],
    ['Shop', 'Owner', 'Territory', 'Sales person', 'Revenue in period (Rs)', 'Previous period (Rs)', 'Change', 'Orders in period', 'Orders ever', 'Revenue ever (Rs)',
      'Average order (Rs)', 'Last order', 'Days since last order', 'Usual days between orders', 'Outstanding due (Rs)', 'Visits in period', 'Visits that ended in an order', 'Conversion', 'Tags'].map(H),
    ...rows.map(r => [
      r.shopName, r.name, r.territory, person(r.salesPersonId), M(r.revenuePeriod), M(r.revenuePrev), r.changePct === null ? '' : `${r.changePct}%`,
      r.ordersPeriod, r.ordersTotal, M(r.revenueTotal), M(r.avgOrder), dateOnly(r.lastOrderAt), r.daysSinceOrder ?? '', r.avgGapDays ?? '',
      M(r.dueOutstanding), r.visitsPeriod, r.orderVisitsPeriod, pct(r.conversion), r.tags.map(t => TAG_LABEL[t]).join(', ')
    ] as XCell[]),
    [B('Total'), '', '', '', MB(sum(r => r.revenuePeriod)), MB(sum(r => r.revenuePrev)), '', B(sum(r => r.ordersPeriod)), B(sum(r => r.ordersTotal)), MB(sum(r => r.revenueTotal)),
      '', '', '', '', MB(sum(r => r.dueOutstanding)), B(sum(r => r.visitsPeriod)), B(sum(r => r.orderVisitsPeriod))]
  ];
  const sheets: XSheet[] = [{ name: 'Retailers', rows: table, widths: [28, 22, 16, 18, 16, 16, 9, 10, 10, 16, 14, 12, 12, 14, 16, 10, 14, 11, 30] }];

  const terr = byTerritory(rows);
  sheets.push({
    name: 'Territories',
    rows: [
      [{ v: 'Territories (retailers shown on the Retailers sheet)', s: 5 }],
      [],
      ['Territory', 'Retailers', 'Ordered in period', 'Dormant', 'Revenue in period (Rs)', 'Orders in period', 'Outstanding due (Rs)', 'Visits', 'Visits that ended in an order', 'Conversion'].map(H),
      ...terr.map(t => [t.territory, t.retailers, t.active, t.dormant, M(t.revenue), t.orders, M(t.due), t.visits, t.orderVisits, pct(t.visits > 0 ? t.orderVisits / t.visits : null)] as XCell[])
    ],
    widths: [24, 11, 16, 10, 20, 14, 18, 8, 22, 11]
  });

  sheets.push({
    name: 'No-order reasons',
    rows: [
      [{ v: 'Why visits ended without an order', s: 5 }],
      [B('Period'), data.periodLabel],
      [],
      ['Reason', 'Visits', 'Retailers'].map(H),
      ...data.reasons.map(x => [x.reason, x.visits, x.retailers] as XCell[]),
      [B('Total'), B(data.reasons.reduce((t, x) => t + x.visits, 0))]
    ],
    widths: [40, 10, 12]
  });

  sheets.push({
    name: 'How to read',
    rows: [
      [{ v: 'How the tags and figures are worked out', s: 5 }],
      [],
      ...(Object.keys(TAG_LABEL) as (keyof typeof TAG_LABEL)[]).map(k => [B(TAG_LABEL[k]), TAG_HELP[k]] as XCell[]),
      [],
      ['Revenue and orders count every order on the Sales page. Cancelled orders are not counted.'],
      ['Outstanding due is what is still unpaid on a retailer\'s orders today (not limited to the period).'],
      ['Usual days between orders = days from the first to the last order, divided by the number of gaps.'],
      ['Conversion = visits in the period that ended in an order, out of all visits in the period.'],
      [`Dormant means no order for ${DORMANT_DAYS} days or more, whatever period is chosen.`]
    ],
    widths: [20, 90]
  });
  return buildXlsx(sheets);
}

/** One retailer's whole history. */
export function buildHistoryWorkbook(h: RetailerHistory): Uint8Array {
  const name = (id: string | null) => (id && h.names[id]) || '';
  const r = h.retailer;
  const orders = h.orders;
  const revenue = r2(orders.reduce((t, o) => t + o.amount, 0));
  const mix = paymentMix(orders);
  const first = orders.length ? dateOnly(orders[orders.length - 1].createdAt) : '';
  const last = orders.length ? dateOnly(orders[0].createdAt) : '';
  const visitsOrder = h.visits.filter(v => v.type === 'order').length;
  const visitsNo = h.visits.filter(v => v.type === 'no_order').length;

  const summary: XCell[][] = [
    [{ v: `${r.shopName || r.name}`, s: 5 }],
    [B('Owner'), r.name], [B('Territory'), r.territory], [B('Phone'), r.phone], [B('Address'), r.address],
    [B('Sales person'), name(r.salesPersonId)], [B('Added on'), dateOnly(r.createdAt)],
    ...(r.removed ? [[B('Status'), 'Removed by an admin'] as XCell[]] : []),
    [B('Downloaded'), when(new Date().toISOString())],
    ...(h.truncated ? [[B('Note'), 'This retailer has more records than fit here: only the most recent are included.'] as XCell[]] : []),
    [],
    [H('Totals'), H('')],
    ['Orders', orders.length], ['Revenue (Rs)', MB(revenue)], ['Average order (Rs)', M(orders.length ? r2(revenue / orders.length) : 0)],
    ['First order', first], ['Last order', last],
    ['Paid in cash (Rs)', M(mix.cash)], ['Paid online (Rs)', M(mix.online)], ['Still due (Rs)', M(mix.due)],
    ['Visits that ended in an order', visitsOrder], ['Visits with no order', visitsNo]
  ];
  const sheets: XSheet[] = [{ name: 'Summary', rows: summary, widths: [30, 40] }];

  sheets.push({
    name: 'Orders',
    rows: [
      ['Date', 'Time', 'Sales person', 'Products', 'Amount (Rs)', 'Cash (Rs)', 'Online (Rs)', 'Due (Rs)', 'Payment', 'Delivery'].map(H),
      ...orders.map(o => {
        const it = orderItems(o.notes);
        const products = it.length ? it.map(i => `${i.name} (${i.quantity ?? ''})`).join(', ') : (o.notes || '');
        return [dateOnly(o.createdAt), new Date(o.createdAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }), name(o.salesPersonId), products,
          M(o.amount), M(o.cash), M(o.online), M(o.due), o.paymentStatus, o.deliveryStatus] as XCell[];
      }),
      [B('Total'), '', '', '', MB(revenue), MB(r2(orders.reduce((t, o) => t + o.cash, 0))), MB(r2(orders.reduce((t, o) => t + o.online, 0))), MB(mix.due)]
    ],
    widths: [12, 12, 18, 44, 14, 12, 12, 12, 12, 12]
  });

  sheets.push({
    name: 'Visits',
    rows: [
      ['Date', 'Time', 'Sales person', 'Result', 'Reason', 'Notes'].map(H),
      ...h.visits.map(v => [dateOnly(v.createdAt), new Date(v.createdAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }), name(v.salesPersonId),
        v.type === 'order' ? 'Order taken' : v.type === 'no_order' ? 'No order' : v.type, v.reason, v.type === 'order' ? '' : v.notes] as XCell[])
    ],
    widths: [12, 12, 18, 14, 30, 40]
  });

  const pl = productLines(orders);
  sheets.push({
    name: 'Products',
    rows: [
      ['Product', 'Orders containing it', 'Total quantity', 'Quantities that could not be added up'].map(H),
      ...pl.lines.map(l => [l.name, l.orders, l.quantities.map(q => `${q.total}${q.unit ? ' ' + q.unit : ''}`).join(' + '), l.unparsed] as XCell[]),
      [],
      [`${pl.ordersWithoutProducts} order(s) have no product list.`],
      ['Products are counted from the product list saved with each order. Quantities are what was typed on the order (such as "50 kg").']
    ],
    widths: [28, 20, 30, 34]
  });

  sheets.push({
    name: 'Monthly',
    rows: [
      ['Month', 'Orders', 'Revenue (Rs)'].map(H),
      ...monthlyRevenue(orders, 24).map(m => [m.month, m.orders, M(m.revenue)] as XCell[])
    ],
    widths: [12, 10, 16]
  });
  return buildXlsx(sheets);
}
