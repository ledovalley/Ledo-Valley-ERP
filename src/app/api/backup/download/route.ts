import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { buildBackup, istTimeStamp } from '@/utils/backup';

// "Download backup now" for admins: the same full backup as the nightly job,
// downloaded straight to your computer so you have a copy outside Supabase.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can download a backup.' }, { status: 403 });
  }

  try {
    const { gz } = await buildBackup();
    const fileName = `ledo-valley-backup-${istTimeStamp()}.json.gz`;
    return new Response(new Uint8Array(gz), {
      status: 200,
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store'
      }
    });
  } catch (err: any) {
    console.error('Backup download failed:', err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
