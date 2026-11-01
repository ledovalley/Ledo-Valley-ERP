import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase/admin';
import { buildBackup, istDateStamp } from '@/utils/backup';

// Nightly backup. Scheduled in vercel.json; Vercel calls it with
// "Authorization: Bearer <CRON_SECRET>".
//
// 1. Exports every table (and users' roles/pay settings) as one .json.gz file
// 2. Stores it in the private "backups" storage bucket, kept BACKUP_RETENTION_DAYS (default 30)
// 3. Optionally emails it, if RESEND_API_KEY and BACKUP_EMAIL_TO are set

const BUCKET = 'backups';
const FOLDER = 'daily';
const MAX_EMAIL_ATTACHMENT_BYTES = 35 * 1024 * 1024;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const retentionDays = Math.max(1, parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10) || 30);

  try {
    const { file, gz, bytes } = await buildBackup();
    const fileName = `ledo-valley-backup-${istDateStamp()}.json.gz`;

    // Private bucket (created on first run). Never make this bucket public.
    const { error: bucketError } = await supabaseAdmin.storage.createBucket(BUCKET, { public: false });
    if (bucketError && !/already exists|duplicate/i.test(bucketError.message)) throw bucketError;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(`${FOLDER}/${fileName}`, gz, { contentType: 'application/gzip', upsert: true });
    if (uploadError) throw uploadError;

    // Remove backups past the retention period
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const { data: existing, error: listError } = await supabaseAdmin.storage
      .from(BUCKET)
      .list(FOLDER, { limit: 1000, sortBy: { column: 'created_at', order: 'asc' } });
    if (listError) throw listError;
    type StoredFile = { name: string; created_at?: string | null };
    const expired = ((existing || []) as StoredFile[])
      .filter((f: StoredFile) => !!f.created_at && new Date(f.created_at).getTime() < cutoff && f.name !== fileName)
      .map((f: StoredFile) => `${FOLDER}/${f.name}`);
    if (expired.length > 0) {
      const { error: removeError } = await supabaseAdmin.storage.from(BUCKET).remove(expired);
      if (removeError) console.error('Backup cleanup failed:', removeError);
    }

    // Optional email copy (kept outside Supabase)
    let emailed: string = 'not configured';
    const resendKey = process.env.RESEND_API_KEY;
    const emailTo = process.env.BACKUP_EMAIL_TO;
    if (resendKey && emailTo) {
      const totalRows = Object.values(file.counts).reduce((s, n) => s + n, 0);
      const summary = Object.entries(file.counts).map(([t, n]) => `${t}: ${n}`).join('\n');
      const tooBig = bytes > MAX_EMAIL_ATTACHMENT_BYTES;
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.BACKUP_EMAIL_FROM || 'Ledo Valley Backup <onboarding@resend.dev>',
          to: emailTo.split(',').map(s => s.trim()).filter(Boolean),
          subject: `Ledo Valley ERP backup ${istDateStamp()} (${totalRows} rows)`,
          text:
            `Nightly backup of Ledo Valley ERP.\n\n${summary}\n\n` +
            (Object.keys(file.skipped).length ? `Skipped (not found): ${Object.keys(file.skipped).join(', ')}\n\n` : '') +
            (tooBig
              ? `The file is ${(bytes / 1024 / 1024).toFixed(1)} MB, too big to attach. It is stored in Supabase Storage > ${BUCKET}/${FOLDER}/${fileName}.`
              : `Attached: ${fileName}. Keep this email; it can be restored with scripts/restore-backup.mjs.`),
          attachments: tooBig ? [] : [{ filename: fileName, content: gz.toString('base64') }]
        })
      });
      emailed = res.ok ? (tooBig ? 'sent without attachment (too big)' : 'sent') : `failed: ${res.status} ${await res.text()}`;
      if (!res.ok) console.error('Backup email failed:', emailed);
    }

    return NextResponse.json({
      success: true,
      file: `${BUCKET}/${FOLDER}/${fileName}`,
      sizeKb: Math.round(bytes / 1024),
      counts: file.counts,
      skipped: file.skipped,
      expiredRemoved: expired.length,
      emailed
    });
  } catch (err: any) {
    console.error('Backup failed:', err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
