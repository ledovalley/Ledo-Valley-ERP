'use server'

import { createClient } from '@/utils/supabase/server';
import { supabaseAdmin } from '@/utils/supabase/admin';
import { revalidatePath } from 'next/cache';

// Enforce factory role permissions
async function enforceFactoryAccess() {
  const { getCachedUser } = await import('@/utils/supabase/server');
  const user = await getCachedUser();
  const role = user?.user_metadata?.role;

  if (!user || !['admin', 'manager', 'employee'].includes(role)) {
    throw new Error('Unauthorized: Insufficient permissions for factory operations.');
  }

  return { user, role };
}

// 1. Fetch All Loose Lots
export async function fetchLooseLots() {
  await enforceFactoryAccess();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('factory_loose_lots')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching loose lots:', error);
    return [];
  }

  return (data || []).map(row => ({
    id: row.id,
    lotNumber: row.lot_number,
    grade: row.grade,
    mark: row.mark,
    bags: Number(row.bags),
    weightPerBag: Number(row.weight_per_bag),
    weight: Number(row.weight),
    date: row.date,
    labels: row.labels || []
  }));
}

// 1b. Fetch All Factory Packet Catalog Products
export async function fetchPacketCatalog() {
  await enforceFactoryAccess();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('factory_packet_catalog')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching factory packet catalog:', error);
    return [];
  }

  return (data || []).map(row => ({
    id: row.id,
    name: row.name,
    unit: row.unit || 'KG',
    size: Number(row.size) || 1,
    stock: Number(row.stock) || 0,
    hsnCode: row.hsn_code || '',
    gstRate: Number(row.gst_rate) || 5
  }));
}

// 1c. Add / Edit Factory Packet Product Template
export async function savePacketProduct(product: {
  id?: string;
  name: string;
  unit: string;
  size: number;
  stock?: number;
  hsnCode?: string;
  gstRate?: number;
}) {
  const { user, role } = await enforceFactoryAccess();
  if (!['admin', 'manager'].includes(role)) {
    return { error: 'Only admins and managers can modify factory product templates.' };
  }

  const productId = product.id || `p-${Date.now()}`;
  const payload = {
    id: productId,
    name: product.name.trim(),
    unit: product.unit || 'KG',
    size: product.size || 1,
    stock: product.stock !== undefined ? product.stock : 0,
    hsn_code: product.hsnCode || '',
    gst_rate: product.gstRate !== undefined ? product.gstRate : 5,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabaseAdmin
    .from('factory_packet_catalog')
    .upsert(payload, { onConflict: 'id' });

  if (error) {
    return { error: error.message };
  }

  await supabaseAdmin.from('factory_history').insert({
    id: `hst-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: product.id ? 'PACKET_TEMPLATE_UPDATED' : 'PACKET_TEMPLATE_CREATED',
    description: `${product.id ? 'Updated' : 'Created'} packet template: ${product.name} (${product.size} kg/${product.unit})`,
    user_id: user.id,
    user_name: user.user_metadata?.name || user.email
  });

  revalidatePath('/factory');
  return { success: true, id: productId };
}

// 1d. Delete Factory Packet Product Template
export async function deletePacketProduct(productId: string) {
  const { user, role } = await enforceFactoryAccess();
  if (!['admin', 'manager'].includes(role)) {
    return { error: 'Only admins and managers can delete product templates.' };
  }

  if (productId === 'p-variance') {
    return { error: 'System variance tracking ledger cannot be deleted.' };
  }

  const { error } = await supabaseAdmin
    .from('factory_packet_catalog')
    .delete()
    .eq('id', productId);

  if (error) {
    return { error: error.message };
  }

  await supabaseAdmin.from('factory_history').insert({
    id: `hst-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: 'PACKET_TEMPLATE_DELETED',
    description: `Deleted packet template: ${productId}`,
    user_id: user.id,
    user_name: user.user_metadata?.name || user.email
  });

  revalidatePath('/factory');
  return { success: true };
}

// 1e. Receive Packaged Stock
export async function receivePacketStock(data: {
  productId: string;
  quantity: number;
  date: string;
}) {
  const { user, role } = await enforceFactoryAccess();
  if (!['admin', 'manager'].includes(role)) {
    return { error: 'Only admins and managers can receive packaged stock.' };
  }

  const { data: current, error: fetchErr } = await supabaseAdmin
    .from('factory_packet_catalog')
    .select('*')
    .eq('id', data.productId)
    .single();

  if (fetchErr || !current) {
    return { error: fetchErr?.message || 'Product not found in packet catalog.' };
  }

  const newStock = Number(current.stock) + data.quantity;

  const { error: updateErr } = await supabaseAdmin
    .from('factory_packet_catalog')
    .update({ stock: newStock, updated_at: new Date().toISOString() })
    .eq('id', data.productId);

  if (updateErr) {
    return { error: updateErr.message };
  }

  await supabaseAdmin.from('factory_history').insert({
    id: `hst-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: 'PACKET_STOCK_RECEIVED',
    description: `Received ${data.quantity} ${current.unit}(s) of "${current.name}". New Stock: ${newStock}`,
    user_id: user.id,
    user_name: user.user_metadata?.name || user.email,
    details: {
      productId: data.productId,
      productName: current.name,
      addedQuantity: data.quantity,
      newStock,
      date: data.date
    }
  });

  revalidatePath('/factory');
  return { success: true, newStock };
}

// 2. Add / Edit Loose Lot
export async function saveLooseLot(lot: {
  id: string;
  lotNumber: string;
  grade: string;
  mark: string;
  bags: number;
  weightPerBag: number;
  weight: number;
  date: string;
  labels: string[];
}) {
  const { user } = await enforceFactoryAccess();

  const isNew = !lot.id || lot.id.startsWith('new-');
  const lotId = isNew ? `lot-${Date.now()}` : lot.id;

  const payload = {
    id: lotId,
    lot_number: lot.lotNumber.trim(),
    grade: lot.grade.trim(),
    mark: lot.mark.trim(),
    bags: lot.bags || 0,
    weight_per_bag: lot.weightPerBag || 0,
    weight: lot.weight || 0,
    date: lot.date || new Date().toISOString().split('T')[0],
    labels: lot.labels || [],
    updated_at: new Date().toISOString()
  };

  const { error } = await supabaseAdmin
    .from('factory_loose_lots')
    .upsert(payload);

  if (error) {
    console.error('Error saving loose lot:', error);
    return { error: error.message };
  }

  // Record audit history
  await supabaseAdmin.from('factory_history').insert({
    id: `hst-${Date.now()}`,
    type: isNew ? 'LOT_ADDED' : 'LOT_EDITED',
    description: `${isNew ? 'Added' : 'Updated'} lot ${lot.lotNumber} (${lot.mark}) - ${lot.weight} kg`,
    user_id: user.id,
    user_name: user.user_metadata?.name || user.email,
    details: payload
  });

  revalidatePath('/factory');
  return { success: true, lotId };
}

// 3. Delete Loose Lot
export async function deleteLooseLot(lotId: string) {
  const { user, role } = await enforceFactoryAccess();
  if (!['admin', 'manager'].includes(role)) {
    return { error: 'Only admins and managers can delete tea lots.' };
  }

  // Protect system ledger lots
  if (['l-balance', 'l-orthodox', 'l-cardamom', 'l-cardamom-husk'].includes(lotId)) {
    return { error: 'System ledger lots cannot be deleted.' };
  }

  const { error } = await supabaseAdmin
    .from('factory_loose_lots')
    .delete()
    .eq('id', lotId);

  if (error) {
    return { error: error.message };
  }

  await supabaseAdmin.from('factory_history').insert({
    id: `hst-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: 'LOT_DELETED',
    description: `Deleted loose lot: ${lotId}`,
    user_id: user.id,
    user_name: user.user_metadata?.name || user.email
  });

  revalidatePath('/factory');
  return { success: true };
}

// 3b. Purge All NIL Loose Stock
export async function purgeNilLooseLots() {
  const { user, role } = await enforceFactoryAccess();
  if (!['admin', 'manager'].includes(role)) {
    return { error: 'Only admins and managers can purge empty stock.' };
  }

  const systemIds = ['l-balance', 'l-orthodox', 'l-cardamom', 'l-cardamom-husk'];

  // 1. Fetch IDs of lots to delete
  const { data: lotsToDelete, error: fetchErr } = await supabaseAdmin
    .from('factory_loose_lots')
    .select('id, lot_number, mark')
    .or('bags.lte.0,weight.lte.0')
    .not('id', 'in', `(${systemIds.join(',')})`);

  if (fetchErr) {
    console.error('Error finding NIL lots to purge:', fetchErr);
    return { error: fetchErr.message };
  }

  if (!lotsToDelete || lotsToDelete.length === 0) {
    return { success: true, count: 0, message: 'No NIL stock lots found to purge.' };
  }

  const ids = lotsToDelete.map(l => l.id);

  // 2. Batch delete in a single atomic SQL command
  const { error: deleteErr } = await supabaseAdmin
    .from('factory_loose_lots')
    .delete()
    .in('id', ids);

  if (deleteErr) {
    console.error('Error batch deleting NIL lots:', deleteErr);
    return { error: deleteErr.message };
  }

  // 3. Log single immutable audit history entry
  await supabaseAdmin.from('factory_history').insert({
    id: `hst-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: 'NIL_STOCK_PURGED',
    description: `Purged ${ids.length} empty (NIL) loose tea lots from warehouse.`,
    user_id: user.id,
    user_name: user.user_metadata?.name || user.email,
    details: {
      count: ids.length,
      sample_lots: lotsToDelete.slice(0, 10).map(l => `${l.mark} (${l.lot_number})`)
    }
  });

  revalidatePath('/factory');
  return { success: true, count: ids.length };
}

// 3c. Adjust System Ledger / Lot Weight
export async function adjustLedgerLot(targetId: string, amount: number, reason: string) {
  const { user, role } = await enforceFactoryAccess();
  if (!['admin', 'manager'].includes(role)) {
    return { error: 'Only admins and managers can adjust system ledgers.' };
  }

  // 1. Fetch current lot
  const { data: lot, error: fetchErr } = await supabaseAdmin
    .from('factory_loose_lots')
    .select('*')
    .eq('id', targetId)
    .single();

  if (fetchErr || !lot) {
    return { error: fetchErr?.message || 'Ledger lot not found.' };
  }

  const prevWeight = Number(lot.weight);
  const newWeight = Math.max(0, Number((prevWeight + amount).toFixed(3)));

  // 2. Update weight
  const { error: updateErr } = await supabaseAdmin
    .from('factory_loose_lots')
    .update({
      weight: newWeight,
      updated_at: new Date().toISOString()
    })
    .eq('id', targetId);

  if (updateErr) {
    return { error: updateErr.message };
  }

  // 3. Log audit history
  await supabaseAdmin.from('factory_history').insert({
    id: `hst-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: 'LEDGER_ADJUSTMENT',
    description: `Adjusted ${lot.mark} by ${amount > 0 ? '+' : ''}${amount} kg. Reason: ${reason}`,
    user_id: user.id,
    user_name: user.user_metadata?.name || user.email,
    details: {
      target_id: targetId,
      mark: lot.mark,
      prev_weight: prevWeight,
      adjustment_amount: amount,
      new_weight: newWeight,
      reason
    }
  });

  revalidatePath('/factory');
  return { success: true, newWeight };
}

// 4. Fetch Active Blends (Under Process)
export async function fetchUnderProcessBlends() {
  await enforceFactoryAccess();
  const supabase = await createClient();

  const { data: blends, error } = await supabase
    .from('factory_blends')
    .select(`
      id,
      blend_name,
      batch_no,
      date,
      total_quantity,
      status,
      created_at,
      factory_blend_lots_used (
        lot_id,
        lot_number,
        mark,
        grade,
        bags_used,
        weight_used
      )
    `)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching blends:', error);
    return [];
  }

  return (blends || []).map(b => ({
    id: b.id,
    blendName: b.blend_name,
    batchNo: b.batch_no,
    date: b.date,
    totalQuantity: Number(b.total_quantity),
    status: b.status,
    lotsUsed: (b.factory_blend_lots_used || []).map((l: any) => ({
      lotId: l.lot_id,
      lotNumber: l.lot_number,
      mark: l.mark,
      grade: l.grade,
      bagsUsed: Number(l.bags_used),
      weightUsed: Number(l.weight_used)
    }))
  }));
}

// 5. Create Blend (Atomic Stored Procedure)
export async function createFactoryBlend(data: {
  blendId?: string;
  blendName: string;
  batchNo: string;
  date: string;
  totalQuantity: number;
  lots: {
    lotId: string;
    lotNumber: string;
    mark: string;
    grade?: string;
    bagsUsed: number;
    weightUsed: number;
  }[];
}) {
  const { user } = await enforceFactoryAccess();

  const blendId = data.blendId || `BLD-${Date.now()}`;
  const historyId = `hst-${Date.now()}`;
  const userName = user.user_metadata?.name || user.email;

  // Execute ACID stored procedure via supabaseAdmin RPC
  const { data: result, error } = await supabaseAdmin.rpc('fn_create_factory_blend', {
    p_blend_id: blendId,
    p_blend_name: data.blendName,
    p_batch_no: data.batchNo,
    p_date: data.date,
    p_total_quantity: data.totalQuantity,
    p_created_by: user.id,
    p_lots: data.lots,
    p_history_id: historyId,
    p_user_name: userName
  });

  if (error) {
    console.error('Error creating factory blend:', error);
    return { error: error.message };
  }

  revalidatePath('/factory');
  return { success: true, blendId };
}

// 6. Finalize Blend (Atomic Packaging & Completion)
export async function finalizeFactoryBlend(data: {
  blendId: string;
  returnedLoose: number;
  returnLotId: string; // e.g. 'l-balance'
  outputs: {
    productId: string;
    productName: string;
    quantity: number;
    unit: string;
    totalWeight: number;
  }[];
}) {
  const { user } = await enforceFactoryAccess();

  const historyId = `hst-${Date.now()}`;
  const userName = user.user_metadata?.name || user.email;

  const { data: result, error } = await supabaseAdmin.rpc('fn_finalize_factory_blend', {
    p_blend_id: data.blendId,
    p_returned_loose: data.returnedLoose || 0,
    p_return_lot_id: data.returnLotId || 'l-balance',
    p_outputs: data.outputs,
    p_history_id: historyId,
    p_user_id: user.id,
    p_user_name: userName
  });

  if (error) {
    console.error('Error finalizing blend:', error);
    return { error: error.message };
  }

  revalidatePath('/factory');
  return { success: true };
}

// 7. Delete / Revert Blend (Atomic Revert)
export async function deleteFactoryBlend(blendId: string) {
  const { user, role } = await enforceFactoryAccess();
  if (!['admin', 'manager'].includes(role)) {
    return { error: 'Permission Denied: Only admins and managers can delete under-process blends.' };
  }

  const historyId = `hst-${Date.now()}`;
  const userName = user.user_metadata?.name || user.email;

  const { data: result, error } = await supabaseAdmin.rpc('fn_delete_factory_blend', {
    p_blend_id: blendId,
    p_history_id: historyId,
    p_user_id: user.id,
    p_user_name: userName
  });

  if (error) {
    console.error('Error deleting blend:', error);
    return { error: error.message };
  }

  revalidatePath('/factory');
  return { success: true };
}

// 8. Fetch History Ledger & Sequence Gap Analysis (Paginated)
export async function fetchFactoryHistory(limit: number = 300, offset: number = 0) {
  await enforceFactoryAccess();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('factory_history')
    .select('*')
    .order('timestamp', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching factory history:', error);
    return [];
  }

  return data || [];
}

