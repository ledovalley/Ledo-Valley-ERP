import { NextResponse } from 'next/server';
import { logEvent } from '@/utils/logger';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, message, details } = body;

    if (!type || !message) {
      return NextResponse.json({ error: 'Type and message are required' }, { status: 400 });
    }

    await logEvent(type, message, details);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
