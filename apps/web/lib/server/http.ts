import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ConsoleError } from './console';
import type { Progress } from './console';
import { allow, clientOf, LiveUnavailable } from './runtime';

const MAX_BODY = 512 * 1024;

function explain(error: unknown, bucket: string): { status: number; error: string } {
  if (error instanceof ConsoleError) return { status: error.status, error: error.message };
  if (error instanceof LiveUnavailable) return { status: 503, error: error.message };
  if (error instanceof ZodError || error instanceof SyntaxError) return { status: 400, error: 'The request is not in the expected shape.' };
  console.error(`[${bucket}]`, error);
  return { status: 502, error: `The network step failed: ${error instanceof Error ? error.message.split('\n')[0]!.slice(0, 280) : 'unknown error'}` };
}

async function admit(request: Request, bucket: string, perHour: number): Promise<{ body: unknown } | NextResponse> {
  if (!allow(bucket, clientOf(request), perHour)) return NextResponse.json({ error: `The app allows ${perHour} of these an hour from one address. Recorded runs can still be replayed.` }, { status: 429 });
  const text = await request.text();
  if (text.length > MAX_BODY) return NextResponse.json({ error: 'The request is too large.' }, { status: 413 });
  try { return { body: JSON.parse(text) }; } catch { return NextResponse.json({ error: 'The request is not valid JSON.' }, { status: 400 }); }
}

// One shape for every endpoint: rate-limited per client, bounded body, and errors a person can read. With ?stream=1
// the reply is newline-delimited JSON: the plan, then each check's answers as they land, then the result.
export async function handle(request: Request, bucket: string, perHour: number, work: (body: unknown, progress: Progress) => Promise<unknown>) {
  const admitted = await admit(request, bucket, perHour);
  if (admitted instanceof NextResponse) return admitted;
  if (new URL(request.url).searchParams.get('stream') !== '1') {
    try { return NextResponse.json(await work(admitted.body, {})); }
    catch (error) { const e = explain(error, bucket); return NextResponse.json({ error: e.error }, { status: e.status }); }
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const result = await work(admitted.body, { onPlan: (plan) => send({ type: 'plan', plan }), onOutcome: (outcome) => send({ type: 'outcome', outcome }) });
        send({ type: 'result', result });
      } catch (error) {
        send({ type: 'error', ...explain(error, bucket) });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
}
