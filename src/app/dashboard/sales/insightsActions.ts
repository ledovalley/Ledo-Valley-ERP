'use server'

// Retailer insights (admin only, read only): nothing here writes to the database.

import { createClient } from '@/utils/supabase/server'
import { isSessionValid } from '@/app/dashboard/actions'
import { selectAllPages } from '@/utils/selectAll'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { listAllUsersCached } from '@/utils/usersList'
import { analyse, periodRange, PERIOD_CHOICES, type InsightResult, type InsightRow, type HistoryOrder, type HistoryVisit } from '@/utils/retailerInsights'
import { dayLabel, todayIST } from '@/utils/allowanceWeek'

const INSIGHTS_SQL = 'Retailer insights are not set up yet: run supabase/migrations/20261119_retailer_insights.sql in Supabase.'
const HISTORY_LIMIT = 3000   // most recent orders / visits shown for one retailer

async function requireAdminInsights(): Promise<{ user: any } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const role = (user?.app_metadata?.role || '').toLowerCase()
  if (!user || role !== 'admin') return { error: 'Only admins can see retailer insights.' }
  if (!(await isSessionValid())) return { error: 'Session expired. Please log in again.' }
  return { user }
}

const num = (v: unknown) => Number(v) || 0
const missingSql = (m: string) => /fn_retailer_insights|fn_no_order_reasons|schema cache|visit_type|no_order_reason/.test(m)

export type NoOrderReason = { reason: string; visits: number; retailers: number }
export type InsightsData = {
  days: number
  periodLabel: string
  previousLabel: string
  generatedAt: string
  rows: InsightResult[]
  reasons: NoOrderReason[]
  names: Record<string, string>   // user id -> name, for the sales person columns
}

export async function fetchRetailerInsights(days: number, includeRemoved = false): Promise<InsightsData | { error: string }> {
  const a = await requireAdminInsights()
  if ('error' in a) return a
  const n = Number(days)
  if (!(PERIOD_CHOICES as readonly number[]).includes(n)) return { error: 'Choose 30, 90, 180 or 365 days.' }

  const now = new Date()
  const r = periodRange(n, now)
  try {
    const raw = await selectAllPages((from, to) =>
      supabaseAdmin.rpc('fn_retailer_insights', { p_from: r.from, p_to: r.to, p_prev_from: r.prevFrom, p_include_removed: !!includeRemoved }).range(from, to))
    const reasonsRes = await supabaseAdmin.rpc('fn_no_order_reasons', { p_from: r.from, p_to: r.to, p_include_removed: !!includeRemoved })
    if (reasonsRes.error) throw new Error(reasonsRes.error.message)

    const rows: InsightRow[] = (raw as any[]).map(x => ({
      retailerId: x.retailer_id, name: x.name || '', shopName: x.shop_name || '', territory: x.territory || '',
      salesPersonId: x.sales_person_id || null, createdAt: x.created_at || null,
      ordersTotal: num(x.orders_total), revenueTotal: num(x.revenue_total), dueOutstanding: num(x.due_outstanding),
      firstOrderAt: x.first_order_at || null, lastOrderAt: x.last_order_at || null,
      ordersPeriod: num(x.orders_period), revenuePeriod: num(x.revenue_period), cashPeriod: num(x.cash_period),
      onlinePeriod: num(x.online_period), duePeriod: num(x.due_period),
      ordersPrev: num(x.orders_prev), revenuePrev: num(x.revenue_prev),
      visitsPeriod: num(x.visits_period), orderVisitsPeriod: num(x.order_visits_period), lastVisitAt: x.last_visit_at || null
    }))

    const names: Record<string, string> = {}
    try {
      const wanted = new Set(rows.map(x => x.salesPersonId).filter(Boolean) as string[])
      for (const u of await listAllUsersCached()) {
        if (wanted.has(u.id)) names[u.id] = (u.user_metadata?.name as string) || u.email || 'Unknown'
      }
    } catch { /* names are a convenience */ }

    return {
      days: n,
      periodLabel: `${dayLabel(r.fromDay)} – ${dayLabel(r.toDay)} (${n} days)`,
      previousLabel: `${n} days before that`,
      generatedAt: now.toISOString(),
      rows: analyse(rows, now),
      reasons: ((reasonsRes.data as any[]) || []).map(x => ({ reason: x.reason, visits: num(x.visits), retailers: num(x.retailers) })),
      names
    }
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    return { error: missingSql(m) ? INSIGHTS_SQL : m }
  }
}

export type RetailerHistory = {
  retailer: { id: string; name: string; shopName: string; territory: string; phone: string; address: string; salesPersonId: string | null; createdAt: string | null; removed: boolean }
  orders: HistoryOrder[]
  visits: HistoryVisit[]
  truncated: boolean
  names: Record<string, string>
  today: string
}

export async function fetchRetailerHistory(retailerId: string): Promise<RetailerHistory | { error: string }> {
  const a = await requireAdminInsights()
  if ('error' in a) return a
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(retailerId))) return { error: 'Unknown retailer.' }

  try {
    const { data: r, error: re } = await supabaseAdmin.from('retailers').select('*').eq('id', retailerId).maybeSingle()
    if (re) throw new Error(re.message)
    if (!r) return { error: 'This retailer was not found.' }

    // newest first; one extra row tells whether anything was cut off
    const [ordersRes, visitsRes] = await Promise.all([
      supabaseAdmin.from('sales_records')
        .select('id, created_at, amount, cash_amount, online_amount, due_amount, payment_status, delivery_status, notes, sales_person_id')
        .eq('retailer_id', retailerId).neq('delivery_status', 'cancelled')
        .order('created_at', { ascending: false }).order('id', { ascending: true }).limit(HISTORY_LIMIT + 1),
      supabaseAdmin.from('retailer_visits')
        .select('id, created_at, visit_type, no_order_reason, notes, sales_person_id')
        .eq('retailer_id', retailerId)
        .order('created_at', { ascending: false }).order('id', { ascending: true }).limit(HISTORY_LIMIT + 1)
    ])
    if (ordersRes.error) throw new Error(ordersRes.error.message)
    if (visitsRes.error) throw new Error(visitsRes.error.message)

    const oRows = ordersRes.data || [], vRows = visitsRes.data || []
    const truncated = oRows.length > HISTORY_LIMIT || vRows.length > HISTORY_LIMIT
    const orders: HistoryOrder[] = oRows.slice(0, HISTORY_LIMIT).map((o: any) => ({
      id: o.id, createdAt: o.created_at, amount: num(o.amount), cash: num(o.cash_amount), online: num(o.online_amount), due: num(o.due_amount),
      paymentStatus: o.payment_status || '', deliveryStatus: o.delivery_status || 'delivered', notes: o.notes || null, salesPersonId: o.sales_person_id || null
    }))
    const visits: HistoryVisit[] = vRows.slice(0, HISTORY_LIMIT).map((v: any) => ({
      id: v.id, createdAt: v.created_at, type: v.visit_type || '', reason: v.no_order_reason || '', notes: v.notes || '', salesPersonId: v.sales_person_id || null
    }))

    const names: Record<string, string> = {}
    try {
      const wanted = new Set<string>([...orders.map(o => o.salesPersonId), ...visits.map(v => v.salesPersonId), r.sales_person_id].filter(Boolean) as string[])
      for (const u of await listAllUsersCached()) {
        if (wanted.has(u.id)) names[u.id] = (u.user_metadata?.name as string) || u.email || 'Unknown'
      }
    } catch { /* names are a convenience */ }

    return {
      retailer: {
        id: r.id, name: r.name || '', shopName: r.shop_name || '', territory: r.territory || '', phone: r.phone || '', address: r.address || '',
        salesPersonId: r.sales_person_id || null, createdAt: r.created_at || null, removed: r.is_active === false
      },
      orders, visits, truncated, names, today: todayIST()
    }
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    return { error: missingSql(m) ? INSIGHTS_SQL : m }
  }
}
