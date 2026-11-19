'use server'

import { supabaseAdmin } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { checkDeletePassword } from '@/utils/deletePassword'

const VALID_ROLES = ['admin', 'manager', 'sales']

// Ensure whoever is calling these has the right role.
// Roles live in app_metadata, which only the service-role key can change.
async function enforceRolePermissions(allowedRoles: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const role = user?.app_metadata?.role

  if (!user || !allowedRoles.includes(role)) {
    throw new Error('Unauthorized Action')
  }
  return user.id as string
}

// Everyone's role, read fresh from Supabase (the app's role lives in app_metadata).
async function readAllRoles(): Promise<Map<string, string>> {
  const roles = new Map<string, string>()
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(error.message)
    for (const u of data.users) roles.set(u.id, String(u.app_metadata?.role || '').toLowerCase())
    if (data.users.length < 1000) break
  }
  return roles
}

/** True when at least one admin other than `excludeId` exists. */
async function anotherAdminExists(excludeId: string): Promise<boolean> {
  const roles = await readAllRoles()
  for (const [id, role] of roles) if (id !== excludeId && role === 'admin') return true
  return false
}

function parseAllowances(raw: FormDataEntryValue | null, employmentType: string) {
  // Allowances only apply to commission users
  if (employmentType !== 'commission' || !raw) return []
  try {
    const parsed = JSON.parse(raw as string)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function readUserForm(formData: FormData) {
  const role = ((formData.get('role') as string) || '').trim().toLowerCase()
  const name = ((formData.get('name') as string) || '').trim()
  const district = (formData.get('district') as string)?.trim() || 'Tinsukia'
  const employment_type = (formData.get('employment_type') as string) || 'monthly_salary'
  const base_rate = parseFloat(formData.get('base_rate') as string) || 0
  const allowances = parseAllowances(formData.get('allowances'), employment_type)
  return { role, name, district, employment_type, base_rate, allowances }
}

export async function fetchUsers() {
  await enforceRolePermissions(['admin'])

  // listUsers returns 50 per page by default; page through everyone.
  const all = []
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(error.message)
    all.push(...data.users)
    if (data.users.length < 1000) break
  }
  return all
}

export async function createUser(formData: FormData) {
  await enforceRolePermissions(['admin'])

  const email = ((formData.get('email') as string) || '').trim()
  const password = formData.get('password') as string
  const { role, name, district, employment_type, base_rate, allowances } = readUserForm(formData)

  if (!VALID_ROLES.includes(role)) return { error: 'Please choose a valid role.' }
  if (base_rate < 0) return { error: 'Base rate cannot be negative.' }

  const { error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // Display-only fields: users can edit these themselves, so nothing
    // security- or pay-related goes here.
    user_metadata: { name, district },
    // Protected fields: only the service-role key can write app_metadata.
    app_metadata: { role, employment_type, base_rate, allowances }
  })

  if (error) return { error: error.message }

  revalidatePath('/dashboard/users')
  return { success: true }
}

export async function updateUser(id: string, formData: FormData) {
  const callerId = await enforceRolePermissions(['admin'])

  const email = ((formData.get('email') as string) || '').trim()
  // A new password is set only when one is typed (blank = keep the current one).
  // No rules of our own on what it can be; Supabase's own minimum still applies.
  const rawPassword = formData.get('password')
  const newPassword = typeof rawPassword === 'string' && rawPassword !== '' ? rawPassword : null
  const { role, name, district, employment_type, base_rate, allowances } = readUserForm(formData)

  if (!VALID_ROLES.includes(role)) return { error: 'Please choose a valid role.' }
  if (base_rate < 0) return { error: 'Base rate cannot be negative.' }

  // Never leave the app without an admin: an admin may not take away their own admin
  // role, and the last admin's role cannot be changed.
  if (role !== 'admin') {
    if (id === callerId) return { error: 'You cannot remove your own admin role. Ask another admin to change it.' }
    const roles = await readAllRoles()
    if (roles.get(id) === 'admin' && !(await anotherAdminExists(id))) {
      return { error: 'This is the only admin, so its role cannot be changed. Make another user an admin first.' }
    }
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
    email,
    ...(newPassword !== null ? { password: newPassword } : {}),
    // Old copies of role / pay in user_metadata are cleared so nothing reads them by mistake.
    user_metadata: { name, district, role: null, employment_type: null, base_rate: null, allowances: null },
    app_metadata: { role, employment_type, base_rate, allowances }
  })

  if (error) return { error: error.message }

  // A changed password signs that person out of every device. The password is already
  // saved by now, so if this step can't run the save still stands and we say so.
  let signedOut = false
  let warning: string | undefined
  if (newPassword !== null) {
    const { error: revokeError } = await supabaseAdmin.rpc('fn_revoke_user_sessions', { p_user_id: id })
    if (revokeError) {
      warning = /fn_revoke_user_sessions|schema cache/.test(revokeError.message)
        ? 'The new password is saved, but the person was not signed out of their other devices yet: run supabase/migrations/20261120_revoke_sessions.sql in Supabase.'
        : `The new password is saved, but signing the person out of their other devices failed: ${revokeError.message}`
    } else {
      signedOut = true
    }
  }

  revalidatePath('/dashboard/users')
  return { success: true, passwordChanged: newPassword !== null, signedOut, ...(warning ? { warning } : {}) }
}

export async function deleteUser(id: string, deletePassword: string) {
  // ONLY admins can delete
  const callerId = await enforceRolePermissions(['admin'])

  const pwError = checkDeletePassword(deletePassword)
  if (pwError) return { error: pwError }

  // Never leave the app without an admin, and never delete the account you are using.
  if (id === callerId) return { error: 'You cannot delete your own account. Ask another admin to do it.' }
  const roles = await readAllRoles()
  if (roles.get(id) === 'admin' && !(await anotherAdminExists(id))) {
    return { error: 'This is the only admin, so it cannot be deleted.' }
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/users')
  return { success: true }
}
