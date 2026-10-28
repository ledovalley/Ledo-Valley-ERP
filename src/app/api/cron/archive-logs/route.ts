import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase/admin';

export async function GET(request: Request) {
  // In a real production app, verify a CRON_SECRET header here to prevent abuse.
  
  try {
    // 1. Calculate the cutoff for logs (36 hours ago)
    const thirtySixHoursAgo = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
    
    // Fetch logs older than 36 hours
    const { data: oldLogs, error: fetchError } = await supabaseAdmin
      .from('logs')
      .select('*')
      .lt('created_at', thirtySixHoursAgo)
      .order('created_at', { ascending: true });

    if (fetchError) throw fetchError;

    if (oldLogs && oldLogs.length > 0) {
      // 2. Format as CSV
      const csvHeader = 'ID,Created At,Type,Message,Details,User ID\n';
      const csvRows = oldLogs.map((log: any) => {
        // Escape quotes and fields
        const safeDetails = JSON.stringify(log.details || {}).replace(/"/g, '""');
        const safeMessage = log.message.replace(/"/g, '""');
        return `"${log.id}","${log.created_at}","${log.type}","${safeMessage}","${safeDetails}","${log.user_id || ''}"`;
      });
      const csvContent = csvHeader + csvRows.join('\n');

      // 3. Upload to Supabase Storage
      const startDate = oldLogs[0].created_at;
      const endDate = oldLogs[oldLogs.length - 1].created_at;
      const fileName = `logs_archive_${new Date().getTime()}.csv`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from('log_archives')
        .upload(fileName, csvContent, {
          contentType: 'text/csv',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // 4. Save Archive Record
      const { data: publicUrlData } = supabaseAdmin.storage.from('log_archives').getPublicUrl(fileName);

      await supabaseAdmin.from('log_archives').insert({
        file_name: fileName,
        file_path: fileName,
        start_date: startDate,
        end_date: endDate,
        total_records: oldLogs.length
      });

      // 5. Delete archived logs
      const idsToDelete = oldLogs.map((l: any) => l.id);
      await supabaseAdmin.from('logs').delete().in('id', idsToDelete);
    }

    // 6. Delete archives older than 3 days
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: oldArchives } = await supabaseAdmin
      .from('log_archives')
      .select('*')
      .lt('created_at', threeDaysAgo);

    if (oldArchives && oldArchives.length > 0) {
      const fileNames = oldArchives.map((a: any) => a.file_path);
      const archiveIds = oldArchives.map((a: any) => a.id);

      // Remove from storage
      await supabaseAdmin.storage.from('log_archives').remove(fileNames);
      
      // Remove from DB
      await supabaseAdmin.from('log_archives').delete().in('id', archiveIds);
    }

    return NextResponse.json({ success: true, message: "Archive process completed." });
  } catch (err: any) {
    console.error("Archive Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
