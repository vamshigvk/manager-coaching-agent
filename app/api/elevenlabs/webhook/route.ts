import { NextResponse } from 'next/server';

// Note: Configure your ElevenLabs agent to POST events to this endpoint.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Here you can verify signatures if ElevenLabs provides them (e.g., via a shared secret)
    // For now we simply echo and optionally log.
    // Example structure may include conversation_id, event type, tool results, transcript snippets, etc.

    // You can forward to your logging infra or persist to a DB here.
    // console.log('ElevenLabs webhook event:', body);

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}


