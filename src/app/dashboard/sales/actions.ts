'use server'

import { createClient, getCachedUser } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { isSessionValid } from '@/app/dashboard/actions'
import { selectAllPages } from '@/utils/selectAll'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { SALES_DEFAULT_DAYS, salesPeriodRange, type SalesPeriodKey } from '@/utils/salesPeriods'
import { listAllUsersCached } from '@/utils/usersList'
import { weekRange, istDate, isYmd, mondayOf, addDays, todayIST } from '@/utils/allowanceWeek'
import { checkDeletePassword } from '@/utils/deletePassword'
import { phoneKey } from '@/utils/phoneMatch'

// Retailer Actions
export async function fetchRetailers() {
  const supabase = await createClient()
  const user = await getCachedUser()
  const role = (user?.app_metadata?.role || '').toLowerCase()

  // Admins & managers see all, other staff see only theirs
  const ownOnly = role !== 'admin' && role !== 'manager'
  try {
    const all = await selectAllPages((from, to) => {
      let query = supabase.from('retailers').select('*')
        .order('created_at', { ascending: false }).order('id', { ascending: true })
      if (ownOnly) query = query.eq('sales_person_id', user?.id)
      return query.range(from, to)
    })
    // Retailers removed by an admin are hidden (checked here, so this also works
    // before 20261117_sale_cancel_retailer_delete.sql adds the column)
    return (all as any[]).filter(r => r.is_active !== false)
  } catch (error) {
    console.error("Fetch Retailers Error:", error)
    return []
  }
}

export async function createRetailer(formData: FormData) {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user || !(await isSessionValid())) {
    return { error: "Session expired. Please log in again." }
  }

  const name = formData.get('name') as string
  const shop_name = formData.get('shop_name') as string
  const address = formData.get('address') as string
  const phone = formData.get('phone') as string
  const territory = formData.get('territory') as string
  const geo_location = formData.get('geo_location') as string

  // Refuse a retailer whose phone number already belongs to another (not removed)
  // retailer. Looked up with the server key so it also sees retailers added by other
  // sales people, who cannot see each other's lists.
  const key = phoneKey(phone)
  if (key) {
    try {
      // Only fetch rows whose phone contains these 10 digits in order, whatever the
      // spacing or dashes (a fast, narrow query instead of loading every retailer).
      // The exact match is still checked below.
      const pattern = '%' + key.split('').join('%') + '%'
      const all = await selectAllPages((from, to) =>
        supabaseAdmin.from('retailers').select('*').ilike('phone', pattern)
          .order('id', { ascending: true }).range(from, to))
      const dup = (all as any[]).find(r => r.is_active !== false && phoneKey(r.phone) === key)
      if (dup) {
        const label = [dup.shop_name, dup.name].filter(Boolean).join(' - ')
        return { error: `This phone number already belongs to an existing retailer: ${label || 'unnamed'}${dup.territory ? ` (${dup.territory})` : ''}. Use that retailer instead of adding a new one.` }
      }
    } catch (e) {
      // If the check itself cannot run, do not stop the sales person from working.
      console.error('Duplicate retailer check failed:', e)
    }
  }

  // Server locks current date & time automatically
  const currentTimestamp = new Date().toISOString()

  const insertData = {
    name,
    shop_name,
    address,
    phone,
    territory,
    geo_location: geo_location?.trim() || null,
    sales_person_id: user?.id,
    created_at: currentTimestamp
  }

  const { data, error } = await supabase
    .from('retailers')
    .insert(insertData)
    .select()
    .single()

  if (error) return { error: error.message }
  
  revalidatePath('/dashboard/sales')
  revalidatePath('/dashboard')
  return { success: true, retailer: data }
}

export async function updateRetailer(id: string, formData: FormData) {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user || !(await isSessionValid())) {
    return { error: "Session expired. Please log in again." }
  }

  const name = formData.get('name') as string
  const shop_name = formData.get('shop_name') as string
  const address = formData.get('address') as string
  const phone = formData.get('phone') as string
  const territory = formData.get('territory') as string
  const geo_location = formData.get('geo_location') as string

  const updateData = {
    name,
    shop_name,
    address,
    phone,
    territory,
    geo_location: geo_location?.trim() || null
  }

  const { data, error } = await supabase
    .from('retailers')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath('/dashboard/sales')
  revalidatePath('/dashboard')
  return { success: true, retailer: data }
}

// Fetch active product categories
export async function fetchProducts() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error || !data || data.length === 0) {
    // Fallback default brand categories
    return [
      { id: '1', name: 'Tea', category: 'Tea', unit: 'kg' },
      { id: '2', name: 'Sauces', category: 'Sauces', unit: 'cases' },
      { id: '3', name: 'Soya Chunks', category: 'Soya Chunks', unit: 'bags' }
    ]
  }
  return data
}

// Sales Record Actions
const SALE_SELECT = `
  *,
  retailers (id, name, shop_name, territory, address, phone, geo_location)
`

/**
 * Sales for the Sales page: the last 60 days only (everyone's for admins and
 * managers, a salesperson's own otherwise). Older sales stay in the database;
 * admins and managers see other periods with fetchSalesPeriod.
 */
export async function fetchSalesRecords() {
  const supabase = await createClient()
  const user = await getCachedUser()
  const role = (user?.app_metadata?.role || '').toLowerCase()

  const ownOnly = role !== 'admin' && role !== 'manager'
  const since = new Date(Date.now() - SALES_DEFAULT_DAYS * 24 * 60 * 60 * 1000).toISOString()
  try {
    return await selectAllPages((from, to) => {
      let query = supabase.from('sales_records').select(SALE_SELECT)
        .gte('created_at', since)
        .order('created_at', { ascending: false }).order('id', { ascending: true })
      if (ownOnly) query = query.eq('sales_person_id', user?.id)
      return query.range(from, to)
    })
  } catch (error) {
    console.error("Fetch Sales Error:", error)
    return []
  }
}

export type SalesSummaryRow = {
  salesPersonId: string | null
  orders: number
  revenue: number
  cash: number
  online: number
  due: number
  retailersReached: number
  newRetailers: number
  visits: number
}

const SALES_PAGE_ROWS = 100

/**
 * Admins and managers: one period of sales. Returns the totals per salesperson
 * (added up in the database, exact for any length of period) and the newest 100
 * sales of that period; call again with the next offset for "Show more".
 */
export async function fetchSalesPeriod(input: {
  period: SalesPeriodKey
  from?: string
  to?: string
  salesPersonId?: string | null
  offset?: number
}): Promise<
  | { success: true; label: string; summary: SalesSummaryRow[]; rows: any[]; hasMore: boolean; offset: number }
  | { error: string }
> {
  const supabase = await createClient()
  const user = await getCachedUser()
  const role = (user?.app_metadata?.role || '').toLowerCase()
  if (!user || !(role === 'admin' || role === 'manager')) {
    return { error: 'Only admins and managers can look at other periods.' }
  }

  let range
  try {
    range = salesPeriodRange(input.period, input.from, input.to)
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
  const person = input.salesPersonId || null
  const offset = Math.max(0, Math.floor(Number(input.offset) || 0))

  let rowsQuery = supabase.from('sales_records').select(SALE_SELECT)
    .gte('created_at', range.from)
    .order('created_at', { ascending: false }).order('id', { ascending: true })
  if (range.to) rowsQuery = rowsQuery.lt('created_at', range.to)
  if (person) rowsQuery = rowsQuery.eq('sales_person_id', person)

  const [summaryRes, rowsRes] = await Promise.all([
    // Totals only needed once per period, not for every "Show more"
    offset === 0
      ? supabaseAdmin.rpc('fn_sales_summary', { p_from: range.from, p_to: range.to, p_sales_person: person })
      : Promise.resolve({ data: null, error: null }),
    // One extra row tells whether there is more to show
    rowsQuery.range(offset, offset + SALES_PAGE_ROWS)
  ])

  if (summaryRes.error) {
    return {
      error: /fn_sales_summary/.test(summaryRes.error.message)
        ? 'Period totals are not set up yet: run supabase/migrations/20261104_sales_summary.sql in Supabase.'
        : summaryRes.error.message
    }
  }
  if (rowsRes.error) return { error: rowsRes.error.message }

  const rows = rowsRes.data || []
  const summary: SalesSummaryRow[] = ((summaryRes.data as any[]) || []).map(r => ({
    salesPersonId: r.sales_person_id,
    orders: Number(r.orders) || 0,
    revenue: Number(r.revenue) || 0,
    cash: Number(r.cash) || 0,
    online: Number(r.online) || 0,
    due: Number(r.due) || 0,
    retailersReached: Number(r.retailers_reached) || 0,
    newRetailers: Number(r.new_retailers) || 0,
    visits: Number(r.visits) || 0
  })).sort((a, b) => b.revenue - a.revenue)

  return {
    success: true,
    label: range.label,
    summary,
    rows: rows.slice(0, SALES_PAGE_ROWS),
    hasMore: rows.length > SALES_PAGE_ROWS,
    offset
  }
}

export async function createSaleRecord(formData: FormData) {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user || !(await isSessionValid())) {
    return { error: "Session expired. Please log in again." }
  }

  const retailer_id = formData.get('retailer_id') as string
  const rawQty = formData.get('order_qty') as string
  const amount = parseFloat(formData.get('amount') as string) || 0
  const notes = formData.get('notes') as string // JSON string of products array
  const payment_status = (formData.get('payment_status') as string) || 'credit'
  const cash_amount = parseFloat(formData.get('cash_amount') as string) || 0
  const online_amount = parseFloat(formData.get('online_amount') as string) || 0
  const clientDue = parseFloat(formData.get('due_amount') as string)
  const delivery_status = (formData.get('delivery_status') as string) || 'delivered'

  // Automatically stamp current date & time. The order's date is the India date
  // (an order at 2 am IST belongs to that day, not the day before).
  const now = new Date()
  const datePart = istDate(now.toISOString())
  const createdAt = now.toISOString()
  const deliveredAt = delivery_status === 'delivered' ? createdAt : null

  let parsedQty = parseInt(rawQty, 10)
  if (isNaN(parsedQty) || parsedQty <= 0) {
    parsedQty = 1
  }

  if (!retailer_id) return { error: 'Please select a retailer.' }
  if ([amount, cash_amount, online_amount].some(n => !Number.isFinite(n) || n < 0)) {
    return { error: 'Amounts cannot be negative.' }
  }

  // The payment split must add up. The saved due is always worked out here from the amounts.
  if (!['paid', 'partial', 'credit'].includes(payment_status)) return { error: 'Invalid payment status.' }
  if (!['delivered', 'pending'].includes(delivery_status)) return { error: 'Invalid delivery status.' }
  const paidNow = cash_amount + online_amount
  if (paidNow > amount + 1) {
    return { error: `Cash and online together (₹${paidNow.toLocaleString('en-IN')}) cannot be more than the order amount (₹${amount.toLocaleString('en-IN')}).` }
  }
  const due_amount = Math.round(Math.max(0, amount - paidNow) * 100) / 100
  if (Number.isFinite(clientDue) && Math.abs(clientDue - due_amount) > 1) {
    return { error: 'The cash, online and due amounts do not add up to the order amount. Please check them and try again.' }
  }

  // The three checks below don't depend on each other, so they run at the same time
  // (one wait instead of three, which matters on a slow mobile connection).
  // Same order saved twice (double tap, or a retry after a slow connection): the second
  // is refused if this sales person already saved an identical order a moment ago.
  const since = new Date(now.getTime() - 60_000).toISOString()
  let recentQuery = supabase.from('sales_records').select('id').eq('retailer_id', retailer_id)
    .eq('sales_person_id', user.id).eq('amount', amount).gte('created_at', since).limit(1)
  if (notes) recentQuery = recentQuery.eq('notes', notes)
  const [removed, recentRes, shiftRes] = await Promise.all([
    retailerRemovedError(retailer_id),
    recentQuery,
    // does the sales rep have an active shift?
    supabase.from('shifts').select('id').eq('user_id', user?.id).eq('status', 'active')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
  ])
  if (removed) return { error: removed }
  if (recentRes.data && recentRes.data.length > 0) {
    return { error: 'This same order was already saved a moment ago, so it was not saved again. Check the orders list.' }
  }
  const activeShift = shiftRes.data

  const saleRow = {
    retailer_id,
    date: datePart,
    created_at: createdAt,
    order_qty: parsedQty,
    amount,
    notes: notes || null,
    payment_status,
    cash_amount,
    online_amount,
    due_amount,
    delivery_status,
    delivered_at: deliveredAt,
    sales_person_id: user?.id
  }
  let { data: newSale, error } = await supabase.from('sales_records').insert(saleRow).select().single()

  // If the delivery columns aren't in the database yet (20261111_sales_delivery_columns.sql
  // not run), save the order without them rather than losing it, and say so
  let deliveryWarning: string | undefined
  // (leave out only the column that is missing, so a Pending order still saves as Pending
  // when just delivered_at is missing)
  if (error && /delivered_at/.test(error.message) && !/delivery_status/.test(error.message)) {
    const { delivered_at: _da, ...withoutDate } = saleRow
    const retry = await supabase.from('sales_records').insert(withoutDate).select().single()
    newSale = retry.data
    error = retry.error
    if (!error) deliveryWarning = 'Order saved, but its delivery date was not recorded: run supabase/migrations/20261111_sales_delivery_columns.sql in Supabase.'
  }
  if (error && /delivery_status/.test(error.message)) {
    const { delivery_status: _ds, delivered_at: _da, ...withoutDelivery } = saleRow
    const retry = await supabase.from('sales_records').insert(withoutDelivery).select().single()
    newSale = retry.data
    error = retry.error
    if (!error) deliveryWarning = 'Order saved, but its delivery status was not recorded: run supabase/migrations/20261111_sales_delivery_columns.sql in Supabase.'
  }

  if (error) return { error: error.message }

  // Log the order as a verified visit, and (if the rep is on a running shift) add it to the
  // shift's totals in one atomic database update, so two orders at the same moment can't
  // overwrite each other. The two don't depend on each other, so they run together.
  const [visitRes, shiftRpc] = await Promise.all([
    supabase.from('retailer_visits').insert({
      retailer_id,
      sales_person_id: user?.id,
      shift_id: activeShift?.id || null,
      visit_type: 'order',
      notes: `Order booked: ₹${amount.toLocaleString('en-IN')}`,
      created_at: createdAt
    }),
    activeShift
      ? supabase.rpc('fn_record_sale_on_shift', {
          p_shift_id: activeShift.id,
          p_order_value: amount,
          p_cash_amount: cash_amount,
          p_online_amount: online_amount,
          p_due_amount: due_amount
        })
      : Promise.resolve({ error: null })
  ])
  if (visitRes.error) console.error('Sale saved but visit log failed:', newSale?.id, visitRes.error)
  const shiftErr = shiftRpc.error
  if (shiftErr) {
    console.error('Sale saved but shift totals not updated:', newSale?.id, shiftErr)
    revalidatePath('/dashboard/sales')
    revalidatePath('/dashboard')
    return {
      success: true,
      sale: newSale,
      warning: ['Order saved, but your shift totals could not be updated. Please tell your manager.', deliveryWarning].filter(Boolean).join(' ')
    }
  }

  revalidatePath('/dashboard/sales')
  revalidatePath('/dashboard')
  return { success: true, sale: newSale, warning: deliveryWarning }
}

// Log "No Order" Retailer Visit
export async function logNoOrderVisit(formData: FormData) {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user || !(await isSessionValid())) {
    return { error: "Session expired. Please log in again." }
  }

  const retailer_id = formData.get('retailer_id') as string
  const no_order_reason = formData.get('no_order_reason') as string
  const notes = formData.get('notes') as string
  const geo_location = formData.get('geo_location') as string

  if (!retailer_id) return { error: 'Please select a retailer.' }

  const removed = await retailerRemovedError(retailer_id)
  if (removed) return { error: removed }

  // Check if rep has active shift
  const { data: activeShift } = await supabase
    .from('shifts')
    .select('id')
    .eq('user_id', user?.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await supabase.from('retailer_visits').insert({
    retailer_id,
    sales_person_id: user?.id,
    shift_id: activeShift?.id || null,
    visit_type: 'no_order',
    no_order_reason,
    notes: notes || null,
    geo_location: geo_location || null,
    created_at: new Date().toISOString()
  }).select().single()

  if (error) return { error: error.message }

  // Increment visit count in active shift (atomic)
  if (activeShift) {
    const { error: shiftErr } = await supabase.rpc('fn_increment_shift_visits', { p_shift_id: activeShift.id })
    if (shiftErr) console.error('Visit saved but shift visit count not updated:', data?.id, shiftErr)
  }

  revalidatePath('/dashboard/sales')
  revalidatePath('/dashboard')
  return { success: true, visit: data }
}

// Update Delivery Status on a Sale Record
export async function updateSaleDeliveryStatus(saleId: string, deliveryStatus: 'pending' | 'delivered' | 'cancelled') {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user || !(await isSessionValid())) {
    return { error: "Session expired. Please log in again." }
  }

  if (!saleId) return { error: "Sale ID is required." }

  const delivered_at = deliveryStatus === 'delivered' ? new Date().toISOString() : null

  const { data, error } = await supabase
    .from('sales_records')
    .update({
      delivery_status: deliveryStatus,
      delivered_at
    })
    .eq('id', saleId)
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath('/dashboard/sales')
  revalidatePath('/dashboard')
  return { success: true, sale: data }
}

// Record Payment Collection for an Existing Order
// One database step (fn_record_sale_payment): locks the order so two payments at
// the same moment can't overwrite each other, refuses more than is due, adds the
// money to the collector's running shift, and keeps a record of the payment.
export async function collectSalePayment(
  saleId: string,
  paymentData: { cashAmount: number; onlineAmount: number }
) {
  const supabase = await createClient()
  const user = await getCachedUser()
  if (!user || !(await isSessionValid())) {
    return { error: "Session expired. Please log in again." }
  }

  if (!saleId) return { error: "Sale ID is required." }

  const cash = Number(paymentData.cashAmount) || 0
  const online = Number(paymentData.onlineAmount) || 0
  if (!Number.isFinite(cash) || !Number.isFinite(online) || cash < 0 || online < 0) {
    return { error: "Amounts cannot be negative." }
  }
  if (cash + online <= 0) {
    return { error: "Payment amount must be greater than zero." }
  }

  const role = (user.app_metadata?.role || '').toLowerCase()
  const { data: result, error } = await supabaseAdmin.rpc('fn_record_sale_payment', {
    p_sale_id: String(saleId),
    p_cash: cash,
    p_online: online,
    p_user_id: user.id,
    p_user_name: (user.user_metadata?.name as string) || user.email || null,
    p_is_management: role === 'admin' || role === 'manager'
  })
  if (error) {
    return {
      error: /fn_record_sale_payment/.test(error.message)
        ? 'Payment recording is not set up yet: run supabase/migrations/20261110_sales_payments.sql in Supabase. Nothing was saved.'
        : error.message
    }
  }

  const { data: updated } = await supabaseAdmin.from('sales_records').select('*').eq('id', saleId).maybeSingle()

  revalidatePath('/dashboard/sales')
  revalidatePath('/dashboard')
  return {
    success: true,
    sale: updated,
    addedToShift: !!(result as any)?.addedToShift,
    warning: (result as any)?.addedToShift ? undefined : 'Payment saved on the order. You have no running shift, so it was not added to a shift.'
  }
}

// Fetch Retailer Visits
export async function fetchRetailerVisits(limit = 50) {
  const supabase = await createClient()
  const user = await getCachedUser()
  const role = user?.app_metadata?.role

  let query = supabase.from('retailer_visits').select(`
    *,
    retailers (id, name, shop_name, territory, address, phone)
  `).order('created_at', { ascending: false }).limit(limit)

  if (role !== 'admin' && role !== 'manager') {
    query = query.eq('sales_person_id', user?.id)
  }

  const { data, error } = await query
  if (error) {
    console.error("Fetch Visits Error:", error.message)
    return []
  }
  return data || []
}

// -----------------------------------------------------------------------------
// Weekly allowance (admins only)
//
// For each person, for one week (Monday to Sunday, India time):
//   food    = days present x their Food Allowance / DA rate (per day)
//   travel  = km travelled x their Bike Allowance rate (per km)
//   total   = food + travel
// A day counts as present if they started at least one shift that day (same rule
// as the dashboard attendance). Km come from ended shifts (closing minus opening
// odometer); a shift still running has its km counted once it is ended.
// Rates are the ones set for each user on the Users page. A week marked as paid
// always shows the amounts saved at that moment (allowance_payouts).
// -----------------------------------------------------------------------------
export type AllowanceDay = { date: string; shifts: number; km: number; openShifts: number; edited?: boolean }
export type AllowanceRow = {
  userId: string
  name: string
  role: string
  daysPresent: number
  foodRate: number
  food: number
  km: number
  kmRate: number
  travel: number
  total: number
  openShifts: number
  noRates: boolean
  /** One-off extra amount (+ or -) added by an admin correction; included in total */
  extra: number
  /** An admin corrected something in this person's week */
  edited: boolean
  days: AllowanceDay[]
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

function allowanceRates(meta: any) {
  const list = Array.isArray(meta?.allowances) ? meta.allowances : []
  const rateOf = (id: string) => {
    const a = list.find((x: any) => (x && typeof x === 'object' ? x.id : x) === id)
    const r = a && typeof a === 'object' ? Number(a.rate) : 0
    return Number.isFinite(r) && r > 0 ? r : 0
  }
  return { foodRate: rateOf('food_da'), kmRate: rateOf('bike_allowance') }
}

function shiftKm(s: any) {
  if (!['completed', 'ended'].includes(String(s.status || '').toLowerCase())) return null // still running
  const total = Number(s.total_distance)
  if (Number.isFinite(total) && total > 0) return total
  const start = Number(s.odometer_start), end = Number(s.odometer_end)
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) return end - start
  return 0
}

type WeekTotals = { food: number; travel: number; total: number; km: number; days: number }

function sumTotals(rows: AllowanceRow[]): WeekTotals {
  return rows.reduce((t, r) => ({
    food: round2(t.food + r.food), travel: round2(t.travel + r.travel), total: round2(t.total + r.total),
    km: round2(t.km + r.km), days: t.days + r.daysPresent
  }), { food: 0, travel: 0, total: 0, km: 0, days: 0 })
}

type CorrRow = any

const missingCorrTable = (message: string) =>
  /allowance_corrections|fn_save_allowance_correction|fn_allowance_corr_token/.test(message) && /does not exist|schema cache|not find/i.test(message)
const CORR_SQL = 'Allowance corrections are not set up yet: run supabase/migrations/20261118_allowance_corrections.sql in Supabase. Nothing was changed.'

/**
 * The live (not retired) corrections for weeks between two Mondays. If the table
 * isn't set up yet there are none; any other read problem stops the report, because
 * showing amounts without the corrections would be wrong.
 */
async function loadCorrections(fromMonday: string, toMonday: string): Promise<CorrRow[]> {
  try {
    return await selectAllPages((a, b) =>
      supabaseAdmin.from('allowance_corrections').select('*')
        .gte('week_start', fromMonday).lte('week_start', toMonday).is('cancelled_at', null)
        .order('id', { ascending: true }).range(a, b)
    ) as CorrRow[]
  } catch (err) {
    if (missingCorrTable(err instanceof Error ? err.message : String(err))) return []
    throw err
  }
}

const ymd = (v: any) => String(v || '').slice(0, 10)

/** Put a person's live corrections on top of the days worked out from shifts. */
function applyCorrections(perDay: Map<string, AllowanceDay>, corrs: CorrRow[]) {
  let extra = 0
  let edited = false
  for (const c of corrs) {
    edited = true
    if (c.day_date) {
      const date = ymd(c.day_date)
      if (!c.present) { perDay.delete(date); continue }
      const old = perDay.get(date)
      perDay.set(date, { date, shifts: old?.shifts ?? 0, km: round2(Number(c.km) || 0), openShifts: old?.openShifts ?? 0, edited: true })
    } else {
      extra = round2(extra + (Number(c.extra_amount) || 0))
    }
  }
  return { extra, edited }
}

/** One saved correction, as shown in the Corrections sheet of the Excel reports. */
export type CorrectionRecord = {
  id: string; weekStart: string; userId: string; userName: string
  date: string | null            // null = the one-off extra amount
  present: boolean | null; km: number | null
  origPresent: boolean | null; origShifts: number | null; origKm: number | null
  extra: number | null
  reason: string; createdAt: string; createdByName: string
  cancelledAt: string | null; cancelledByName: string; cancelledReason: string
}

/** Every correction (also retired ones) for weeks between two Mondays, oldest first. Read-only. */
async function loadCorrectionHistory(fromMonday: string, toMonday: string): Promise<CorrectionRecord[]> {
  let rows: CorrRow[] = []
  try {
    rows = await selectAllPages((a, b) =>
      supabaseAdmin.from('allowance_corrections').select('*')
        .gte('week_start', fromMonday).lte('week_start', toMonday)
        .order('created_at', { ascending: true }).order('id', { ascending: true }).range(a, b)
    ) as CorrRow[]
  } catch (err) {
    if (missingCorrTable(err instanceof Error ? err.message : String(err))) return []
    throw err
  }
  const num = (v: any) => (v === null || v === undefined ? null : Number(v))
  return rows.map(c => ({
    id: c.id, weekStart: ymd(c.week_start), userId: c.user_id, userName: c.user_name || '',
    date: c.day_date ? ymd(c.day_date) : null,
    present: c.present ?? null, km: num(c.km),
    origPresent: c.orig_present ?? null, origShifts: num(c.orig_shifts), origKm: num(c.orig_km),
    extra: num(c.extra_amount),
    reason: c.reason || '', createdAt: c.created_at, createdByName: c.created_by_name || '',
    cancelledAt: c.cancelled_at || null, cancelledByName: c.cancelled_by_name || '', cancelledReason: c.cancelled_reason || ''
  }))
}

async function requireAdmin(): Promise<{ user: any } | { error: string }> {
  const user = await getCachedUser()
  const role = (user?.app_metadata?.role || '').toLowerCase()
  if (!user || role !== 'admin') return { error: 'Only admins can see allowances.' }
  if (!(await isSessionValid())) return { error: 'Session expired. Please log in again.' }
  return { user }
}

/** The week worked out from shifts and today's rates. */
const SHIFT_COLUMNS = 'id, user_id, status, start_time, created_at, odometer_start, odometer_end, total_distance'
// Extra details only the Excel report needs (kept separate, so the tab never depends on them)
const SHIFT_REPORT_COLUMNS = SHIFT_COLUMNS + ', end_time, vehicle_type, start_location, end_location, total_paused_seconds, orders_count, visits_count, total_order_value, cash_collected, online_collected, market_due'

async function liveWeek(monday: string, detailed = false) {
  const week = weekRange(monday)
  const [shifts, users, corrections] = await Promise.all([
    selectAllPages((from, to) =>
      supabaseAdmin.from('shifts')
        .select(detailed ? SHIFT_REPORT_COLUMNS : SHIFT_COLUMNS)
        // shifts started this week (older shifts without a start time go by when they were created)
        .or(`and(start_time.gte.${week.from},start_time.lt.${week.to}),and(start_time.is.null,created_at.gte.${week.from},created_at.lt.${week.to})`)
        .order('id', { ascending: true })
        .range(from, to)
    ),
    listAllUsersCached(),
    loadCorrections(monday, monday)
  ])

  const byUser = new Map<string, any[]>()
  for (const s of shifts as any[]) {
    if (!s.user_id) continue
    const list = byUser.get(s.user_id) || []
    list.push(s)
    byUser.set(s.user_id, list)
  }
  const corrByUser = new Map<string, CorrRow[]>()
  for (const c of corrections) {
    const l = corrByUser.get(c.user_id) || []
    l.push(c)
    corrByUser.set(c.user_id, l)
  }
  /** What the shifts say, before any correction (used by the edit window) */
  const origByUser = new Map<string, AllowanceDay[]>()

  const rows: AllowanceRow[] = []
  for (const u of users) {
    const { foodRate, kmRate } = allowanceRates(u.app_metadata)
    const mine = byUser.get(u.id) || []
    const myCorr = corrByUser.get(u.id) || []
    // Show everyone who worked this week, and everyone who has an allowance rate set (or a correction)
    if (mine.length === 0 && foodRate === 0 && kmRate === 0 && myCorr.length === 0) continue

    const perDay = new Map<string, AllowanceDay>()
    for (const s of mine) {
      const date = istDate(s.start_time || s.created_at)
      const day = perDay.get(date) || { date, shifts: 0, km: 0, openShifts: 0 }
      day.shifts += 1
      const km = shiftKm(s)
      if (km === null) day.openShifts += 1
      else day.km = round2(day.km + km)
      perDay.set(date, day)
    }
    origByUser.set(u.id, [...perDay.values()].map(d => ({ ...d })).sort((a, b) => a.date.localeCompare(b.date)))
    const { extra, edited } = applyCorrections(perDay, myCorr)
    const days = [...perDay.values()].sort((a, b) => a.date.localeCompare(b.date))
    const daysPresent = days.length
    const km = round2(days.reduce((t, x) => t + x.km, 0))
    const food = round2(daysPresent * foodRate)
    const travel = round2(km * kmRate)
    rows.push({
      userId: u.id,
      name: u.user_metadata?.name || u.user_metadata?.full_name || u.email?.split('@')[0] || 'User',
      role: u.app_metadata?.role || '',
      daysPresent,
      foodRate,
      food,
      km,
      kmRate,
      travel,
      extra,
      edited,
      total: round2(food + travel + extra),
      openShifts: days.reduce((t, x) => t + x.openShifts, 0),
      noRates: foodRate === 0 && kmRate === 0,
      days
    })
  }
  rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  return { week, rows, totals: sumTotals(rows), weekEnded: today > week.sunday, users, byUser, origByUser }
}

export type AllowancePaidInfo = { paidAt: string; paidByName: string; liveTotal: number; changedSincePaid: boolean }

type WeekView = { success: true; monday: string; label: string; rows: AllowanceRow[]; totals: WeekTotals; weekEnded: boolean; paid: AllowancePaidInfo | null }

export async function fetchWeeklyAllowances(weekStart?: string): Promise<WeekView | { error: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }
  try {
    return (await weekView(weekStart)).view
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

async function weekView(weekStart?: string, detailed = false): Promise<{ view: WeekView; live: Awaited<ReturnType<typeof liveWeek>> }> {
  const monday = mondayOf(isYmd(weekStart) ? weekStart : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))
  {
    const [live, paidRes] = await Promise.all([
      liveWeek(monday, detailed),
      supabaseAdmin.from('allowance_payouts').select('*').eq('week_start', monday).is('cancelled_at', null)
    ])
    // Paid-weeks table not set up yet: show the live figures (nothing can be marked paid)
    const paidRows = paidRes.error ? [] : (paidRes.data || [])

    if (paidRows.length === 0) {
      return { live, view: { success: true, monday, label: live.week.label, rows: live.rows, totals: live.totals, weekEnded: live.weekEnded, paid: null } }
    }

    // Paid week: always the amounts saved when it was marked paid
    const roles = new Map(live.users.map((u: any) => [u.id, u.app_metadata?.role || '']))
    const rows: AllowanceRow[] = paidRows.map((p: any) => ({
      userId: p.user_id,
      name: p.user_name || 'User',
      role: roles.get(p.user_id) || '',
      daysPresent: Number(p.days_present) || 0,
      foodRate: Number(p.food_rate) || 0,
      food: Number(p.food_amount) || 0,
      km: Number(p.km) || 0,
      kmRate: Number(p.km_rate) || 0,
      travel: Number(p.travel_amount) || 0,
      total: Number(p.total_amount) || 0,
      openShifts: 0,
      noRates: !(Number(p.food_rate) > 0) && !(Number(p.km_rate) > 0),
      // a one-off extra is saved inside the total: extra = total - food - travel
      extra: round2((Number(p.total_amount) || 0) - (Number(p.food_amount) || 0) - (Number(p.travel_amount) || 0)),
      edited: false,
      days: Array.isArray(p.days) ? p.days : []
    })).map((r: AllowanceRow) => ({ ...r, edited: r.extra !== 0 || r.days.some(d => d && d.edited) })).sort((a: AllowanceRow, b: AllowanceRow) => b.total - a.total || a.name.localeCompare(b.name))
    const totals = sumTotals(rows)
    const liveWorked = live.rows.filter(r => r.daysPresent > 0)
    const changed = Math.abs(live.totals.total - totals.total) > 0.005 ||
      liveWorked.length !== rows.length || liveWorked.some(r => !rows.find(x => x.userId === r.userId))
    return {
      live,
      view: {
        success: true, monday, label: live.week.label, rows, totals, weekEnded: live.weekEnded,
        paid: { paidAt: paidRows[0].paid_at, paidByName: paidRows[0].paid_by_name || '', liveTotal: live.totals.total, changedSincePaid: changed }
      }
    }
  }
}

export type AllowanceShift = {
  date: string
  start: string | null
  end: string | null
  status: string
  vehicle: string
  odometerStart: number | null
  odometerEnd: number | null
  km: number | null // null = still running
  pausedMinutes: number
  startLocation: string
  endLocation: string
  orders: number
  visits: number
  orderValue: number
  cash: number
  online: number
  due: number
}

/** Everything for the detailed Excel report: the week as shown, plus every shift per person. Read-only. */
export async function fetchWeeklyAllowanceReport(weekStart?: string): Promise<
  (WeekView & { shifts: Record<string, AllowanceShift[]>; corrections: CorrectionRecord[] }) | { error: string }
> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }
  try {
    const { view, live } = await weekView(weekStart, true)
    const n = (v: any) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
    const shifts: Record<string, AllowanceShift[]> = {}
    for (const r of view.rows) {
      shifts[r.userId] = (live.byUser.get(r.userId) || [])
        .map((s: any) => ({
          date: istDate(s.start_time || s.created_at),
          start: s.start_time || s.created_at || null,
          end: s.end_time || null,
          status: String(s.status || ''),
          vehicle: s.vehicle_type || '',
          odometerStart: n(s.odometer_start),
          odometerEnd: n(s.odometer_end),
          km: shiftKm(s),
          pausedMinutes: Math.round((Number(s.total_paused_seconds) || 0) / 60),
          startLocation: s.start_location || '',
          endLocation: s.end_location || '',
          orders: Number(s.orders_count) || 0,
          visits: Number(s.visits_count) || 0,
          orderValue: Number(s.total_order_value) || 0,
          cash: Number(s.cash_collected) || 0,
          online: Number(s.online_collected) || 0,
          due: Number(s.market_due) || 0
        }))
        .sort((a: AllowanceShift, b: AllowanceShift) => String(a.start).localeCompare(String(b.start)))
    }
    const corrections = await loadCorrectionHistory(view.monday, view.monday)
    return { ...view, shifts, corrections }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Mark a finished week as paid: saves each person's figures exactly as shown, so
 * the week never changes afterwards. Refuses if the figures changed since they
 * were shown (expectedTotal), if a shift that week is still running, or if the
 * week hasn't ended yet.
 */
export async function markAllowanceWeekPaid(monday: string, expectedTotal: number): Promise<{ success: true; people: number; total: number } | { error: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }
  if (!isYmd(monday) || mondayOf(monday) !== monday) return { error: 'Choose a week first.' }

  try {
    const live = await liveWeek(monday)
    if (!live.weekEnded) return { error: 'This week has not ended yet. A week can be marked paid from the Monday after.' }
    const running = live.rows.reduce((t, r) => t + r.openShifts, 0)
    if (running > 0) return { error: `${running} shift${running > 1 ? 's' : ''} in this week ${running > 1 ? 'are' : 'is'} still running. End ${running > 1 ? 'them' : 'it'} first, so the km are counted.` }
    if (Math.abs(live.totals.total - Number(expectedTotal)) > 0.005) {
      return { error: `The figures changed since you opened this week (now ₹${live.totals.total.toLocaleString('en-IN')}). Nothing was saved. Check the new figures and try again.` }
    }
    // anyone with days present, or with a one-off extra amount to pay
    const worked = live.rows.filter(r => r.daysPresent > 0 || r.extra !== 0)
    if (worked.length === 0) return { error: 'Nobody worked this week, so there is nothing to mark as paid.' }
    if (worked.some(r => r.total < 0)) return { error: 'A correction makes someone\'s total negative. Open their Edit window and fix it first. Nothing was saved.' }

    const paidByName = (auth.user.user_metadata?.name as string) || auth.user.email || null
    // One request = all or nothing
    const { error } = await supabaseAdmin.from('allowance_payouts').insert(worked.map(r => ({
      week_start: monday,
      user_id: r.userId,
      user_name: r.name,
      days_present: r.daysPresent,
      food_rate: r.foodRate,
      food_amount: r.food,
      km: r.km,
      km_rate: r.kmRate,
      travel_amount: r.travel,
      total_amount: r.total,
      days: r.days,
      paid_by: auth.user.id,
      paid_by_name: paidByName
    })))
    if (error) {
      if (/uq_allowance_payouts_week_user|duplicate key/.test(error.message)) return { error: 'This week is already marked as paid.' }
      if (/allowance_payouts/.test(error.message) && /does not exist|schema cache/.test(error.message)) {
        return { error: 'Paid weeks are not set up yet: run supabase/migrations/20261113_allowance_payouts.sql in Supabase. Nothing was saved.' }
      }
      return { error: error.message }
    }
    // Once saved, corrections for this week are refused by the database. If one was saved
    // between reading the figures and saving them, the saved amounts would be missing it:
    // check, and if so take the paid marks back (they are kept, marked cancelled).
    const after = await liveWeek(monday)
    if (Math.abs(after.totals.total - live.totals.total) > 0.005) {
      await supabaseAdmin.from('allowance_payouts')
        .update({ cancelled_at: new Date().toISOString(), cancelled_by: auth.user.id, cancelled_by_name: 'Automatic: figures changed while saving' })
        .eq('week_start', monday).is('cancelled_at', null)
      return { error: 'The figures changed while saving, so the week was NOT marked as paid. Check the new figures and try again.' }
    }
    revalidatePath('/dashboard/sales')
    return { success: true, people: worked.length, total: sumTotals(worked).total }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/** Undo "paid" for a week marked by mistake (delete password). The saved records are kept, marked cancelled. */
export async function undoAllowanceWeekPaid(monday: string, deletePassword: string): Promise<{ success: true } | { error: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }
  const pwError = checkDeletePassword(deletePassword)
  if (pwError) return { error: pwError }
  if (!isYmd(monday) || mondayOf(monday) !== monday) return { error: 'Choose a week first.' }

  const { data, error } = await supabaseAdmin.from('allowance_payouts')
    .update({
      cancelled_at: new Date().toISOString(),
      cancelled_by: auth.user.id,
      cancelled_by_name: (auth.user.user_metadata?.name as string) || auth.user.email || null
    })
    .eq('week_start', monday)
    .is('cancelled_at', null)
    .select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: 'This week is not marked as paid.' }
  revalidatePath('/dashboard/sales')
  return { success: true }
}

// -----------------------------------------------------------------------------
// Admin: correct one person's week, day by day (20261118_allowance_corrections.sql)
//
// The shifts are never changed. A correction (present / absent, km, one-off extra)
// sits on top of them. A paid week can't be corrected (Undo paid first). Every
// save is kept with who, when and why; nothing is deleted.
// -----------------------------------------------------------------------------
export type EditDay = {
  date: string
  origShifts: number; origPresent: boolean; origKm: number; openShifts: number   // what the shifts say
  present: boolean; km: number; edited: boolean                                  // as it stands now
}
export type AllowanceEditData = {
  success: true
  monday: string; label: string; userId: string; name: string
  foodRate: number; kmRate: number
  days: EditDay[]
  extra: number
  token: string          // version of this person's week; must be sent back when saving
  today: string
  history: CorrectionRecord[]
}

const isUuid = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

async function paidFor(monday: string, userId: string) {
  const { data, error } = await supabaseAdmin.from('allowance_payouts').select('id')
    .eq('week_start', monday).eq('user_id', userId).is('cancelled_at', null).limit(1)
  if (error) throw new Error(error.message)
  return (data || []).length > 0
}

async function corrToken(monday: string, userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc('fn_allowance_corr_token', { p_week: monday, p_user: userId })
  if (error) throw new Error(error.message)
  return String(data ?? '')
}

export async function fetchAllowanceEditData(monday: string, userId: string): Promise<AllowanceEditData | { error: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }
  if (!isYmd(monday) || mondayOf(monday) !== monday || !isUuid(userId)) return { error: 'Choose a person and a week first.' }
  try {
    if (await paidFor(monday, userId)) return { error: 'This week is marked as paid. Press "Undo paid" first, then correct it and mark it paid again.' }
    // The version is read BEFORE the figures: if someone saves in between, our save is refused, never the other way round.
    const token = await corrToken(monday, userId)
    const live = await liveWeek(monday)
    const user = live.users.find((u: any) => u.id === userId)
    const row = live.rows.find(r => r.userId === userId)
    if (!user || !row) return { error: 'This person was not found.' }
    const { foodRate, kmRate } = allowanceRates(user.app_metadata)
    const orig = new Map((live.origByUser.get(userId) || []).map(d => [d.date, d]))
    const now = new Map(row.days.map(d => [d.date, d]))
    const days: EditDay[] = []
    for (let i = 0; i < 7; i++) {
      const date = addDays(monday, i)
      const o = orig.get(date), c = now.get(date)
      days.push({
        date,
        origShifts: o?.shifts ?? 0, origPresent: !!o, origKm: o?.km ?? 0, openShifts: o?.openShifts ?? 0,
        present: !!c, km: c?.km ?? 0,
        edited: (!!o !== !!c) || (!!o && !!c && Math.abs((o?.km ?? 0) - (c?.km ?? 0)) > 0.004)
      })
    }
    const history = (await loadCorrectionHistory(monday, monday)).filter(h => h.userId === userId)
    return {
      success: true, monday, label: live.week.label, userId, name: row.name,
      foodRate, kmRate, days, extra: row.extra, token, today: todayIST(), history
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { error: missingCorrTable(msg) ? CORR_SQL : msg }
  }
}

export async function saveAllowanceCorrection(
  monday: string, userId: string,
  days: { date: string; present: boolean; km: number }[],
  extra: number, reason: string, token: string, deletePassword: string
): Promise<{ success: true } | { error: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }
  const pwError = checkDeletePassword(deletePassword)
  if (pwError) return { error: pwError.replace('Nothing was deleted.', 'Nothing was saved.') }
  if (!isYmd(monday) || mondayOf(monday) !== monday || !isUuid(userId)) return { error: 'Choose a person and a week first.' }
  if (!Array.isArray(days) || days.length > 7) return { error: 'Something is wrong with the days. Nothing was saved.' }
  const extraAmt = round2(Number(extra) || 0)
  if (!Number.isFinite(extraAmt) || Math.abs(extraAmt) > 100000) return { error: 'The extra amount looks wrong. Nothing was saved.' }

  try {
    if (await paidFor(monday, userId)) return { error: 'This week is marked as paid. Press "Undo paid" first, then correct it and mark it paid again.' }
    const live = await liveWeek(monday)
    const user = live.users.find((u: any) => u.id === userId)
    if (!user) return { error: 'This person was not found.' }
    const { foodRate, kmRate } = allowanceRates(user.app_metadata)
    const orig = new Map((live.origByUser.get(userId) || []).map(d => [d.date, d]))
    const today = todayIST()
    const week = weekRange(monday)

    const changes: { date: string; present: boolean; km: number; orig_present: boolean; orig_shifts: number; orig_km: number }[] = []
    const seen = new Set<string>()
    for (const d of days) {
      if (!d || !isYmd(d.date) || d.date < monday || d.date > week.sunday || seen.has(d.date)) return { error: 'Something is wrong with the days. Nothing was saved.' }
      seen.add(d.date)
      if (d.date > today) return { error: 'A day that has not happened yet cannot be marked present.' }
      const km = round2(Number(d.km) || 0)
      if (d.present && (!Number.isFinite(km) || km < 0 || km > 2000)) return { error: `The km for ${d.date} look wrong. Nothing was saved.` }
      const o = orig.get(d.date)
      const present = !!d.present
      const finalKm = present ? km : 0
      const same = present === !!o && (!present || Math.abs(finalKm - (o?.km ?? 0)) < 0.005)
      if (!same) changes.push({ date: d.date, present, km: finalKm, orig_present: !!o, orig_shifts: o?.shifts ?? 0, orig_km: o?.km ?? 0 })
    }

    // The total must not go below zero
    const finalDays = new Map([...orig.entries()].map(([k, v]) => [k, v.km]))
    for (const c of changes) { if (c.present) finalDays.set(c.date, c.km); else finalDays.delete(c.date) }
    const km = round2([...finalDays.values()].reduce((t, x) => t + x, 0))
    const total = round2(finalDays.size * foodRate + round2(km * kmRate) + extraAmt)
    if (total < 0) return { error: 'The extra amount would make the total negative. Nothing was saved.' }

    const name = (user.user_metadata?.name as string) || (user.user_metadata?.full_name as string) || user.email?.split('@')[0] || 'User'
    const byName = (auth.user.user_metadata?.name as string) || auth.user.email || null
    const { error } = await supabaseAdmin.rpc('fn_save_allowance_correction', {
      p_week: monday, p_user_id: userId, p_user_name: name,
      p_days: changes, p_extra: extraAmt, p_reason: reason || '', p_expected_token: String(token ?? ''),
      p_by_id: auth.user.id, p_by_name: byName
    })
    if (error) {
      const m = error.message || ''
      if (missingCorrTable(m)) return { error: CORR_SQL }
      if (/ALLOWANCE_STALE/.test(m)) return { error: 'This person\'s week was changed by someone else while you were editing. Nothing was saved. Close this window, open it again and redo your change.' }
      if (/ALLOWANCE_WEEK_PAID/.test(m)) return { error: 'This week was just marked as paid. Nothing was saved. Press "Undo paid" first if it needs correcting.' }
      if (/ALLOWANCE_NEEDS_REASON/.test(m)) return { error: 'Please write a short reason for the correction.' }
      return { error: m }
    }
    revalidatePath('/dashboard/sales')
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { error: missingCorrTable(msg) ? CORR_SQL : msg }
  }
}

// -----------------------------------------------------------------------------
// Monthly allowance report (admins only, read-only)
//
// One calendar month (India time). Days in weeks already marked as paid use the
// days, km and rates saved when that week was paid, so the month always matches
// what was paid week by week. Other days use the shifts and today's rates.
// -----------------------------------------------------------------------------
export type MonthDay = { date: string; shifts: number; km: number; openShifts: number; foodRate: number; kmRate: number; food: number; travel: number; paid: boolean }
export type MonthPerson = {
  userId: string; name: string; role: string; daysPresent: number; km: number; food: number; travel: number; extra: number; total: number
  openShifts: number; noRates: boolean; foodRate: number; kmRate: number; days: MonthDay[]
}
export type MonthWeek = { monday: string; label: string; paid: boolean; paidAt: string | null; paidByName: string }

export async function fetchAllowanceMonthReport(month: string): Promise<
  | { success: true; month: string; label: string; people: MonthPerson[]; weeks: MonthWeek[]; shifts: Record<string, AllowanceShift[]>; totals: WeekTotals; monthEnded: boolean; corrections: CorrectionRecord[] }
  | { error: string }
> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) return { error: 'Choose a month.' }

  const [y, m] = month.split('-').map(Number)
  const first = `${month}-01`
  const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  const from = `${first}T00:00:00+05:30`, to = `${nextMonth}T00:00:00+05:30`
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const lastDate = `${month}-${String(lastDay).padStart(2, '0')}`
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

  try {
    const [shiftRows, users, paidRes, activeCorr, corrHistory] = await Promise.all([
      selectAllPages((a, b) =>
        supabaseAdmin.from('shifts')
          .select(SHIFT_REPORT_COLUMNS)
          .or(`and(start_time.gte.${from},start_time.lt.${to}),and(start_time.is.null,created_at.gte.${from},created_at.lt.${to})`)
          .order('id', { ascending: true })
          .range(a, b)
      ),
      listAllUsersCached(),
      supabaseAdmin.from('allowance_payouts').select('*')
        .gte('week_start', mondayOf(first)).lte('week_start', lastDate).is('cancelled_at', null),
      loadCorrections(mondayOf(first), lastDate),
      loadCorrectionHistory(mondayOf(first), lastDate)
    ])
    const payouts = paidRes.error ? [] : (paidRes.data || [])
    const paidBy = new Map<string, any>() // `${user}|${monday}` -> payout
    for (const p of payouts as any[]) paidBy.set(`${p.user_id}|${p.week_start}`, p)

    // weeks touching this month
    const weeks: MonthWeek[] = []
    for (let wk = mondayOf(first); wk <= lastDate; wk = addDays(wk, 7)) {
      const any = (payouts as any[]).find(p => p.week_start === wk)
      weeks.push({ monday: wk, label: weekRange(wk).label, paid: !!any, paidAt: any?.paid_at || null, paidByName: any?.paid_by_name || '' })
    }

    const byUser = new Map<string, any[]>()
    for (const s of shiftRows as any[]) {
      if (!s.user_id) continue
      const l = byUser.get(s.user_id) || []; l.push(s); byUser.set(s.user_id, l)
    }

    const people: MonthPerson[] = []
    const shifts: Record<string, AllowanceShift[]> = {}
    const n = (v: any) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
    const userIds = new Set<string>([...byUser.keys(), ...(payouts as any[]).map(p => p.user_id), ...activeCorr.map(c => c.user_id)])
    for (const u of users) {
      const rates = allowanceRates(u.app_metadata)
      if (!userIds.has(u.id)) continue
      const days = new Map<string, MonthDay>()
      // 1. days from shifts, only for weeks NOT paid for this person
      for (const s of byUser.get(u.id) || []) {
        const date = istDate(s.start_time || s.created_at)
        if (date < first || date > lastDate) continue
        if (paidBy.has(`${u.id}|${mondayOf(date)}`)) continue
        const d = days.get(date) || { date, shifts: 0, km: 0, openShifts: 0, foodRate: rates.foodRate, kmRate: rates.kmRate, food: 0, travel: 0, paid: false }
        d.shifts += 1
        const km = shiftKm(s)
        if (km === null) d.openShifts += 1; else d.km = round2(d.km + km)
        days.set(date, d)
      }
      // 2. days from paid weeks, as saved
      for (const p of payouts as any[]) {
        if (p.user_id !== u.id) continue
        for (const sd of (Array.isArray(p.days) ? p.days : []) as any[]) {
          if (!sd?.date || sd.date < first || sd.date > lastDate) continue
          days.set(sd.date, { date: sd.date, shifts: Number(sd.shifts) || 0, km: Number(sd.km) || 0, openShifts: 0,
            foodRate: Number(p.food_rate) || 0, kmRate: Number(p.km_rate) || 0, food: 0, travel: 0, paid: true })
        }
      }
      // 3. admin corrections, for weeks NOT paid for this person (paid weeks already include theirs)
      let extra = 0
      for (const c of activeCorr) {
        if (c.user_id !== u.id || paidBy.has(`${u.id}|${ymd(c.week_start)}`)) continue
        if (c.day_date) {
          const date = ymd(c.day_date)
          if (date < first || date > lastDate) continue
          if (!c.present) { days.delete(date); continue }
          const old = days.get(date)
          days.set(date, { date, shifts: old?.shifts ?? 0, km: round2(Number(c.km) || 0), openShifts: old?.openShifts ?? 0,
            foodRate: rates.foodRate, kmRate: rates.kmRate, food: 0, travel: 0, paid: false })
        } else if (ymd(c.week_start) >= first && ymd(c.week_start) <= lastDate) {
          extra += Number(c.extra_amount) || 0 // a week's extra belongs to the month the week starts in
        }
      }
      // extra amounts inside paid weeks (saved as total - food - travel)
      for (const p of payouts as any[]) {
        if (p.user_id !== u.id || p.week_start < first || p.week_start > lastDate) continue
        extra += (Number(p.total_amount) || 0) - (Number(p.food_amount) || 0) - (Number(p.travel_amount) || 0)
      }
      extra = round2(extra)
      if (days.size === 0 && extra === 0) continue
      const list = [...days.values()].sort((a, b) => a.date.localeCompare(b.date))
      // per-day amounts unrounded; each person's totals are rounded once (as when a week is paid)
      for (const d of list) { d.food = d.foodRate; d.travel = d.km * d.kmRate }
      const food = round2(list.reduce((t, d) => t + d.food, 0))
      const travel = round2(list.reduce((t, d) => t + d.travel, 0))
      people.push({
        userId: u.id,
        name: u.user_metadata?.name || u.user_metadata?.full_name || u.email?.split('@')[0] || 'User',
        role: u.app_metadata?.role || '',
        daysPresent: list.length,
        km: round2(list.reduce((t, d) => t + d.km, 0)),
        food, travel, extra, total: round2(food + travel + extra),
        openShifts: list.reduce((t, d) => t + d.openShifts, 0),
        noRates: list.every(d => !(d.foodRate > 0) && !(d.kmRate > 0)),
        foodRate: rates.foodRate, kmRate: rates.kmRate,
        days: list
      })
      shifts[u.id] = (byUser.get(u.id) || [])
        .filter((s: any) => { const d = istDate(s.start_time || s.created_at); return d >= first && d <= lastDate })
        .map((s: any) => ({
          date: istDate(s.start_time || s.created_at), start: s.start_time || s.created_at || null, end: s.end_time || null,
          status: String(s.status || ''), vehicle: s.vehicle_type || '', odometerStart: n(s.odometer_start), odometerEnd: n(s.odometer_end),
          km: shiftKm(s), pausedMinutes: Math.round((Number(s.total_paused_seconds) || 0) / 60),
          startLocation: s.start_location || '', endLocation: s.end_location || '',
          orders: Number(s.orders_count) || 0, visits: Number(s.visits_count) || 0, orderValue: Number(s.total_order_value) || 0,
          cash: Number(s.cash_collected) || 0, online: Number(s.online_collected) || 0, due: Number(s.market_due) || 0
        }))
        .sort((a: AllowanceShift, b: AllowanceShift) => String(a.start).localeCompare(String(b.start)))
    }
    people.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    const totals = people.reduce((t, r) => ({
      food: round2(t.food + r.food), travel: round2(t.travel + r.travel), total: round2(t.total + r.total), km: round2(t.km + r.km), days: t.days + r.daysPresent
    }), { food: 0, travel: 0, total: 0, km: 0, days: 0 })
    // Only corrections that belong to this month: a day inside it, or a one-off extra of a week starting in it
    const monthCorrections = corrHistory.filter(c => c.date ? (c.date >= first && c.date <= lastDate) : (c.weekStart >= first && c.weekStart <= lastDate))
    return { success: true, month, label: `${MONTHS[m - 1]} ${y}`, people, weeks, shifts, totals, monthEnded: today > lastDate, corrections: monthCorrections }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// -----------------------------------------------------------------------------
// Admin only: cancel a sale, delete / hide / restore a retailer
// (20261117_sale_cancel_retailer_delete.sql)
// -----------------------------------------------------------------------------
const CANCEL_SQL = 'This needs a one-time database update: run 20261117_sale_cancel_retailer_delete.sql in Supabase. Nothing was changed.'
const missingCancelSql = (message: string) =>
  /sales_cancelled|fn_cancel_sale|fn_delete_retailer|fn_restore_retailer|is_active/.test(message) && /not find|does not exist|schema cache/i.test(message)

/** Message if an admin removed this retailer, otherwise null. Never blocks on a read problem. */
async function retailerRemovedError(retailerId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('retailers').select('*').eq('id', retailerId).maybeSingle()
  return data && (data as any).is_active === false
    ? 'This retailer was removed by an admin. Refresh the page; ask an admin to restore it if it is needed.'
    : null
}

async function requireAdminFor(what: string): Promise<{ user: any; name: string } | { error: string }> {
  const user = await getCachedUser()
  const role = (user?.app_metadata?.role || '').toLowerCase()
  if (!user || role !== 'admin') return { error: `Only admins can ${what}.` }
  if (!(await isSessionValid())) return { error: 'Session expired. Please log in again.' }
  return { user, name: (user.user_metadata?.name as string) || user.email || 'Admin' }
}

export type CancelledSale = {
  id: string; retailerName: string; shopName: string; salesPersonId: string | null; salesPersonName: string
  saleCreatedAt: string | null; amount: number; cash: number; online: number; due: number
  reason: string; cancelledAt: string; cancelledByName: string
  cashRefund: number; cashRefundPending: boolean; onlineRefund: number
}
export type RemovedRetailer = { id: string; name: string; shopName: string; territory: string; salesPersonName: string; removedAt: string | null; removedByName: string }

/**
 * Cancel a sale. Admin only, needs the delete password. The order leaves all
 * totals and is kept in the cancelled-orders record. Cash collected on it comes
 * off the sales person's running shift, or their next shift if none is running.
 */
export async function cancelSale(saleId: string, deletePassword: string, reason?: string) {
  const pwError = checkDeletePassword(deletePassword)
  if (pwError) return { error: pwError.replace('Nothing was deleted', 'Nothing was changed') }
  const auth = await requireAdminFor('cancel a sale')
  if ('error' in auth) return { error: auth.error }
  if (!saleId) return { error: 'Order not found.' }

  const { data, error } = await supabaseAdmin.rpc('fn_cancel_sale', {
    p_sale_id: String(saleId),
    p_reason: String(reason || '').trim().slice(0, 300),
    p_user_id: auth.user.id,
    p_user_name: auth.name
  })
  if (error) return { error: missingCancelSql(error.message) ? CANCEL_SQL : error.message }

  revalidatePath('/dashboard/sales')
  revalidatePath('/dashboard')
  const r = (data || {}) as any
  return {
    success: true as const,
    amount: Number(r.amount) || 0, cash: Number(r.cash) || 0, online: Number(r.online) || 0,
    cashOffShiftNow: !!r.cashOffShiftNow, cashOffNextShift: !!r.cashOffNextShift
  }
}

/**
 * Delete a retailer. Admin only, needs the delete password. Refused while the
 * retailer owes money. With no orders or visits it is deleted; otherwise it is
 * hidden so past orders keep the name, and can be restored.
 */
export async function deleteRetailer(retailerId: string, deletePassword: string) {
  const pwError = checkDeletePassword(deletePassword)
  if (pwError) return { error: pwError }
  const auth = await requireAdminFor('delete a retailer')
  if ('error' in auth) return { error: auth.error }
  if (!/^[0-9a-f-]{36}$/i.test(String(retailerId || ''))) return { error: 'Retailer not found.' }

  const { data, error } = await supabaseAdmin.rpc('fn_delete_retailer', { p_retailer_id: retailerId, p_user_name: auth.name })
  if (error) return { error: missingCancelSql(error.message) ? CANCEL_SQL : error.message }

  revalidatePath('/dashboard/sales')
  revalidatePath('/dashboard')
  const r = (data || {}) as any
  return { success: true as const, mode: (r.mode === 'deleted' ? 'deleted' : 'hidden') as 'deleted' | 'hidden', orders: Number(r.orders) || 0, visits: Number(r.visits) || 0 }
}

/** Bring back a retailer that was hidden. Admin only. */
export async function restoreRetailer(retailerId: string) {
  const auth = await requireAdminFor('restore a retailer')
  if ('error' in auth) return { error: auth.error }
  if (!/^[0-9a-f-]{36}$/i.test(String(retailerId || ''))) return { error: 'Retailer not found.' }

  const { error } = await supabaseAdmin.rpc('fn_restore_retailer', { p_retailer_id: retailerId })
  if (error) return { error: missingCancelSql(error.message) ? CANCEL_SQL : error.message }

  revalidatePath('/dashboard/sales')
  revalidatePath('/dashboard')
  return { success: true as const }
}

/** Cancelled orders (newest first) and removed retailers, for the admin's records panel. */
export async function fetchSalesAdminRecords(): Promise<{ cancelled: CancelledSale[]; removed: RemovedRetailer[]; needsSql: boolean } | { error: string }> {
  const auth = await requireAdminFor('see cancelled orders')
  if ('error' in auth) return { error: auth.error }

  const [cancelledRes, retailersRes, users] = await Promise.all([
    supabaseAdmin.from('sales_cancelled').select('*').order('cancelled_at', { ascending: false }).limit(500),
    supabaseAdmin.from('retailers').select('*').eq('is_active', false).order('deleted_at', { ascending: false }).limit(500),
    listAllUsersCached().catch(() => [] as any[])
  ])
  const needsSql = !!(cancelledRes.error && missingCancelSql(cancelledRes.error.message)) || !!(retailersRes.error && missingCancelSql(retailersRes.error.message))
  if (!needsSql && cancelledRes.error) return { error: cancelledRes.error.message }
  if (!needsSql && retailersRes.error) return { error: retailersRes.error.message }

  const nameOf = new Map<string, string>()
  for (const u of users as any[]) nameOf.set(u.id, (u.user_metadata?.name as string) || u.email || '')

  const cancelled: CancelledSale[] = ((cancelledRes.data || []) as any[]).map(c => ({
    id: c.id,
    retailerName: c.retailer_name || '',
    shopName: c.shop_name || '',
    salesPersonId: c.sales_person_id || null,
    salesPersonName: nameOf.get(c.sales_person_id) || '',
    saleCreatedAt: c.sale_created_at || null,
    amount: Number(c.amount) || 0, cash: Number(c.cash_amount) || 0, online: Number(c.online_amount) || 0, due: Number(c.due_amount) || 0,
    reason: c.reason || '',
    cancelledAt: c.cancelled_at,
    cancelledByName: c.cancelled_by_name || '',
    cashRefund: Number(c.cash_refund) || 0,
    cashRefundPending: Number(c.cash_refund) > 0 && !c.cash_refund_applied_at,
    onlineRefund: Number(c.online_refund) || 0
  }))
  const removed: RemovedRetailer[] = ((retailersRes.data || []) as any[]).map(r => ({
    id: r.id, name: r.name || '', shopName: r.shop_name || '', territory: r.territory || '',
    salesPersonName: nameOf.get(r.sales_person_id) || '', removedAt: r.deleted_at || null, removedByName: r.deleted_by_name || ''
  }))
  return { cancelled, removed, needsSql }
}
