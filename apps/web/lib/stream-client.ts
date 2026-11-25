import type { CheckOutcome, CheckRequest } from '@triad/core';

// Posts to an endpoint with ?stream=1 and reports the plan and each check's answers as they land.
export async function postStream<T>(path: string, body: unknown, on: { plan?: (plan: CheckRequest[]) => void; outcome?: (o: CheckOutcome) => void }): Promise<T> {
  const response = await fetch(`${path}?stream=1`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? `HTTP ${response.status}`);
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const event = JSON.parse(line) as { type: string; plan?: CheckRequest[]; outcome?: CheckOutcome; result?: T; error?: string };
      if (event.type === 'plan') on.plan?.(event.plan!);
      else if (event.type === 'outcome') on.outcome?.(event.outcome!);
      else if (event.type === 'result') return event.result!;
      else if (event.type === 'error') throw new Error(event.error ?? 'The request failed.');
    }
  }
  throw new Error('The connection closed before a decision arrived.');
}
