import { NextResponse } from 'next/server';

export async function GET(
  _req: Request,
  context: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await context.params;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing ELEVENLABS_API_KEY env var' },
      { status: 500 }
    );
  }
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(conversationId)}`,
      {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'xi-api-key': apiKey,
        },
        // Avoid caching logs
        cache: 'no-store',
      }
    );
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: 'Upstream error', status: res.status, body: text },
        { status: 502 }
      );
    }
    const data = await res.json();
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}


