// Retailer insights: the rules that turn a retailer's order / visit totals into tags,
// plus helpers for the history page. Plain functions (no database, no browser), so
// they can be tested on their own.

import { addDays, istDate, todayIST } from '@/utils/allowanceWeek'

/** A retailer with no order for this many days counts as dormant. */
export const DORMANT_DAYS = 45
export const PERIOD_CHOICES = [30, 90, 180, 365] as const
export type PeriodDays = (typeof PERIOD_CHOICES)[number]

export type InsightRow = {
  retailerId: string
  name: string
  shopName: string
  territory: string
  salesPersonId: string | null
  createdAt: string | null
  ordersTotal: number
  revenueTotal: number
  dueOutstanding: number
  firstOrderAt: string | null
  lastOrderAt: string | null
  ordersPeriod: number
  revenuePeriod: number
  cashPeriod: number
  onlinePeriod: number
  duePeriod: number
  ordersPrev: number
  revenuePrev: number
  visitsPeriod: number
  orderVisitsPeriod: number
  lastVisitAt: string | null
}

export type InsightTag = 'top' | 'growing' | 'new' | 'slipping' | 'dormant' | 'never' | 'highdue'

export const TAG_LABEL: Record<InsightTag, string> = {
  top: 'Top', growing: 'Growing', new: 'New buyer', slipping: 'Slipping', dormant: 'Dormant', never: 'Never ordered', highdue: 'High due'
}
export const TAG_HELP: Record<InsightTag, string> = {
  top: 'Among the top 10% by revenue in the period',
  growing: 'Revenue more than 1.5x the previous period',
  new: 'First ever order was in this period',
  slipping: 'Revenue less than half of the previous period',
  dormant: `No order for ${DORMANT_DAYS} days or more`,
  never: 'Has never placed an order',
  highdue: 'Owes ₹1,000 or more, and that is 30% or more of everything they have bought'
}

export type InsightResult = InsightRow & {
  tags: InsightTag[]
  daysSinceOrder: number | null
  avgGapDays: number | null
  avgOrder: number
  conversion: number | null   // share of visits in the period that ended in an order (0..1)
  changePct: number | null    // revenue vs the previous period, in % (null when there was none)
}

/** Whole days between two India dates (YYYY-MM-DD). */
export function daysBetween(fromYmd: string, toYmd: string) {
  const a = Date.parse(fromYmd + 'T00:00:00Z'), b = Date.parse(toYmd + 'T00:00:00Z')
  return Math.round((b - a) / 86400000)
}

/** The chosen period and the equal-length one before it, as India-midnight timestamps. `to` is exclusive. */
export function periodRange(days: number, now = new Date()) {
  const n = Math.max(1, Math.floor(days))
  const today = todayIST(now)
  const endDay = addDays(today, 1)
  const startDay = addDays(endDay, -n)
  const prevDay = addDays(startDay, -n)
  const at = (d: string) => `${d}T00:00:00+05:30`
  return { days: n, from: at(startDay), to: at(endDay), prevFrom: at(prevDay), fromDay: startDay, toDay: today, prevFromDay: prevDay }
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function analyse(rows: InsightRow[], now = new Date(), dormantDays = DORMANT_DAYS): InsightResult[] {
  const today = todayIST(now)
  const withRevenue = rows.filter(r => r.revenuePeriod > 0).sort((a, b) => b.revenuePeriod - a.revenuePeriod)
  // top 10% (rounded up, at least one) of the retailers who ordered in the period
  const topCount = withRevenue.length === 0 ? 0 : Math.max(1, Math.ceil(withRevenue.length * 0.1))
  const topIds = new Set(withRevenue.slice(0, topCount).map(r => r.retailerId))

  return rows.map(r => {
    const daysSinceOrder = r.lastOrderAt ? Math.max(0, daysBetween(istDate(r.lastOrderAt), today)) : null
    const avgGapDays = r.ordersTotal >= 2 && r.firstOrderAt && r.lastOrderAt
      ? round1(daysBetween(istDate(r.firstOrderAt), istDate(r.lastOrderAt)) / (r.ordersTotal - 1))
      : null
    const tags: InsightTag[] = []
    const never = r.ordersTotal === 0
    const dormant = !never && daysSinceOrder !== null && daysSinceOrder >= dormantDays
    if (never) tags.push('never')
    if (dormant) tags.push('dormant')
    if (!never && !dormant) {
      if (r.revenuePrev > 0 && r.revenuePeriod < r.revenuePrev * 0.5) tags.push('slipping')
      if (r.revenuePrev > 0 && r.revenuePeriod > r.revenuePrev * 1.5) tags.push('growing')
    }
    if (r.firstOrderAt && r.ordersPeriod > 0 && r.ordersPeriod === r.ordersTotal) tags.push('new')
    if (topIds.has(r.retailerId)) tags.push('top')
    if (r.dueOutstanding >= 1000 && r.revenueTotal > 0 && r.dueOutstanding >= r.revenueTotal * 0.3) tags.push('highdue')
    return {
      ...r,
      tags,
      daysSinceOrder,
      avgGapDays,
      avgOrder: r.ordersTotal > 0 ? Math.round((r.revenueTotal / r.ordersTotal) * 100) / 100 : 0,
      conversion: r.visitsPeriod > 0 ? r.orderVisitsPeriod / r.visitsPeriod : null,
      changePct: r.revenuePrev > 0 ? Math.round(((r.revenuePeriod - r.revenuePrev) / r.revenuePrev) * 1000) / 10 : null
    }
  })
}

export type TerritoryRow = { territory: string; retailers: number; active: number; revenue: number; orders: number; visits: number; orderVisits: number; due: number; dormant: number }

export function byTerritory(rows: InsightResult[]): TerritoryRow[] {
  const m = new Map<string, TerritoryRow>()
  for (const r of rows) {
    const k = (r.territory || '').trim() || 'No territory'
    const t = m.get(k) || { territory: k, retailers: 0, active: 0, revenue: 0, orders: 0, visits: 0, orderVisits: 0, due: 0, dormant: 0 }
    t.retailers++
    if (r.ordersPeriod > 0) t.active++
    t.revenue += r.revenuePeriod; t.orders += r.ordersPeriod
    t.visits += r.visitsPeriod; t.orderVisits += r.orderVisitsPeriod
    t.due += r.dueOutstanding
    if (r.tags.includes('dormant')) t.dormant++
    m.set(k, t)
  }
  return [...m.values()].map(t => ({ ...t, revenue: Math.round(t.revenue * 100) / 100, due: Math.round(t.due * 100) / 100 })).sort((a, b) => b.revenue - a.revenue)
}

// ---------- one retailer's history ----------

export type HistoryOrder = {
  id: string; createdAt: string; amount: number; cash: number; online: number; due: number
  paymentStatus: string; deliveryStatus: string; notes: string | null; salesPersonId: string | null
}
export type HistoryVisit = {
  id: string; createdAt: string; type: string; reason: string; notes: string; salesPersonId: string | null
}

export type ProductLine = { name: string; orders: number; quantities: { unit: string; total: number }[]; unparsed: number }

/** "50 kg", "50kg", "12.5 Kg", "10 packets", "5" -> number and unit ('' when none). null when it has no number. */
export function parseQuantity(q: unknown): { n: number; unit: string } | null {
  if (typeof q === 'number' && Number.isFinite(q)) return { n: q, unit: '' }
  if (typeof q !== 'string') return null
  const m = q.replace(/,/g, '').trim().match(/^(\d+(?:\.\d+)?)\s*([A-Za-z][A-Za-z .]*)?$/)
  if (!m) return null
  return { n: Number(m[1]), unit: (m[2] || '').trim().toLowerCase() }
}

/** The product lines inside one order's notes (JSON {items:[{category, quantity}]}); [] for anything else. */
export function orderItems(notes: string | null | undefined): { name: string; quantity: unknown }[] {
  if (!notes) return []
  try {
    const p = JSON.parse(notes)
    if (p && Array.isArray(p.items)) {
      return p.items.filter((i: any) => i && typeof i.category === 'string' && i.category.trim())
        .map((i: any) => ({ name: i.category.trim(), quantity: i.quantity }))
    }
  } catch { /* old orders kept plain text */ }
  return []
}

export function productLines(orders: HistoryOrder[]): { lines: ProductLine[]; ordersWithoutProducts: number } {
  const m = new Map<string, { orders: number; q: Map<string, number>; unparsed: number }>()
  let without = 0
  for (const o of orders) {
    const items = orderItems(o.notes)
    if (items.length === 0) { without++; continue }
    const seen = new Set<string>()
    for (const it of items) {
      const e = m.get(it.name) || { orders: 0, q: new Map(), unparsed: 0 }
      if (!seen.has(it.name)) { e.orders++; seen.add(it.name) }
      const pq = parseQuantity(it.quantity)
      if (pq) e.q.set(pq.unit, (e.q.get(pq.unit) || 0) + pq.n); else e.unparsed++
      m.set(it.name, e)
    }
  }
  const lines = [...m.entries()].map(([name, e]) => ({
    name, orders: e.orders, unparsed: e.unparsed,
    quantities: [...e.q.entries()].map(([unit, total]) => ({ unit, total: Math.round(total * 100) / 100 })).sort((a, b) => b.total - a.total)
  })).sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name))
  return { lines, ordersWithoutProducts: without }
}

/** Revenue per month (India time) for the last `months` months, oldest first, empty months included. */
export function monthlyRevenue(orders: HistoryOrder[], months = 12, now = new Date()): { month: string; orders: number; revenue: number }[] {
  const today = todayIST(now)
  let y = Number(today.slice(0, 4)), mo = Number(today.slice(5, 7))
  const keys: string[] = []
  for (let i = 0; i < months; i++) {
    keys.unshift(`${y}-${String(mo).padStart(2, '0')}`)
    mo--; if (mo === 0) { mo = 12; y-- }
  }
  const m = new Map(keys.map(k => [k, { month: k, orders: 0, revenue: 0 }]))
  for (const o of orders) {
    const e = m.get(istDate(o.createdAt).slice(0, 7))
    if (e) { e.orders++; e.revenue = Math.round((e.revenue + o.amount) * 100) / 100 }
  }
  return keys.map(k => m.get(k)!)
}

export function paymentMix(orders: HistoryOrder[]) {
  const t = { cash: 0, online: 0, due: 0 }
  for (const o of orders) { t.cash += o.cash; t.online += o.online; t.due += Math.max(0, o.due) }
  return { cash: Math.round(t.cash * 100) / 100, online: Math.round(t.online * 100) / 100, due: Math.round(t.due * 100) / 100 }
}

export type TimelineEntry =
  | { kind: 'order'; at: string; order: HistoryOrder }
  | { kind: 'visit'; at: string; visit: HistoryVisit }

/** Orders and no-order visits in one list, newest first. The visit that was logged along with an order is left out (the order shows it). */
export function timeline(orders: HistoryOrder[], visits: HistoryVisit[]): TimelineEntry[] {
  const list: TimelineEntry[] = [
    ...orders.map(o => ({ kind: 'order' as const, at: o.createdAt, order: o })),
    ...visits.filter(v => v.type !== 'order').map(v => ({ kind: 'visit' as const, at: v.createdAt, visit: v }))
  ]
  return list.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}
