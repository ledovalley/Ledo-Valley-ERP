'use server'

import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { cookies } from 'next/headers'
import { SESSION_EXPIRES_COOKIE, SESSION_START_COOKIE } from '@/utils/sessionConfig'

export async function signOut() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_EXPIRES_COOKIE)
  cookieStore.delete(SESSION_START_COOKIE)
  const supabase = await createClient()
  await supabase.auth.signOut()
  return redirect('/login')
}

export async function isSessionValid(): Promise<boolean> {
  const cookieStore = await cookies()
  const expStr = cookieStore.get(SESSION_EXPIRES_COOKIE)?.value
  if (!expStr) return false
  const exp = parseInt(expStr, 10)
  return !isNaN(exp) && Date.now() <= exp
}

// -------------------------------------------------------------
// SHIFT TRACKER ACTIONS
// -------------------------------------------------------------

export async function fetchActiveShift() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('user_id', user.id)
    .in('status', ['active', 'paused'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("Fetch Active Shift Error:", error.message)
    return null
  }
  return data
}

export async function fetchUserRecentRoutes(): Promise<string[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('shifts')
    .select('territory, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error || !data) {
    if (error) console.error("Fetch User Recent Routes Error:", error.message)
    return []
  }

  const uniqueRoutes: string[] = []
  for (const item of data) {
    const t = item.territory?.trim()
    if (t && !uniqueRoutes.some(r => r.toLowerCase() === t.toLowerCase())) {
      uniqueRoutes.push(t)
    }
    if (uniqueRoutes.length >= 4) break
  }

  return uniqueRoutes
}

export async function fetchActiveFieldDevices() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const userRole = (user?.user_metadata?.role || '').toLowerCase()
    const isManagement = ['admin', 'manager'].includes(userRole)

    let query = supabaseAdmin
      .from('shifts')
      .select('*')
      .in('status', ['active', 'paused'])
      .order('created_at', { ascending: false })

    if (!isManagement && user?.id) {
      query = query.eq('user_id', user.id)
    }

    const { data: shifts, error } = await query

    if (error || !shifts) {
      if (error) console.error("Fetch Active Field Devices Error:", error.message)
      return []
    }

    let usersMap = new Map<string, any>()
    try {
      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers()
      if (usersData?.users) {
        usersMap = new Map(usersData.users.map((u: any) => [u.id, u]))
      }
    } catch (e) {
      console.error("Admin listUsers error in fetchActiveFieldDevices:", e)
    }

    return shifts.map((s: any, idx: number) => {
      const u = usersMap.get(s.user_id)
      const userName = u?.user_metadata?.name || u?.user_metadata?.full_name || u?.email?.split('@')[0] || 'Field Personnel'
      const userRole = u?.user_metadata?.role || 'Sales'

      return {
        id: s.id,
        shiftId: s.id,
        userId: s.user_id,
        userName,
        userRole,
        deviceName: `Mobile Field GPS #${String(idx + 1).padStart(2, '0')}`,
        territory: s.territory || 'General Route',
        vehicleType: s.vehicle_type || 'Bike',
        odometerStart: s.odometer_start,
        startLocation: s.start_location,
        startTime: s.start_time,
        status: s.status,
        ordersCount: s.orders_count || 0,
        cashCollected: s.cash_collected || 0
      }
    })
  } catch (err: any) {
    console.error("fetchActiveFieldDevices exception:", err)
    return []
  }
}

export async function startShift(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await isSessionValid())) {
    return { error: "Session expired. Please log in again." }
  }

  const territory = (formData.get('territory') as string)?.trim() || 'General Territory'
  const vehicle_type = (formData.get('vehicle_type') as string)?.trim() || 'Bike'
  const odometer_start = parseFloat(formData.get('odometer_start') as string) || 0
  const start_location = (formData.get('start_location') as string)?.trim() || null

  // Ensure no other active shift is running
  const { data: existing } = await supabase
    .from('shifts')
    .select('id')
    .eq('user_id', user.id)
    .in('status', ['active', 'paused'])
    .limit(1)
    .maybeSingle()

  if (existing) {
    return { error: "You already have an ongoing shift. Please complete or end it before starting a new one." }
  }

  const { data, error } = await supabase
    .from('shifts')
    .insert({
      user_id: user.id,
      territory,
      vehicle_type,
      odometer_start,
      start_location,
      status: 'active',
      start_time: new Date().toISOString(),
      total_paused_seconds: 0,
      paused_at: null
    })
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  return { success: true, shift: data }
}

export async function pauseShift(shiftId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await isSessionValid())) {
    return { error: "Session expired. Please log in again." }
  }
  const paused_at = new Date().toISOString()
  const { data, error } = await supabase
    .from('shifts')
    .update({ 
      status: 'paused',
      paused_at
    })
    .eq('id', shiftId)
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  return { success: true, shift: data }
}

export async function resumeShift(shiftId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await isSessionValid())) {
    return { error: "Session expired. Please log in again." }
  }
  const { data: shift, error: fetchErr } = await supabase
    .from('shifts')
    .select('paused_at, total_paused_seconds')
    .eq('id', shiftId)
    .single()

  if (fetchErr || !shift) {
    return { error: fetchErr?.message || 'Shift not found' }
  }

  const now = Date.now()
  let additionalPausedSec = 0
  if (shift.paused_at) {
    const pausedMs = new Date(shift.paused_at).getTime()
    additionalPausedSec = Math.max(0, Math.floor((now - pausedMs) / 1000))
  }

  const updatedTotalPaused = (Number(shift.total_paused_seconds) || 0) + additionalPausedSec

  const { data, error } = await supabase
    .from('shifts')
    .update({ 
      status: 'active',
      paused_at: null,
      total_paused_seconds: updatedTotalPaused
    })
    .eq('id', shiftId)
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  return { success: true, shift: data }
}

export async function endShift(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await isSessionValid())) {
    return { error: "Session expired. Please log in again." }
  }
  const shiftId = formData.get('shift_id') as string
  const odometer_end = parseFloat(formData.get('odometer_end') as string) || 0
  const end_location = (formData.get('end_location') as string)?.trim() || null
  const cash_deposited = parseFloat(formData.get('cash_deposited') as string) || 0
  const notes = (formData.get('notes') as string)?.trim() || null

  // Fetch shift details to compute final distance & cash discrepancy
  const { data: shift, error: fetchErr } = await supabase
    .from('shifts')
    .select('*')
    .eq('id', shiftId)
    .single()

  if (fetchErr || !shift) return { error: "Shift not found" }

  const startOdo = Number(shift.odometer_start) || 0
  const total_distance = Math.max(0, odometer_end - startOdo)
  const cash_collected = Number(shift.cash_collected) || 0
  const cash_discrepancy = cash_collected - cash_deposited

  let finalPausedSeconds = Number(shift.total_paused_seconds) || 0
  if (shift.status === 'paused' && shift.paused_at) {
    const pausedMs = new Date(shift.paused_at).getTime()
    finalPausedSeconds += Math.max(0, Math.floor((Date.now() - pausedMs) / 1000))
  }

  const { data, error } = await supabase
    .from('shifts')
    .update({
      odometer_end,
      total_distance,
      end_location,
      cash_deposited,
      cash_discrepancy,
      notes,
      status: 'completed',
      paused_at: null,
      total_paused_seconds: finalPausedSeconds,
      end_time: new Date().toISOString()
    })
    .eq('id', shiftId)
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  return { success: true, shift: data }
}

// -------------------------------------------------------------
// EMPLOYEE PERFORMANCE & PAYOUT AUDIT LEDGER
// -------------------------------------------------------------

export async function fetchEmployeeAuditLedger(targetUserId?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const role = (user?.user_metadata?.role || '').toLowerCase()

  // If user is not admin/manager, they can only view their own ledger
  const effectiveUserId = (role === 'admin' || role === 'manager') 
    ? (targetUserId || null) 
    : user?.id

  let shiftsQuery = supabase.from('shifts').select('*').order('created_at', { ascending: false })
  let salesQuery = supabase.from('sales_records').select('*')
  let visitsQuery = supabase.from('retailer_visits').select('*')
  let retailersQuery = supabase.from('retailers').select('*')

  if (effectiveUserId) {
    shiftsQuery = shiftsQuery.eq('user_id', effectiveUserId)
    salesQuery = salesQuery.eq('sales_person_id', effectiveUserId)
    visitsQuery = visitsQuery.eq('sales_person_id', effectiveUserId)
    retailersQuery = retailersQuery.eq('sales_person_id', effectiveUserId)
  }

  const [shiftsRes, salesRes, visitsRes, retailersRes] = await Promise.all([
    shiftsQuery,
    salesQuery,
    visitsQuery,
    retailersQuery
  ])

  const shifts = shiftsRes.data || []
  const sales = salesRes.data || []
  const visits = visitsRes.data || []
  const retailers = retailersRes.data || []

  // Aggregate metrics
  const totalKmDriven = shifts.reduce((acc, curr) => acc + (Number(curr.total_distance) || 0), 0)
  const totalOrdersCount = sales.length
  const totalRevenue = sales.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0)
  const totalCashCollected = sales.reduce((acc, curr) => acc + (Number(curr.cash_amount) || 0), 0)
  const totalOnlineCollected = sales.reduce((acc, curr) => acc + (Number(curr.online_amount) || 0), 0)
  const totalMarketDue = sales.reduce((acc, curr) => acc + (Number(curr.due_amount) || 0), 0)
  const totalCashDeposited = shifts.reduce((acc, curr) => acc + (Number(curr.cash_deposited) || 0), 0)
  const inHandCashBalance = Math.max(0, totalCashCollected - totalCashDeposited)

  const totalRetailersOnboarded = retailers.length
  const totalVisitsCount = visits.length
  const noOrderVisitsCount = visits.filter(v => v.visit_type === 'no_order').length
  const orderVisitsCount = visits.filter(v => v.visit_type === 'order').length

  return {
    shifts,
    sales,
    visits,
    retailers,
    metrics: {
      totalKmDriven,
      totalOrdersCount,
      totalRevenue,
      totalCashCollected,
      totalOnlineCollected,
      totalMarketDue,
      totalCashDeposited,
      inHandCashBalance,
      totalRetailersOnboarded,
      totalVisitsCount,
      noOrderVisitsCount,
      orderVisitsCount
    }
  }
}

// -------------------------------------------------------------
// DASHBOARD TARGETS PROGRESS ACTION
// -------------------------------------------------------------

export interface TargetProgressMetric {
  actual: number
  target: number
  pct: number
}

export interface DashboardTargetsProgress {
  month: string
  sales: TargetProgressMetric
  reach: TargetProgressMetric
  orders: TargetProgressMetric
}

export async function fetchDashboardTargetsProgress(targetMonth?: string): Promise<DashboardTargetsProgress> {
  const month = targetMonth || new Date().toISOString().slice(0, 7)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const userRole = (user?.user_metadata?.role || 'employee').toLowerCase()
  const isManagement = ['admin', 'manager'].includes(userRole)

  // 1. Fetch Targets for the month
  let targetsQuery = supabaseAdmin
    .from('employee_targets')
    .select('*')
    .eq('month', month)

  if (!isManagement && user) {
    targetsQuery = targetsQuery.eq('user_id', user.id)
  }

  const { data: targetsData } = await targetsQuery

  let targetSales = 0
  let targetReach = 0
  let targetOrders = 0

  if (targetsData && targetsData.length > 0) {
    targetsData.forEach((t: any) => {
      targetSales += Number(t.sales_target) || 0
      targetReach += Number(t.retailer_reach_target) || 0
      targetOrders += Number(t.orders_target) || 0
    })
  }

  // 2. Fetch Actuals from sales_records for the specified month
  const [yearStr, monthStr] = month.split('-')
  const year = parseInt(yearStr) || 2026
  const monthNum = parseInt(monthStr) || 10
  const startDate = `${month}-01`
  const nextMonthYear = monthNum === 12 ? year + 1 : year
  const nextMonthNum = monthNum === 12 ? 1 : monthNum + 1
  const endDate = `${nextMonthYear}-${String(nextMonthNum).padStart(2, '0')}-01`

  let salesQuery = supabaseAdmin
    .from('sales_records')
    .select('id, amount, retailer_id, date, created_at, sales_person_id')
    .gte('date', startDate)
    .lt('date', endDate)

  if (!isManagement && user) {
    salesQuery = salesQuery.eq('sales_person_id', user.id)
  }

  const { data: salesRecords } = await salesQuery

  let actualSales = 0
  let actualOrders = 0
  const reachedRetailers = new Set<string>()

  if (salesRecords && salesRecords.length > 0) {
    actualOrders = salesRecords.length
    salesRecords.forEach((s: any) => {
      actualSales += Number(s.amount) || 0
      if (s.retailer_id) {
        reachedRetailers.add(s.retailer_id)
      }
    })
  }

  const actualReach = reachedRetailers.size

  const salesPct = targetSales > 0 ? Math.min(100, Math.round((actualSales / targetSales) * 100)) : 0
  const reachPct = targetReach > 0 ? Math.min(100, Math.round((actualReach / targetReach) * 100)) : 0
  const ordersPct = targetOrders > 0 ? Math.min(100, Math.round((actualOrders / targetOrders) * 100)) : 0

  return {
    month,
    sales: { actual: actualSales, target: targetSales, pct: salesPct },
    reach: { actual: actualReach, target: targetReach, pct: reachPct },
    orders: { actual: actualOrders, target: targetOrders, pct: ordersPct }
  }
}

// -------------------------------------------------------------
// EXACT TERRITORY DISTRIBUTION ACTION
// -------------------------------------------------------------

export interface TerritoryDistributionItem {
  name: string
  percentage: number
  ordersCount: number
  revenue: number
}

export async function fetchExactTerritoryDistribution(): Promise<TerritoryDistributionItem[]> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const userRole = (user?.user_metadata?.role || '').toLowerCase()
    const isManagement = ['admin', 'manager'].includes(userRole)

    let shiftsQuery = supabaseAdmin
      .from('shifts')
      .select('territory, total_order_value, orders_count, visits_count')

    let retailersQuery = supabaseAdmin
      .from('retailers')
      .select('territory')

    if (!isManagement && user?.id) {
      shiftsQuery = shiftsQuery.eq('user_id', user.id)
      retailersQuery = retailersQuery.eq('sales_person_id', user.id)
    }

    const { data: shifts } = await shiftsQuery
    const { data: retailers } = await retailersQuery

    const map = new Map<string, { revenue: number; orders: number; count: number }>()

    if (shifts && shifts.length > 0) {
      shifts.forEach((s: any) => {
        const rawTerritory = s.territory?.trim()
        if (rawTerritory) {
          const current = map.get(rawTerritory) || { revenue: 0, orders: 0, count: 0 }
          current.revenue += Number(s.total_order_value) || 0
          current.orders += Number(s.orders_count) || 0
          current.count += 1
          map.set(rawTerritory, current)
        }
      })
    }

    if (retailers && retailers.length > 0) {
      retailers.forEach((r: any) => {
        const rawTerritory = r.territory?.trim()
        if (rawTerritory) {
          const current = map.get(rawTerritory) || { revenue: 0, orders: 0, count: 0 }
          current.count += 1
          map.set(rawTerritory, current)
        }
      })
    }

    if (map.size === 0) {
      return []
    }

    const totalRevenue = Array.from(map.values()).reduce((sum, v) => sum + v.revenue, 0)
    const totalCount = Array.from(map.values()).reduce((sum, v) => sum + v.count, 0)

    const list: TerritoryDistributionItem[] = []

    map.forEach((data, name) => {
      let pct = 0
      if (totalRevenue > 0) {
        pct = Math.round((data.revenue / totalRevenue) * 100)
      } else if (totalCount > 0) {
        pct = Math.round((data.count / totalCount) * 100)
      }
      list.push({
        name,
        percentage: pct,
        ordersCount: data.orders,
        revenue: data.revenue
      })
    })

    // Sort descending by percentage
    list.sort((a, b) => b.percentage - a.percentage)

    if (list.length === 1) {
      list[0].percentage = 100
    }

    return list
  } catch (err) {
    console.error("fetchExactTerritoryDistribution error:", err)
    return []
  }
}

// -------------------------------------------------------------
// FIELD OPERATIONS TIMELINE ACTION
// -------------------------------------------------------------

export interface FieldActivityEvent {
  id: string
  type: 'shift_start' | 'shift_end' | 'order'
  timestamp: string
  timeFormatted: string
  dateKey: string // YYYY-MM-DD
  title: string
  subtitle: string
  amount?: number
  paymentStatus?: string
  territory?: string
  userName: string
  userMonogram: string
  badge?: string
}

function formatTimelineTime(isoString: string): string {
  try {
    const d = new Date(isoString)
    return d.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).toLowerCase()
  } catch {
    return '12:00 pm'
  }
}

function formatTimelineDateKey(isoString: string): string {
  try {
    const d = new Date(isoString)
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  } catch {
    return isoString.slice(0, 10)
  }
}

export async function fetchFieldOperationsTimeline(): Promise<FieldActivityEvent[]> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const userRole = (user?.user_metadata?.role || '').toLowerCase()
    const isManagement = ['admin', 'manager'].includes(userRole)

    const { data: usersData } = await supabaseAdmin.auth.admin.listUsers()
    const userMap = new Map<string, string>()
    usersData?.users?.forEach(u => {
      userMap.set(u.id, u.user_metadata?.name || u.email?.split('@')[0] || 'Field Staff')
    })

    let shiftsQuery = supabaseAdmin
      .from('shifts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30)

    let salesQuery = supabaseAdmin
      .from('sales_records')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30)

    if (!isManagement && user?.id) {
      shiftsQuery = shiftsQuery.eq('user_id', user.id)
      salesQuery = salesQuery.eq('sales_person_id', user.id)
    }

    const { data: shifts } = await shiftsQuery
    const { data: sales } = await salesQuery

    const { data: retailers } = await supabaseAdmin
      .from('retailers')
      .select('id, name, shop_name, territory')

    const retailerMap = new Map<string, any>()
    retailers?.forEach(r => retailerMap.set(r.id, r))

    const events: FieldActivityEvent[] = []

    shifts?.forEach((s: any) => {
      const uName = userMap.get(s.user_id) || 'Field Staff'
      const initials = uName
        .split(' ')
        .map(w => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'FS'

      if (s.start_time) {
        events.push({
          id: `shift-start-${s.id}`,
          type: 'shift_start',
          timestamp: s.start_time,
          timeFormatted: formatTimelineTime(s.start_time),
          dateKey: formatTimelineDateKey(s.start_time),
          title: 'Shift Commenced',
          subtitle: `${s.territory || 'General Route'} • ${s.vehicle_type || 'Bike'} • ${s.odometer_start || 0} km`,
          userName: uName,
          userMonogram: initials,
          badge: s.status === 'active' ? 'Active Shift' : undefined
        })
      }

      if (s.end_time) {
        events.push({
          id: `shift-end-${s.id}`,
          type: 'shift_end',
          timestamp: s.end_time,
          timeFormatted: formatTimelineTime(s.end_time),
          dateKey: formatTimelineDateKey(s.end_time),
          title: 'Shift Concluded',
          subtitle: `Distance: ${s.total_distance || 0} km • Cash Deposited: ₹${(s.cash_deposited || 0).toLocaleString('en-IN')}`,
          userName: uName,
          userMonogram: initials,
          badge: 'Completed'
        })
      }
    })

    sales?.forEach((sr: any) => {
      const uName = userMap.get(sr.sales_person_id) || 'Field Rep'
      const initials = uName
        .split(' ')
        .map(w => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'FR'
      const ret = retailerMap.get(sr.retailer_id)
      const time = sr.created_at || (sr.date ? `${sr.date}T12:00:00Z` : new Date().toISOString())

      let parsedSummary = ''
      try {
        if (sr.notes) {
          const parsed = typeof sr.notes === 'string' ? JSON.parse(sr.notes) : sr.notes
          parsedSummary = parsed.summary || ''
        }
      } catch {}

      const shopDesc = ret ? (ret.shop_name || ret.name) : 'Retail Outlet'
      const sub = [shopDesc, parsedSummary, ret?.territory].filter(Boolean).join(' • ')

      events.push({
        id: `order-${sr.id}`,
        type: 'order',
        timestamp: time,
        timeFormatted: formatTimelineTime(time),
        dateKey: formatTimelineDateKey(time),
        title: `Order Booked: ₹${Number(sr.amount || 0).toLocaleString('en-IN')}`,
        subtitle: sub,
        amount: Number(sr.amount || 0),
        paymentStatus: sr.payment_status || 'completed',
        userName: uName,
        userMonogram: initials,
        badge: sr.payment_status ? sr.payment_status.toUpperCase() : undefined
      })
    })

    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    return events
  } catch (err) {
    console.error("fetchFieldOperationsTimeline error:", err)
    return []
  }
}

// -------------------------------------------------------------
// WEEKLY ROUTE PROGRESS ACTION
// -------------------------------------------------------------

export interface WeeklyProgressDay {
  dayLetter: string
  fullDayName: string
  dateKey: string
  dateNum: number
  isToday: boolean
  isPresent: boolean
  isAbsent: boolean
  hours: number
  distanceKm: number
  salesAmount: number
  shiftsCount: number
}

export interface WeeklyProgressResponse {
  totalHours: number
  totalDistanceKm: number
  totalSales: number
  days: WeeklyProgressDay[]
}

export async function fetchWeeklyProgressData(): Promise<WeeklyProgressResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id

    const userRole = (user?.user_metadata?.role || '').toLowerCase()
    const isManagement = ['admin', 'manager'].includes(userRole)

    const now = new Date()
    const dayOfWeek = now.getDay()
    const sunday = new Date(now)
    sunday.setDate(now.getDate() - dayOfWeek)

    let shiftsQuery = supabaseAdmin.from('shifts').select('*')
    let salesQuery = supabaseAdmin.from('sales_records').select('*')

    if (!isManagement && userId) {
      shiftsQuery = shiftsQuery.eq('user_id', userId)
      salesQuery = salesQuery.eq('sales_person_id', userId)
    }

    const { data: shifts } = await shiftsQuery
    const { data: sales } = await salesQuery

    const daysLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
    const fullDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

    const days: WeeklyProgressDay[] = []
    let totalHours = 0
    let totalDistanceKm = 0
    let totalSales = 0

    for (let i = 0; i < 7; i++) {
      const d = new Date(sunday)
      d.setDate(sunday.getDate() + i)
      const dateKey = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
      const isToday = dateKey === now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

      const dayShifts = (shifts || []).filter((s: any) => {
        const sDate = new Date(s.start_time || s.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
        return sDate === dateKey
      })

      const daySales = (sales || []).filter((sr: any) => {
        const srDate = (sr.date || sr.created_at || '').slice(0, 10)
        return srDate === dateKey
      })

      let dayHours = 0
      let dayDistance = 0
      let daySalesAmount = 0

      dayShifts.forEach((s: any) => {
        let durSec = 0
        const startMs = new Date(s.start_time || s.created_at).getTime()
        const pausedSec = Number(s.total_paused_seconds) || 0
        if (s.end_time) {
          durSec = Math.max(0, Math.floor((new Date(s.end_time).getTime() - startMs) / 1000) - pausedSec)
        } else if (s.status === 'active' || s.status === 'paused') {
          durSec = Math.max(0, Math.floor((now.getTime() - startMs) / 1000) - pausedSec)
        }
        dayHours += durSec / 3600

        if (s.total_distance !== null && s.total_distance !== undefined && s.total_distance > 0) {
          dayDistance += Number(s.total_distance)
        } else if (s.odometer_end && s.odometer_start) {
          dayDistance += Math.max(0, Number(s.odometer_end) - Number(s.odometer_start))
        } else if (s.odometer_start) {
          dayDistance += Number(s.odometer_start)
        }
      })

      daySales.forEach((sr: any) => {
        daySalesAmount += Number(sr.amount) || 0
      })

      const isPresent = dayShifts.length > 0
      const isAbsent = !isPresent

      totalHours += dayHours
      totalDistanceKm += dayDistance
      totalSales += daySalesAmount

      days.push({
        dayLetter: daysLabels[i],
        fullDayName: fullDays[i],
        dateKey,
        dateNum: d.getDate(),
        isToday,
        isPresent,
        isAbsent,
        hours: +(dayHours.toFixed(1)),
        distanceKm: Math.round(dayDistance),
        salesAmount: daySalesAmount,
        shiftsCount: dayShifts.length
      })
    }

    return {
      totalHours: +(totalHours.toFixed(1)),
      totalDistanceKm: Math.round(totalDistanceKm),
      totalSales,
      days
    }
  } catch (err) {
    console.error("fetchWeeklyProgressData error:", err)
    return {
      totalHours: 0,
      totalDistanceKm: 0,
      totalSales: 0,
      days: []
    }
  }
}

// -------------------------------------------------------------
// DAILY OPERATIONAL TARGETS & PRIORITIES (AUTO-CALCULATED)
// -------------------------------------------------------------

export interface DailyOperationalTargets {
  min_shift_hours: number
  target_visits: number
  target_orders: number
  target_distance_km: number
  target_cash_amount?: number
}

export interface DailyPriorityItem {
  id: number
  title: string
  time: string
  done: boolean
  icon: 'store' | 'package' | 'trending' | 'navigation' | 'lab' | 'shield'
  type: 'shift' | 'retailer' | 'gps' | 'sales' | 'cash'
  current?: number
  target?: number
  collected?: number
  deposited?: number
}

function getTodayISTBounds() {
  const now = new Date()
  const istDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now)
  const startOfDay = new Date(`${istDateStr}T00:00:00+05:30`).toISOString()
  const endOfDay = new Date(`${istDateStr}T23:59:59.999+05:30`).toISOString()
  return { istDateStr, startOfDay, endOfDay }
}

export async function fetchDailyOperationalTargets(): Promise<DailyOperationalTargets> {
  try {
    const { data } = await supabaseAdmin
      .from('daily_operational_targets')
      .select('*')
      .eq('id', 1)
      .single()

    if (!data) {
      return {
        min_shift_hours: 6,
        target_visits: 5,
        target_orders: 3,
        target_distance_km: 15
      }
    }

    return {
      min_shift_hours: Number(data.min_shift_hours) || 6,
      target_visits: Number(data.target_visits) || 5,
      target_orders: Number(data.target_orders) || 3,
      target_distance_km: Number(data.target_distance_km) || 15
    }
  } catch (err) {
    return {
      min_shift_hours: 6,
      target_visits: 5,
      target_orders: 3,
      target_distance_km: 15
    }
  }
}

export async function saveDailyOperationalTargets(targets: DailyOperationalTargets) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const role = user?.user_metadata?.role

  if (!user || !['admin', 'manager'].includes(role) || !(await isSessionValid())) {
    return { error: "Session expired or unauthorized. Please log in again." }
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('daily_operational_targets')
      .upsert({
        id: 1,
        min_shift_hours: Math.max(1, Number(targets.min_shift_hours) || 6),
        target_visits: Math.max(1, Number(targets.target_visits) || 5),
        target_orders: Math.max(1, Number(targets.target_orders) || 3),
        target_distance_km: Math.max(1, Number(targets.target_distance_km) || 15),
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' })
      .select()
      .single()

    if (error) {
      return { error: error.message }
    }

    revalidatePath('/dashboard')
    return { success: true, targets: data }
  } catch (err: any) {
    return { error: err.message || 'Failed to update daily targets' }
  }
}

export async function fetchDailyPriorities(): Promise<{ 
  tasks: DailyPriorityItem[]; 
  targets: DailyOperationalTargets;
  todayShift: any;
}> {
  const defaultTargets: DailyOperationalTargets = {
    min_shift_hours: 6,
    target_visits: 5,
    target_orders: 3,
    target_distance_km: 15
  }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const targets = await fetchDailyOperationalTargets()
    const { startOfDay, endOfDay } = getTodayISTBounds()

    // 1. Fetch current user's shift for TODAY ONLY
    let todayShift: any = null
    if (user) {
      // Check active or paused shift right now
      const { data: activeShift } = await supabaseAdmin
        .from('shifts')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['active', 'paused'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (activeShift) {
        todayShift = activeShift
      } else {
        // Check shift created/started today that is completed/ended
        const { data: completedToday } = await supabaseAdmin
          .from('shifts')
          .select('*')
          .eq('user_id', user.id)
          .in('status', ['completed', 'ended'])
          .gte('created_at', startOfDay)
          .lte('created_at', endOfDay)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (completedToday) {
          todayShift = completedToday
        }
      }
    }

    const isShiftActive = Boolean(todayShift && (todayShift.status === 'active' || todayShift.status === 'paused'))
    const isShiftCompletedToday = Boolean(todayShift && (todayShift.status === 'completed' || todayShift.status === 'ended'))

    // Shift elapsed duration calculation (today only):
    let elapsedSeconds = 0
    if (todayShift) {
      const startMs = new Date(todayShift.start_time || todayShift.created_at).getTime()
      const endMs = isShiftCompletedToday
        ? new Date(todayShift.end_time || todayShift.updated_at).getTime()
        : Date.now()
      const pausedSec = Number(todayShift.total_paused_seconds || 0)
      elapsedSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000) - pausedSec)
    }

    const elapsedHours = +(elapsedSeconds / 3600).toFixed(1)
    const shiftHoursFloor = Math.floor(elapsedSeconds / 3600)
    const shiftMinsFloor = Math.floor((elapsedSeconds % 3600) / 60)
    const isShiftTimeMet = Boolean(todayShift && elapsedSeconds >= (targets.min_shift_hours * 3600))

    // 2. Fetch today's retailer visits count for THIS USER ONLY
    let userVisitsCount = 0
    if (user) {
      const { count: visitsCount } = await supabaseAdmin
        .from('retailer_visits')
        .select('id', { count: 'exact', head: true })
        .eq('sales_person_id', user.id)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
      userVisitsCount = visitsCount || 0
    }
    const shiftVisits = Number(todayShift?.visits_count || 0)
    const totalVisits = Math.max(userVisitsCount, shiftVisits)
    const isVisitsMet = totalVisits >= targets.target_visits

    // 3. Fetch today's retailer orders count for THIS USER ONLY
    let userOrdersCount = 0
    let userCashFromOrders = 0
    if (user) {
      const { data: userSalesData } = await supabaseAdmin
        .from('sales_records')
        .select('amount, cash_amount')
        .eq('sales_person_id', user.id)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)

      if (userSalesData) {
        userOrdersCount = userSalesData.length
        userCashFromOrders = userSalesData.reduce((acc, curr) => acc + (Number(curr.cash_amount) || 0), 0)
      }
    }
    const shiftOrders = Number(todayShift?.orders_count || 0)
    const totalOrders = Math.max(userOrdersCount, shiftOrders)
    const isOrdersMet = totalOrders >= targets.target_orders

    // 4. Fetch today's GPS Distance for THIS USER'S SHIFT
    const currentDistance = Number(todayShift?.distance_traveled_km || todayShift?.total_distance || 0)
    const isGpsMet = currentDistance >= targets.target_distance_km

    // 5. Cash Settlement: Cash Collected vs Cash Deposited/Submitted to Office
    const shiftCashCollected = Number(todayShift?.cash_collected || 0)
    const totalCashCollected = Math.max(userCashFromOrders, shiftCashCollected)
    const cashDeposited = Number(todayShift?.cash_deposited || 0)

    let isCashMet = false
    let cashLabel = ''

    if (isShiftCompletedToday) {
      if (totalCashCollected > 0) {
        isCashMet = cashDeposited >= totalCashCollected
        if (isCashMet) {
          cashLabel = `₹${cashDeposited.toLocaleString('en-IN')} / ₹${totalCashCollected.toLocaleString('en-IN')} submitted (Fully settled)`
        } else {
          const remaining = totalCashCollected - cashDeposited
          cashLabel = `₹${cashDeposited.toLocaleString('en-IN')} / ₹${totalCashCollected.toLocaleString('en-IN')} submitted (₹${remaining.toLocaleString('en-IN')} pending)`
        }
      } else {
        isCashMet = true
        cashLabel = `₹0 / ₹0 (No cash collected today)`
      }
    } else if (isShiftActive) {
      isCashMet = false
      if (totalCashCollected > 0) {
        cashLabel = `₹0 / ₹${totalCashCollected.toLocaleString('en-IN')} (Pending shift end handover)`
      } else {
        cashLabel = `₹0 collected · Shift in progress`
      }
    } else {
      isCashMet = false
      cashLabel = totalCashCollected > 0
        ? `₹0 / ₹${totalCashCollected.toLocaleString('en-IN')} (Pending shift start)`
        : `₹0 collected · Pending shift start`
    }

    // Format shift status label
    let shiftLabel = `Pending shift start (0 / ${targets.min_shift_hours}h)`
    if (isShiftTimeMet) {
      shiftLabel = `${shiftHoursFloor}h ${shiftMinsFloor}m elapsed (>= ${targets.min_shift_hours}h goal met)`
    } else if (isShiftActive) {
      shiftLabel = `In Progress · ${shiftHoursFloor}h ${shiftMinsFloor}m / ${targets.min_shift_hours}h`
    } else if (isShiftCompletedToday) {
      shiftLabel = `Shift Ended · ${shiftHoursFloor}h ${shiftMinsFloor}m / ${targets.min_shift_hours}h`
    }

    const tasks: DailyPriorityItem[] = [
      {
        id: 1,
        title: 'Start Shift',
        time: shiftLabel,
        done: isShiftTimeMet,
        icon: 'navigation',
        type: 'shift',
        current: elapsedHours,
        target: targets.min_shift_hours
      },
      {
        id: 2,
        title: 'Retailer Visit',
        time: `${totalVisits} / ${targets.target_visits} visits completed`,
        done: isVisitsMet,
        icon: 'store',
        type: 'retailer',
        current: totalVisits,
        target: targets.target_visits
      },
      {
        id: 3,
        title: 'Retailer Order',
        time: `${totalOrders} / ${targets.target_orders} orders booked`,
        done: isOrdersMet,
        icon: 'package',
        type: 'sales',
        current: totalOrders,
        target: targets.target_orders
      },
      {
        id: 4,
        title: 'GPS Distance',
        time: `${currentDistance} / ${targets.target_distance_km} km tracked`,
        done: isGpsMet,
        icon: 'navigation',
        type: 'gps',
        current: currentDistance,
        target: targets.target_distance_km
      },
      {
        id: 5,
        title: 'Last Cash Settlement',
        time: cashLabel,
        done: isCashMet,
        icon: 'trending',
        type: 'cash',
        current: cashDeposited,
        target: totalCashCollected,
        collected: totalCashCollected,
        deposited: cashDeposited
      }
    ]

    return { tasks, targets, todayShift }
  } catch (err) {
    console.error("fetchDailyPriorities error:", err)
    return {
      targets: defaultTargets,
      todayShift: null,
      tasks: [
        { id: 1, title: 'Start Shift', time: '0h / 6h target', done: false, icon: 'navigation', type: 'shift' },
        { id: 2, title: 'Retailer Visit', time: '0 / 5 visits completed', done: false, icon: 'store', type: 'retailer' },
        { id: 3, title: 'Retailer Order', time: '0 / 3 orders booked', done: false, icon: 'package', type: 'sales' },
        { id: 4, title: 'GPS Distance', time: '0 / 15 km tracked', done: false, icon: 'navigation', type: 'gps' },
        { id: 5, title: 'Last Cash Settlement', time: '₹0 collected · Pending shift start', done: false, icon: 'trending', type: 'cash' },
      ]
    }
  }
}



