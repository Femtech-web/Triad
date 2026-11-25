import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ConsoleError } from './console';
import { allow, clientOf, LiveUnavailable } from './runtime';

const MAX_BODY = 512 * 1024;

// One shape for every console endpoint: rate-limited per client, bounded body, and errors a person can read.
export async function handle(request: Request, bucket: string, perHour: number, work: (body: unknown) => Promise<unknown>) {
  if (!allow(bucket, clientOf(request), perHour)) return NextResponse.json({ error: `The console allows ${perHour} of these an hour from one address. Recorded runs can still be replayed.` }, { status: 429 });
  const text = await request.text();
  if (text.length > MAX_BODY) return NextResponse.json({ error: 'The request is too large.' }, { status: 413 });
  try {
    return NextResponse.json(await work(JSON.parse(text)));
  } catch (error) {
    if (error instanceof ConsoleError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof LiveUnavailable) return NextResponse.json({ error: error.message }, { status: 503 });
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'The request is not in the expected shape.' }, { status: 400 });
    const message = error instanceof Error ? error.message.split('\n')[0]!.slice(0, 280) : 'Unknown error';
    console.error(`[${bucket}]`, error);
    return NextResponse.json({ error: `The network step failed: ${message}` }, { status: 502 });
  }
}
