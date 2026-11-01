import { gzipSync } from 'zlib';
import { supabaseAdmin } from '@/utils/supabase/admin';

// Server-only helper: builds a full backup of the app's data.
// Used by the nightly cron (/api/cron/backup) and the admin download (/api/backup/download).

/** Tables to back up, parents before children (the order restore uses). */
export const BACKUP_TABLES = [
  // factory
  'factory_loose_lots',
  'factory_packet_catalog',
  'factory_blends',
  'factory_blend_lots_used',
  'factory_history',
  'factory_serial_counter',
  'factory_stock_takes',
  'factory_stock_take_counts',
  // sales & ERP
  'products',
  'retailers',
  'shifts',
  'sales_records',
  'retailer_visits',
  'employee_targets',
  'daily_operational_targets',
  'logs',
  'log_archives'
];

export type BackupFile = {
  app: 'ledo-valley-erp';
  formatVersion: 1;
  createdAt: string;
  counts: Record<string, number>;
  skipped: Record<string, string>;
  tables: Record<string, unknown[]>;
};

function isMissingTable(message: string, code?: string) {
  return code === '42P01' || code === 'PGRST205' || /does not exist|could not find the table/i.test(message);
}

async function dumpTable(table: string): Promise<{ rows: unknown[] } | { skipped: string }> {
  const rows: unknown[] = [];
  let ordered = true;
  for (let from = 0; ; from += 1000) {
    // Page through with a stable order so no row is missed or repeated
    let query = supabaseAdmin.from(table).select('*').range(from, from + 999);
    if (ordered) query = query.order('id', { ascending: true });
    let { data, error } = await query;

    if (error && ordered && /column .*id.* does not exist/i.test(error.message)) {
      ordered = false;
      ({ data, error } = await supabaseAdmin.from(table).select('*').range(from, from + 999));
    }
    if (error) {
      if (isMissingTable(error.message, (error as { code?: string }).code)) return { skipped: 'table not found' };
      throw new Error(`Backing up ${table} failed: ${error.message}`);
    }
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return { rows };
}

async function dumpUsers() {
  const users: unknown[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Backing up users failed: ${error.message}`);
    // No passwords are available or stored; this keeps who-is-who, roles and pay settings.
    type AuthUser = {
      id: string; email?: string; created_at?: string; last_sign_in_at?: string;
      app_metadata: Record<string, unknown>; user_metadata: Record<string, unknown>;
    };
    users.push(...(data.users as AuthUser[]).map((u: AuthUser) => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      app_metadata: u.app_metadata,
      user_metadata: u.user_metadata
    })));
    if (data.users.length < 1000) break;
  }
  return users;
}

/** Builds the backup and returns it gzipped, ready to store, email or download. */
export async function buildBackup(): Promise<{ file: BackupFile; gz: Buffer; bytes: number }> {
  const file: BackupFile = {
    app: 'ledo-valley-erp',
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    counts: {},
    skipped: {},
    tables: {}
  };

  for (const table of BACKUP_TABLES) {
    const res = await dumpTable(table);
    if ('skipped' in res) {
      file.skipped[table] = res.skipped;
    } else {
      file.tables[table] = res.rows;
      file.counts[table] = res.rows.length;
    }
  }

  file.tables._auth_users = await dumpUsers();
  file.counts._auth_users = file.tables._auth_users.length;

  const gz = gzipSync(Buffer.from(JSON.stringify(file)));
  return { file, gz, bytes: gz.length };
}

/** e.g. 2026-11-01 in India time, for file names */
export function istDateStamp(d = new Date()) {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

export function istTimeStamp(d = new Date()) {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 16).replace('T', '_').replace(':', '');
}
