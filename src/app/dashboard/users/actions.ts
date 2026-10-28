'use server'

import { supabaseAdmin } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

// Ensure whoever is calling these has admin/manager rights
async function enforceRolePermissions(allowedRoles: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const role = user?.user_metadata?.role

  if (!user || !allowedRoles.includes(role)) {
    throw new Error('Unauthorized Action')
  }
}

export async function fetchUsers() {
  await enforceRolePermissions(['admin', 'manager'])
  
  // Note: listUsers is limited to 50 users by default. For a real app, implement pagination.
  const { data, error } = await supabaseAdmin.auth.admin.listUsers()
  
  if (error) throw new Error(error.message)
  return data.users
}

export async function createUser(formData: FormData) {
  await enforceRolePermissions(['admin', 'manager'])

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const role = formData.get('role') as string
  const name = formData.get('name') as string
  const district = (formData.get('district') as string)?.trim() || 'Tinsukia'
  const employment_type = (formData.get('employment_type') as string) || 'monthly_salary'
  const base_rate = parseFloat(formData.get('base_rate') as string) || 0
  const allowancesRaw = formData.get('allowances') as string
  let allowances: any[] = []
  try {
    if (allowancesRaw) allowances = JSON.parse(allowancesRaw)
  } catch {
    allowances = []
  }
  // Enforce: Allowances only for commission users
  if (employment_type !== 'commission') {
    allowances = []
  }

  const { error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { 
      role, 
      name,
      district,
      employment_type,
      base_rate,
      allowances
    }
  })

  if (error) return { error: error.message }
  
  revalidatePath('/dashboard/users')
  return { success: true }
}

export async function updateUser(id: string, formData: FormData) {
  await enforceRolePermissions(['admin', 'manager'])

  const email = formData.get('email') as string
  const role = formData.get('role') as string
  const name = formData.get('name') as string
  const district = (formData.get('district') as string)?.trim() || 'Tinsukia'
  const employment_type = (formData.get('employment_type') as string) || 'monthly_salary'
  const base_rate = parseFloat(formData.get('base_rate') as string) || 0
  const allowancesRaw = formData.get('allowances') as string
  let allowances: any[] = []
  try {
    if (allowancesRaw) allowances = JSON.parse(allowancesRaw)
  } catch {
    allowances = []
  }
  // Enforce: Allowances only for commission users
  if (employment_type !== 'commission') {
    allowances = []
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
    email,
    user_metadata: { 
      role, 
      name,
      district,
      employment_type,
      base_rate,
      allowances
    }
  })

  if (error) return { error: error.message }
  
  revalidatePath('/dashboard/users')
  return { success: true }
}

export async function deleteUser(id: string) {
  // ONLY admins can delete
  await enforceRolePermissions(['admin'])

  const { error } = await supabaseAdmin.auth.admin.deleteUser(id)
  
  if (error) return { error: error.message }
  
  revalidatePath('/dashboard/users')
  return { success: true }
}
