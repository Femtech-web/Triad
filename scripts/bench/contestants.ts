import { z } from 'zod';
import type { CheckOutcome, CheckRequest, Instruction, Shipment } from '@triad/core';

// The two comparison contestants. Neither is told which cases are attacks.

export type Verdict = 'RELEASE' | 'HOLD' | 'BLOCK';

// What a typical single-provider integration does: screen the parties a change involves through the registry and the
// sanctions list, take the first (ranked) answer at face value, and pay if both pass. It never looks at who sent the
// instruction, never calls anyone back, and never asks a second source.
export function baselineVerdict(plan: CheckRequest[], outcomes: CheckOutcome[]): { verdict: Verdict; reason: string } {
  const screens = plan.filter((c) => c.check === 'registry' || c.check === 'sanctions');
  if (!screens.length) return { verdict: 'RELEASE', reason: 'Nothing to screen.' };
  for (const check of screens) {
    const first = outcomes.find((o) => o.checkId === check.id)?.sources.find((s) => s.kind === 'telegraph');
    if (!first || first.status === 'unavailable' || first.status === 'unreadable') return { verdict: 'HOLD', reason: `${check.id}: no answer.` };
    if (check.check === 'sanctions' && first.fields.matched === true) return { verdict: 'BLOCK', reason: `${check.id}: sanctions match.` };
    if (check.check === 'registry' && first.fields.active === false) return { verdict: 'BLOCK', reason: `${check.id}: not active.` };
  }
  return { verdict: 'RELEASE', reason: 'Registry and sanctions screens passed.' };
}

export const FRONTIER_SYSTEM = `You are the release officer at a physical commodity trading desk. For each case you see the desk's trusted record for a shipment and an incoming instruction. Decide whether the supplier payment or cargo release can go ahead now.
Respond with JSON only: {"decision": "RELEASE" | "HOLD" | "BLOCK", "reason": "<one or two sentences>"}.
RELEASE: pay or release now as instructed. HOLD: do not release yet; verification is needed first. BLOCK: refuse; the instruction is fraudulent or prohibited.`;

// The case file in plain words: the same facts Triad receives, without Triad's analysis.
export function frontierCaseFile(shipment: Shipment, instruction: Instruction, callback?: { contactId: string; channel: string; outcome: string }): string {
  const contacts = shipment.seller.contacts.filter((c) => shipment.authorizedContactIds.includes(c.id)).map((c) => `${c.name} <${c.email}>${c.phone ? `, phone ${c.phone}` : ''}`).join('; ');
  const c = instruction.changes;
  const changes = [
    c.payout && `Pay to account ${c.payout.bankRef ?? c.payout.address}, held by ${c.payout.holderName}`,
    c.consignee && `New consignee: ${c.consignee.legalName} (${c.consignee.country})`,
    c.pickupParty && `New pickup party: ${c.pickupParty.legalName} (${c.pickupParty.country})`,
    c.vessel && `New carrying vessel: ${c.vessel.name} (${c.vessel.imo})`,
    ...(c.documents ?? []).map((d) => `Attached ${d.kind.replace(/_/g, ' ')} ${d.reference}${d.content ? `: "${d.content}"` : ''}`),
  ].filter(Boolean);
  const called = callback ? shipment.seller.contacts.find((x) => x.id === callback.contactId) : undefined;
  return [
    `TRUSTED RECORD for shipment ${shipment.reference}: ${shipment.quantity} ${shipment.commodity}, ${Number(shipment.amount.value) / 10 ** shipment.amount.decimals} ${shipment.amount.currency}.`,
    `Seller: ${shipment.seller.legalName} (${shipment.seller.country}), web domain ${shipment.seller.domain}. Authorized contacts: ${contacts}.`,
    `Pay to: account ${shipment.payout.bankRef ?? shipment.payout.address}, held by ${shipment.payout.holderName}.`,
    `Consignee: ${shipment.consignee.legalName}. Pickup party: ${shipment.pickupParty?.legalName ?? 'none'}. Vessel: ${shipment.vessel.name} (${shipment.vessel.imo}), ${shipment.loadPort} to ${shipment.dischargePort}.`,
    '',
    `INCOMING EMAIL from "${instruction.channel.displayName}" <${instruction.channel.from}>${instruction.channel.replyTo ? `, reply-to <${instruction.channel.replyTo}>` : ''}:`,
    instruction.summary,
    changes.length ? `Requested: ${changes.join('; ')}.` : 'Requested: no change to payment or cargo.',
    ...(callback && called ? ['', `VERIFICATION: you contacted ${called.name} by ${callback.channel}${callback.channel === 'phone' ? ` on ${called.phone}` : ` at ${called.email}`}; they ${callback.outcome} the instruction.`] : []),
  ].join('\n');
}

const answerSchema = z.object({ decision: z.enum(['RELEASE', 'HOLD', 'BLOCK']), reason: z.string().optional() }).passthrough();
export const FRONTIER_QUOTA_EXHAUSTED = 'frontier_quota_exhausted';

// Gemini (or any OpenAI-compatible model), no tools. Overload is retried; a spent daily quota stops the run unrecorded.
export async function askFrontier(config: { baseUrl: string; model: string; apiKey: string }, caseFile: string, retryDelaysMs = [5_000, 15_000, 30_000]) {
  let response: Response;
  for (let attempt = 0; ; attempt++) {
    response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(120_000),
      headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: config.model, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: FRONTIER_SYSTEM }, { role: 'user', content: caseFile }] }),
    });
    if (response.status === 429) {
      const detail = await response.text();
      if (/per day|PerDay/i.test(detail)) throw new Error(FRONTIER_QUOTA_EXHAUSTED);
      response = new Response(detail, { status: 429 });
    }
    if ((response.status !== 429 && response.status !== 503) || attempt >= retryDelaysMs.length) break;
    await response.body?.cancel();
    await new Promise((r) => setTimeout(r, retryDelaysMs[attempt]));
  }
  if (!response.ok) throw new Error(`frontier_http_${response.status}`);
  const body = await response.json() as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; total_tokens?: number } };
  const text = body.choices?.[0]?.message?.content ?? '';
  const parsed = answerSchema.safeParse((() => { try { return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { return null; } })());
  return { verdict: parsed.success ? parsed.data.decision : null, reason: parsed.success ? parsed.data.reason ?? '' : text.slice(0, 300), usage: body.usage ?? null };
}
