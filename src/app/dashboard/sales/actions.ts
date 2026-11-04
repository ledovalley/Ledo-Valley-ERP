'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { isSessionValid } from '@/app/dashboard/actions'
import { selectAllPages } from '@/utils/selectAll'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { SALES_DEFAULT_DAYS, salesPeriodRange, type SalesPeriodKey } from '@/utils/salesPeriods'

// Retailer Actions
export async function fetchRetailers() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const role = (user?.app_metadata?.role || '').toLowerCase()

  // Admins & managers see all, other staff see only theirs
  const ownOnly = role !== 'admin' && role !== 'manager'
  try {
    return await selectAllPages((from, to) => {
      let query = supabase.from('retailers').select('*')
        .order('created_at', { ascending: false }).order('id', { ascending: true })
      if (ownOnly) query = query.eq('sales_person_id', user?.id)
      return query.range(from, to)
    })
  } catch (error) {
    console.error("Fetch Retailers Error:", error)
    return []
  }
}

export async function createRetailer(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await isSessionValid())) {
    return { error: "Session expired. Please log in again." }
  }

  const name = formData.get('name') as string
  const shop_name = formData.get('shop_name') as string
  const address = formData.get('address') as string
  const phone = formData.get('phone') as string
  const territory = formData.get('territory') as string
  const geo_location = formData.get('geo_location') as string

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
  const { data: { user } } = await supabase.auth.getUser()
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
  const { data: { user } } = await supabase.auth.getUser()
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
  const { data: { user } } = await supabase.auth.getUser()
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
  const { data: { user } } = await supabase.auth.getUser()
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
  const due_amount = parseFloat(formData.get('due_amount') as string) || (amount - cash_amount - online_amount)
  const delivery_status = (formData.get('delivery_status') as string) || 'delivered'

  // Automatically stamp current date & time
  const now = new Date()
  const datePart = now.toISOString().split('T')[0]
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

  // Check if sales rep has an active shift
  const { data: activeShift } = await supabase
    .from('shifts')
    .select('id')
    .eq('user_id', user?.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: newSale, error } = await supabase.from('sales_records').insert({
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
  }).select().single()

  if (error) return { error: error.message }

  // Log as verified visit in retailer_visits
  const { error: visitErr } = await supabase.from('retailer_visits').insert({
    retailer_id,
    sales_person_id: user?.id,
    shift_id: activeShift?.id || null,
    visit_type: 'order',
    notes: `Order booked: ₹${amount.toLocaleString('en-IN')}`,
    created_at: createdAt
  })
  if (visitErr) console.error('Sale saved but visit log failed:', newSale?.id, visitErr)

  // If rep is on an active shift, add to its totals in one atomic database
  // update, so two orders at the same moment can't overwrite each other.
  if (activeShift) {
    const { error: shiftErr } = await supabase.rpc('fn_record_sale_on_shift', {
      p_shift_id: activeShift.id,
      p_order_value: amount,
      p_cash_amount: cash_amount,
      p_online_amount: online_amount,
      p_due_amount: due_amount
    })
    if (shiftErr) {
      console.error('Sale saved but shift totals not updated:', newSale?.id, shiftErr)
      revalidatePath('/dashboard/sales')
      revalidatePath('/dashboard')
      return {
        success: true,
        sale: newSale,
        warning: 'Order saved, but your shift totals could not be updated. Please tell your manager.'
      }
    }
  }
  
  revalidatePath('/dashboard/sales')
  revalidatePath('/dashboard')
  return { success: true, sale: newSale }
}

// Log "No Order" Retailer Visit
export async function logNoOrderVisit(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await isSessionValid())) {
    return { error: "Session expired. Please log in again." }
  }

  const retailer_id = formData.get('retailer_id') as string
  const no_order_reason = formData.get('no_order_reason') as string
  const notes = formData.get('notes') as string
  const geo_location = formData.get('geo_location') as string

  if (!retailer_id) return { error: 'Please select a retailer.' }

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
  const { data: { user } } = await supabase.auth.getUser()
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
export async function collectSalePayment(
  saleId: string,
  paymentData: { cashAmount: number; onlineAmount: number }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await isSessionValid())) {
    return { error: "Session expired. Please log in again." }
  }

  if (!saleId) return { error: "Sale ID is required." }

  const cash = Math.max(0, Number(paymentData.cashAmount) || 0)
  const online = Math.max(0, Number(paymentData.onlineAmount) || 0)
  const additionalPaid = cash + online

  if (additionalPaid <= 0) {
    return { error: "Payment amount must be greater than zero." }
  }

  // Fetch current sale to calculate new totals
  const { data: sale, error: fetchErr } = await supabase
    .from('sales_records')
    .select('*')
    .eq('id', saleId)
    .single()

  if (fetchErr || !sale) {
    return { error: fetchErr?.message || "Order not found." }
  }

  const newCash = Number(sale.cash_amount || 0) + cash
  const newOnline = Number(sale.online_amount || 0) + online
  const totalPaid = newCash + newOnline
  const totalAmount = Number(sale.amount || 0)
  const newDue = Math.max(0, totalAmount - totalPaid)
  const newStatus = newDue <= 0 ? 'paid' : 'partial'

  const { data: updated, error: updateErr } = await supabase
    .from('sales_records')
    .update({
      cash_amount: newCash,
      online_amount: newOnline,
      due_amount: newDue,
      payment_status: newStatus
    })
    .eq('id', saleId)
    .select()
    .single()

  if (updateErr) return { error: updateErr.message }

  // If rep has active shift, reflect the new cash/online collection
  const { data: activeShift } = await supabase
    .from('shifts')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (activeShift) {
    await supabase.rpc('fn_record_sale_on_shift', {
      p_shift_id: activeShift.id,
      p_order_value: 0,
      p_cash_amount: cash,
      p_online_amount: online,
      p_due_amount: -additionalPaid
    })
  }

  revalidatePath('/dashboard/sales')
  revalidatePath('/dashboard')
  return { success: true, sale: updated }
}

// Fetch Retailer Visits
export async function fetchRetailerVisits(limit = 50) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
