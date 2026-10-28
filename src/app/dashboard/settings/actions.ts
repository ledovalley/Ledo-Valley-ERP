'use server'

import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function fetchAllProducts() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error("Fetch products error:", error.message)
    return []
  }
  return data || []
}

export async function createProduct(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const role = user?.user_metadata?.role
  if (role !== 'admin') {
    return { error: "Unauthorized. Only administrators can create products." }
  }

  const name = (formData.get('name') as string)?.trim()
  const category = (formData.get('category') as string)?.trim() || name
  const unit = (formData.get('unit') as string)?.trim() || 'kg'
  const description = (formData.get('description') as string)?.trim() || ''

  if (!name) {
    return { error: "Product name is required." }
  }

  const { data, error } = await supabase
    .from('products')
    .insert({
      name,
      category,
      unit,
      description,
      is_active: true
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return { error: "A product with this name already exists." }
    }
    return { error: error.message }
  }

  revalidatePath('/dashboard/settings')
  revalidatePath('/dashboard/sales')
  return { success: true, product: data }
}

export async function updateProduct(id: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const role = user?.user_metadata?.role
  if (role !== 'admin') {
    return { error: "Unauthorized. Only administrators can update products." }
  }

  const name = (formData.get('name') as string)?.trim()
  const category = (formData.get('category') as string)?.trim() || name
  const unit = (formData.get('unit') as string)?.trim() || 'kg'
  const description = (formData.get('description') as string)?.trim() || ''

  if (!name) {
    return { error: "Product name is required." }
  }

  const { data, error } = await supabase
    .from('products')
    .update({
      name,
      category,
      unit,
      description
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return { error: "Another product with this name already exists." }
    }
    return { error: error.message }
  }

  revalidatePath('/dashboard/settings')
  revalidatePath('/dashboard/sales')
  return { success: true, product: data }
}

export async function toggleProductStatus(id: string, currentStatus: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const role = user?.user_metadata?.role
  if (role !== 'admin') {
    return { error: "Unauthorized. Only administrators can modify products." }
  }

  const { error } = await supabase
    .from('products')
    .update({ is_active: !currentStatus })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/settings')
  revalidatePath('/dashboard/sales')
  return { success: true }
}

export async function deleteProduct(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const role = user?.user_metadata?.role
  if (role !== 'admin') {
    return { error: "Unauthorized. Only administrators can delete products." }
  }

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/settings')
  revalidatePath('/dashboard/sales')
  return { success: true }
}

// -------------------------------------------------------------
// TARGET SETUP ACTIONS (Admin & Manager)
// -------------------------------------------------------------

export interface EligibleEmployee {
  id: string
  email: string
  name: string
  role: string
  district: string
}

export interface EmployeeTarget {
  id: string
  user_id: string
  month: string
  sales_target: number
  retailer_reach_target: number
  orders_target: number
  created_by?: string
  created_at?: string
  updated_at?: string
}

export async function fetchEligibleEmployees(): Promise<EligibleEmployee[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const role = user?.user_metadata?.role

  if (!user || !['admin', 'manager'].includes(role)) {
    return []
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers()
    if (error || !data?.users) {
      console.error("Fetch eligible employees error:", error?.message)
      return []
    }

    // Only employees below manager level (exclude admin and manager)
    const eligible = data.users
      .filter((u: any) => {
        const uRole = u.user_metadata?.role?.toLowerCase() || 'employee'
        return uRole !== 'admin' && uRole !== 'manager'
      })
      .map((u: any) => ({
        id: u.id,
        email: u.email || '',
        name: u.user_metadata?.name || u.email?.split('@')[0] || 'Employee',
        role: u.user_metadata?.role || 'employee',
        district: u.user_metadata?.district || 'Not Assigned'
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return eligible
  } catch (err) {
    console.error("fetchEligibleEmployees exception:", err)
    return []
  }
}

export async function fetchTargetsForMonth(month: string): Promise<EmployeeTarget[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('employee_targets')
      .select('*')
      .eq('month', month)

    if (error) {
      console.error("fetchTargetsForMonth error:", error.message)
      return []
    }

    return (data || []) as EmployeeTarget[]
  } catch (err) {
    console.error("fetchTargetsForMonth exception:", err)
    return []
  }
}

export async function saveSingleTarget(
  userId: string,
  month: string,
  salesTarget: number,
  reachTarget: number,
  ordersTarget: number
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const role = user?.user_metadata?.role

  if (!user || !['admin', 'manager'].includes(role)) {
    return { error: "Unauthorized. Only administrators and managers can set targets." }
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('employee_targets')
      .upsert({
        user_id: userId,
        month,
        sales_target: Math.max(0, Number(salesTarget) || 0),
        retailer_reach_target: Math.max(0, Number(reachTarget) || 0),
        orders_target: Math.max(0, Number(ordersTarget) || 0),
        created_by: user.id,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,month' })
      .select()
      .single()

    if (error) {
      return { error: error.message }
    }

    revalidatePath('/dashboard/settings')
    revalidatePath('/dashboard')
    return { success: true, target: data }
  } catch (err: any) {
    return { error: err.message || 'Failed to update target' }
  }
}

export async function saveBulkTargets(
  userIds: string[],
  month: string,
  salesTarget: number,
  reachTarget: number,
  ordersTarget: number
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const role = user?.user_metadata?.role

  if (!user || !['admin', 'manager'].includes(role)) {
    return { error: "Unauthorized. Only administrators and managers can set targets." }
  }

  if (!userIds || userIds.length === 0) {
    return { error: "Please select at least one employee." }
  }

  try {
    const rows = userIds.map(uid => ({
      user_id: uid,
      month,
      sales_target: Math.max(0, Number(salesTarget) || 0),
      retailer_reach_target: Math.max(0, Number(reachTarget) || 0),
      orders_target: Math.max(0, Number(ordersTarget) || 0),
      created_by: user.id,
      updated_at: new Date().toISOString()
    }))

    const { error } = await supabaseAdmin
      .from('employee_targets')
      .upsert(rows, { onConflict: 'user_id,month' })

    if (error) {
      return { error: error.message }
    }

    revalidatePath('/dashboard/settings')
    revalidatePath('/dashboard')
    return { success: true, count: userIds.length }
  } catch (err: any) {
    return { error: err.message || 'Failed to update bulk targets' }
  }
}
