'use server'

import { createClient } from '@/utils/supabase/server';
import { supabaseAdmin } from '@/utils/supabase/admin';
import { getUserRole } from '@/utils/authRoles';
import { revalidatePath } from 'next/cache';

// Enforce factory role permissions (Fix C2, M1: secure role via authRoles)
async function enforceFactoryAccess() {
  const { getCachedUser } = await import('@/utils/supabase/server');
  const user = await getCachedUser();
  const role = getUserRole(user);

  if (!user || !['admin', 'manager'].includes(role)) {
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
    id: crypto.randomUUID(),
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
    id: crypto.randomUUID(),
    type: 'PACKET_TEMPLATE_DELETED',
    description: `Deleted packet template: ${productId}`,
    user_id: user.id,
    user_name: user.user_metadata?.name || user.email
  });

  revalidatePath('/factory');
  return { success: true };
}

// 1e. Receive Packaged Stock (Atomic RPC)
export async function receivePacketStock(data: {
  productId: string;
  quantity: number;
  date: string;
}) {
  const { user, role } = await enforceFactoryAccess();
  if (!['admin', 'manager'].includes(role)) {
    return { error: 'Only admins and managers can receive packaged stock.' };
  }

  if (!data.quantity || data.quantity <= 0) {
    return { error: 'Received quantity must be greater than 0.' };
  }

  const historyId = crypto.randomUUID();
  const userName = user.user_metadata?.name || user.email;

  const { data: result, error } = await supabaseAdmin.rpc('fn_receive_packet_stock', {
    p_product_id: data.productId,
    p_quantity: data.quantity,
    p_date: data.date,
    p_history_id: historyId,
    p_user_id: user.id,
    p_user_name: userName
  });

  if (error) {
    console.error('Error receiving packet stock:', error);
    return { error: error.message };
  }

  revalidatePath('/factory');
  return { success: true, newStock: result?.newStock };
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

  // Record audit history (Fix M3: UUID)
  await supabaseAdmin.from('factory_history').insert({
    id: crypto.randomUUID(),
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
    id: crypto.randomUUID(),
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

  // 1. Fetch IDs of lots to delete (Fix H1: only delete lots where remaining weight <= 0)
  const { data: lotsToDelete, error: fetchErr } = await supabaseAdmin
    .from('factory_loose_lots')
    .select('id, lot_number, mark, weight, bags')
    .lte('weight', 0)
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

  // 3. Log single immutable audit history entry with UUID (Fix M3)
  await supabaseAdmin.from('factory_history').insert({
    id: crypto.randomUUID(),
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

// 3c. Adjust System Ledger / Lot Weight (Atomic RPC)
export async function adjustLedgerLot(targetId: string, amount: number, reason: string) {
  const { user, role } = await enforceFactoryAccess();
  if (!['admin', 'manager'].includes(role)) {
    return { error: 'Only admins and managers can adjust system ledgers.' };
  }

  if (!amount || amount === 0) {
    return { error: 'Adjustment amount cannot be zero.' };
  }

  const historyId = crypto.randomUUID();
  const userName = user.user_metadata?.name || user.email;

  const { data: result, error } = await supabaseAdmin.rpc('fn_adjust_lot_weight', {
    p_target_id: targetId,
    p_amount: amount,
    p_reason: reason.trim(),
    p_history_id: historyId,
    p_user_id: user.id,
    p_user_name: userName
  });

  if (error) {
    console.error('Error adjusting ledger lot:', error);
    return { error: error.message };
  }

  revalidatePath('/factory');
  return { success: true, newWeight: result?.newWeight };
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
  const historyId = crypto.randomUUID();
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
  return { success: true, blendId, serialNo: result?.serialNo };
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

  const historyId = crypto.randomUUID();
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

  const historyId = crypto.randomUUID();
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

// -----------------------------------------------------------------------------
// 9. Stock Take Types & Server Actions
// -----------------------------------------------------------------------------

export interface StockTake {
  id: string;
  note: string | null;
  status: 'OPEN' | 'APPLIED' | 'CANCELLED';
  startedAt: string;
  startedByName: string | null;
  closedAt: string | null;
  closedByName: string | null;
  summary: Record<string, any> | null;
}

export interface StockTakeCount {
  id: string;
  stockTakeId: string;
  lotId: string | null;
  lotNumber: string;
  mark: string;
  grade: string | null;
  countedBags: number;
  weightPerBag: number | null;
  countedWeight: number;
  note: string | null;
  updatedAt: string;
  updatedByName: string | null;
}

function mapTake(t: any): StockTake {
  return {
    id: t.id,
    note: t.note ?? null,
    status: t.status,
    startedAt: t.started_at,
    startedByName: t.started_by_name ?? null,
    closedAt: t.closed_at ?? null,
    closedByName: t.closed_by_name ?? null,
    summary: t.summary ?? null
  };
}

function mapCount(c: any): StockTakeCount {
  return {
    id: c.id,
    stockTakeId: c.stock_take_id,
    lotId: c.lot_id ?? null,
    lotNumber: c.lot_number,
    mark: c.mark,
    grade: c.grade ?? null,
    countedBags: Number(c.counted_bags),
    weightPerBag: c.weight_per_bag !== null && c.weight_per_bag !== undefined ? Number(c.weight_per_bag) : null,
    countedWeight: Number(c.counted_weight),
    note: c.note ?? null,
    updatedAt: c.updated_at,
    updatedByName: c.updated_by_name ?? null
  };
}

export async function fetchOpenStockTake(): Promise<
  { take: StockTake | null; counts: StockTakeCount[] } | { error: string }
> {
  try {
    await enforceFactoryAccess();
    const supabase = await createClient();

    const { data: take, error } = await supabase
      .from('factory_stock_takes')
      .select('*')
      .eq('status', 'OPEN')
      .maybeSingle();

    if (error) return { error: error.message };
    if (!take) return { take: null, counts: [] };

    const { data: counts, error: cErr } = await supabase
      .from('factory_stock_take_counts')
      .select('*')
      .eq('stock_take_id', take.id)
      .order('updated_at', { ascending: true });

    if (cErr) return { error: cErr.message };

    return { take: mapTake(take), counts: (counts || []).map(mapCount) };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function fetchStockTakeHistory(limit: number = 10): Promise<{ takes: StockTake[] } | { error: string }> {
  try {
    await enforceFactoryAccess();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('factory_stock_takes')
      .select('*')
      .neq('status', 'OPEN')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) return { error: error.message };
    return { takes: (data || []).map(mapTake) };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function startStockTake(note?: string) {
  try {
    const { user, role } = await enforceFactoryAccess();
    if (!['admin', 'manager'].includes(role)) return { error: 'Only admins and managers can run a stock take.' };

    const userName = user.user_metadata?.name || user.email;

    const { data, error } = await supabaseAdmin
      .from('factory_stock_takes')
      .insert({ note: (note || '').trim() || null, started_by: user.id, started_by_name: userName })
      .select('*')
      .single();

    if (error) {
      if (/uq_factory_stock_takes_one_open|duplicate key/i.test(error.message)) {
        return { error: 'A stock take is already in progress. Continue or cancel it first.' };
      }
      return { error: error.message };
    }

    await supabaseAdmin.from('factory_history').insert({
      id: crypto.randomUUID(),
      type: 'STOCK_TAKE_STARTED',
      description: `Started a stock take${data.note ? `: ${data.note}` : ''}.`,
      user_id: user.id,
      user_name: userName,
      details: { stockTakeId: data.id }
    });

    return { success: true, take: mapTake(data) };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function saveStockTakeCount(
  takeId: string,
  entry: {
    id?: string;
    lotId: string | null;
    lotNumber: string;
    mark: string;
    grade?: string | null;
    countedBags: number;
    weightPerBag?: number | null;
    countedWeight: number;
    note?: string | null;
  }
) {
  try {
    const { user, role } = await enforceFactoryAccess();
    if (!['admin', 'manager'].includes(role)) return { error: 'Only admins and managers can run a stock take.' };

    const userName = user.user_metadata?.name || user.email;

    const row = {
      stock_take_id: takeId,
      lot_id: entry.lotId,
      lot_number: entry.lotNumber.trim(),
      mark: entry.mark.trim(),
      grade: (entry.grade || '').trim() || null,
      counted_bags: entry.countedBags,
      weight_per_bag: entry.weightPerBag ?? null,
      counted_weight: Number(entry.countedWeight.toFixed(3)),
      note: (entry.note || '').trim() || null,
      updated_at: new Date().toISOString(),
      updated_by_name: userName
    };

    let existingId: string | null = entry.id ?? null;
    if (entry.lotId) {
      const { data: existing, error: findErr } = await supabaseAdmin
        .from('factory_stock_take_counts')
        .select('id')
        .eq('stock_take_id', takeId)
        .eq('lot_id', entry.lotId)
        .maybeSingle();

      if (findErr) return { error: findErr.message };
      existingId = existing?.id ?? null;
    }

    const query = existingId
      ? supabaseAdmin.from('factory_stock_take_counts').update(row).eq('id', existingId).eq('stock_take_id', takeId)
      : supabaseAdmin.from('factory_stock_take_counts').insert(row);

    const { data, error } = await query.select('*').single();
    if (error) return { error: error.message };

    return { success: true, count: mapCount(data) };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function deleteStockTakeCount(takeId: string, countId: string) {
  try {
    const { role } = await enforceFactoryAccess();
    if (!['admin', 'manager'].includes(role)) return { error: 'Only admins and managers can run a stock take.' };

    const { error } = await supabaseAdmin
      .from('factory_stock_take_counts')
      .delete()
      .eq('id', countId)
      .eq('stock_take_id', takeId);

    if (error) return { error: error.message };
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function applyStockTake(
  takeId: string,
  expected: { lotId: string; bags: number; weight: number }[],
  zeroUncounted: boolean
) {
  try {
    const { user, role } = await enforceFactoryAccess();
    if (!['admin', 'manager'].includes(role)) return { error: 'Only admins and managers can apply a stock take.' };

    const userName = user.user_metadata?.name || user.email;

    const { data, error } = await supabaseAdmin.rpc('fn_apply_stock_take', {
      p_take_id: takeId,
      p_expected: (expected || []).map(e => ({ lotId: e.lotId, bags: Number(e.bags), weight: Number(e.weight) })),
      p_zero_uncounted: !!zeroUncounted,
      p_user_id: user.id,
      p_user_name: userName
    });

    if (error) return { error: error.message };

    revalidatePath('/factory');
    return { success: true, summary: data || {} };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function cancelStockTake(takeId: string, deletePassword?: string) {
  try {
    const { checkDeletePassword } = await import('@/utils/deletePassword');
    const pwError = checkDeletePassword(deletePassword);
    if (pwError) return { error: pwError };

    const { user, role } = await enforceFactoryAccess();
    if (!['admin', 'manager'].includes(role)) return { error: 'Only admins and managers can cancel a stock take.' };

    const userName = user.user_metadata?.name || user.email;

    const { data, error } = await supabaseAdmin
      .from('factory_stock_takes')
      .update({ status: 'CANCELLED', closed_at: new Date().toISOString(), closed_by: user.id, closed_by_name: userName })
      .eq('id', takeId)
      .eq('status', 'OPEN')
      .select('id')
      .maybeSingle();

    if (error) return { error: error.message };
    if (!data) return { error: 'This stock take is no longer open.' };

    await supabaseAdmin.from('factory_history').insert({
      id: crypto.randomUUID(),
      type: 'STOCK_TAKE_CANCELLED',
      description: 'Cancelled a stock take. No stock was changed.',
      user_id: user.id,
      user_name: userName,
      details: { stockTakeId: takeId }
    });

    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

