import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase/admin';

// How long things are kept. Change these to suit your audit needs.
const LIVE_LOG_HOURS = 36;          // logs older than this are moved into a CSV archive
const ARCHIVE_RETENTION_DAYS = 90;  // CSV archives older than this are deleted (was 3 days)

export async function GET(request: Request) {
  // Only Vercel Cron (or someone holding CRON_SECRET) may run this.
  // Vercel sends "Authorization: Bearer <CRON_SECRET>" automatically once the
  // CRON_SECRET environment variable is set in the project.
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Logs older than the live window
    const cutoff = new Date(Date.now() - LIVE_LOG_HOURS * 60 * 60 * 1000).toISOString();

    const { data: oldLogs, error: fetchError } = await supabaseAdmin
      .from('logs')
      .select('*')
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(1000); // Supabase returns at most 1,000 rows; the rest go in the next run

    if (fetchError) throw fetchError;

    let archived = 0;
    if (oldLogs && oldLogs.length > 0) {
      // 2. Format as CSV
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csvHeader = 'ID,Created At,Type,Message,Details,User ID\n';
      const csvRows = oldLogs.map((log: any) =>
        [log.id, log.created_at, log.type, log.message, JSON.stringify(log.details || {}), log.user_id || '']
          .map(esc)
          .join(',')
      );
      const csvContent = csvHeader + csvRows.join('\n');

      // 3. Upload to Supabase Storage (keep this bucket PRIVATE; download with a signed URL)
      const startDate = oldLogs[0].created_at;
      const endDate = oldLogs[oldLogs.length - 1].created_at;
      const fileName = `logs_archive_${Date.now()}.csv`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from('log_archives')
        .upload(fileName, csvContent, { contentType: 'text/csv', upsert: false });
      if (uploadError) throw uploadError;

      // 4. Record the archive. If this fails, stop: never delete logs that aren't archived.
      const { error: recordError } = await supabaseAdmin.from('log_archives').insert({
        file_name: fileName,
        file_path: fileName,
        start_date: startDate,
        end_date: endDate,
        total_records: oldLogs.length
      });
      if (recordError) throw recordError;

      // 5. Only now delete the archived logs
      // (in batches: a long id list doesn't fit in one request)
      const idsToDelete = oldLogs.map((l: any) => l.id);
      for (let i = 0; i < idsToDelete.length; i += 200) {
        const { error: deleteError } = await supabaseAdmin.from('logs').delete().in('id', idsToDelete.slice(i, i + 200));
        if (deleteError) throw deleteError;
      }
      archived = oldLogs.length;
    }

    // 6. Delete archives past the retention period
    const retentionCutoff = new Date(Date.now() - ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: oldArchives, error: oldArchivesError } = await supabaseAdmin
      .from('log_archives')
      .select('*')
      .lt('created_at', retentionCutoff);
    if (oldArchivesError) throw oldArchivesError;

    let expired = 0;
    if (oldArchives && oldArchives.length > 0) {
      const fileNames = oldArchives.map((a: any) => a.file_path);
      const { error: removeError } = await supabaseAdmin.storage.from('log_archives').remove(fileNames);
      if (removeError) throw removeError;

      const archiveIds = oldArchives.map((a: any) => a.id);
      const { error: rowDeleteError } = await supabaseAdmin.from('log_archives').delete().in('id', archiveIds);
      if (rowDeleteError) throw rowDeleteError;
      expired = oldArchives.length;
    }

    return NextResponse.json({ success: true, archivedLogs: archived, expiredArchives: expired });
  } catch (err: any) {
    console.error('Archive Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
