'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { isSessionValid } from '@/app/dashboard/actions'

// Retailer Actions
export async function fetchRetailers() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const role = (user?.user_metadata?.role || '').toLowerCase()

  // Admins & managers see all, other staff see only theirs
  let query = supabase.from('retailers').select('*').order('created_at', { ascending: false })
  
  if (role !== 'admin' && role !== 'manager') {
    query = query.eq('sales_person_id', user?.id)
  }

  const { data, error } = await query
  if (error) {
    console.error("Fetch Retailers Error:", error.message)
    return []
  }
  return data || []
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
export async function fetchSalesRecords() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const role = (user?.user_metadata?.role || '').toLowerCase()

  let query = supabase.from('sales_records').select(`
    *,
    retailers (id, name, shop_name, territory, address, phone, geo_location)
  `).order('created_at', { ascending: false })
  
  if (role !== 'admin' && role !== 'manager') {
    query = query.eq('sales_person_id', user?.id)
  }

  const { data, error } = await query
  if (error) {
    console.error("Fetch Sales Error:", error.message)
    return []
  }
  return data || []
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

  // Automatically stamp current date & time
  const now = new Date()
  const datePart = now.toISOString().split('T')[0]
  const createdAt = now.toISOString()

  let parsedQty = parseInt(rawQty, 10)
  if (isNaN(parsedQty) || parsedQty <= 0) {
    parsedQty = 1
  }

  // Check if sales rep has an active shift
  const { data: activeShift } = await supabase
    .from('shifts')
    .select('id, orders_count, visits_count, total_order_value, cash_collected, online_collected, market_due')
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
    sales_person_id: user?.id
  }).select().single()

  if (error) return { error: error.message }

  // Log as verified visit in retailer_visits
  await supabase.from('retailer_visits').insert({
    retailer_id,
    sales_person_id: user?.id,
    shift_id: activeShift?.id || null,
    visit_type: 'order',
    notes: `Order booked: ₹${amount.toLocaleString('en-IN')}`,
    created_at: createdAt
  })

  // If rep is on an active shift, auto-accumulate shift metrics
  if (activeShift) {
    await supabase.from('shifts').update({
      orders_count: (activeShift.orders_count || 0) + 1,
      visits_count: (activeShift.visits_count || 0) + 1,
      total_order_value: (Number(activeShift.total_order_value) || 0) + amount,
      cash_collected: (Number(activeShift.cash_collected) || 0) + cash_amount,
      online_collected: (Number(activeShift.online_collected) || 0) + online_amount,
      market_due: (Number(activeShift.market_due) || 0) + due_amount
    }).eq('id', activeShift.id)
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

  // Check if rep has active shift
  const { data: activeShift } = await supabase
    .from('shifts')
    .select('id, visits_count')
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

  // Increment visit count in active shift
  if (activeShift) {
    await supabase.from('shifts').update({
      visits_count: (activeShift.visits_count || 0) + 1
    }).eq('id', activeShift.id)
  }

  revalidatePath('/dashboard/sales')
  revalidatePath('/dashboard')
  return { success: true, visit: data }
}

// Fetch Retailer Visits
export async function fetchRetailerVisits(limit = 50) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const role = user?.user_metadata?.role

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
