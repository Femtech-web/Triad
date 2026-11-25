import { headline, nextSteps } from '@/lib/plain';
import { ConsoleError, runCheck } from '@/lib/server/console';
import { allow, clientOf, LiveUnavailable } from '@/lib/server/runtime';
import { paymentRequired, PRICE, settle, verify } from '@/lib/server/sell';

export const runtime = 'nodejs';
export const maxDuration = 180;

const FREE_PER_DAY = 5;

// The agent endpoint: the same input as the web check, a plain-language answer, and the signed evidence. Each address
// gets five free checks a day; after that a check costs $0.05 over x402, settled only when a decision was made.
export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: 'The request is not valid JSON.' }, { status: 400 }); }
  const header = request.headers.get('payment-signature');
  const payment = header ? await verify(header) : null;
  if (payment && 'error' in payment) return paymentRequired(request.url, payment.error);
  if (!payment && !allow('agent-free', clientOf(request), FREE_PER_DAY, 86_400_000)) return paymentRequired(request.url, `The free allowance (${FREE_PER_DAY} a day) is used; each further check costs ${PRICE}.`);
  if (!allow('agent', clientOf(request), 30)) return Response.json({ error: 'At most 30 checks an hour from one address.' }, { status: 429 });

  try {
    const issued = await runCheck(body);
    const answer = {
      decision: issued.evidence.decision.decision, headline: headline(issued.evidence), nextSteps: nextSteps(issued.evidence),
      needs: issued.evidence.decision.needs, rules: issued.evidence.decision.hits.map((h) => ({ rule: h.rule, effect: h.effect, text: h.text })),
      callbackTarget: issued.evidence.decision.callback.target, paidChecks: issued.evidence.cost.purchases,
      ...issued,
    };
    if (!payment) return Response.json({ ...answer, billing: { free: true, price: PRICE } });
    const settled = await settle(payment);
    if ('error' in settled) return Response.json({ ...answer, billing: { free: false, settled: false, error: settled.error } }, { status: 502 });
    return Response.json({ ...answer, billing: { free: false, settled: true, transaction: settled.transaction } }, { headers: { 'PAYMENT-RESPONSE': settled.header } });
  } catch (error) {
    const status = error instanceof ConsoleError ? error.status : error instanceof LiveUnavailable ? 503 : 502;
    return Response.json({ error: error instanceof Error ? error.message.split('\n')[0] : 'The check failed.', charged: false }, { status });
  }
}
