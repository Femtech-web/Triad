import { z } from 'zod';

// Telegraph escrow rail: a pre-funded balance in the Diamond, authorized per call by an EIP-191 message.
// Self-contained (zod only) so any app can reuse it. Every policy check runs before the signer is called.
export interface EscrowPolicy {
  node: string;
  network: string;
  diamond: string;
  maxCallUusdc: bigint;
}
export interface EscrowSigner { address: string; signMessage(message: string): Promise<string> }
export interface EscrowOffer { network: string; payTo: string; resource: string; amountUusdc: bigint; template: string }
export interface EscrowAuthorization { from: string; to: string; value: string; validAfter: string; validBefore: string; nonce: string }
export type EscrowReceipt = z.infer<typeof receiptSchema>;
export type EscrowEvent = { type: 'authorized' | 'delivered' | 'refused' | 'failed'; nonce: string; resource: string; amount_uusdc: string; detail?: unknown };
export type EscrowResult =
  | { status: 'delivered'; body: unknown; receipt: EscrowReceipt; amountUusdc: bigint; nonce: string }
  | { status: 'refused'; reason: string; nonce: string }
  | { status: 'failed'; httpStatus: number; body: unknown; nonce: string };

export class EscrowPolicyError extends Error {}

const WINDOW_SECONDS = { before: 5, after: 100 } as const;
const PLACEHOLDERS = ['{from}', '{nonce}', '{validAfter}', '{validBefore}'] as const;

const offerSchema = z.object({
  scheme: z.literal('escrow'), network: z.string(), payTo: z.string(),
  extra: z.object({ resource: z.string(), message: z.string().min(1).max(4000) }).passthrough(),
}).passthrough();
const challengeSchema = z.object({ accepts: z.array(z.unknown()).max(20) }).passthrough();
const receiptSchema = z.object({
  receipt_hash: z.string().regex(/^0x[a-fA-F0-9]{64}$/), rail: z.literal('escrow'), payer: z.string(),
  miner: z.union([z.string().min(1), z.number().int().nonnegative()]), intent: z.string().min(1),
  amount_uusdc: z.string().regex(/^[0-9]+$/), epoch_id: z.number().int().nonnegative(),
  settlement: z.literal('epoch'), chain: z.literal('telegraph'), timestamp: z.number().int().positive(),
}).passthrough();

// The engine signs resources without its /engine prefix.
export function resourceFor(path: string): string {
  if (!/^\/engine\/v1\/ask(?:\/[0-9]{1,12})?$/.test(path)) throw new EscrowPolicyError('Only engine ask routes are paid through this client.');
  return path.slice('/engine'.length);
}

export function selectEscrowOffer(challenge: unknown, policy: EscrowPolicy, resource: string): EscrowOffer {
  const parsed = challengeSchema.safeParse(challenge);
  if (!parsed.success) throw new EscrowPolicyError('Payment challenge has an unexpected shape.');
  const diamond = policy.diamond.toLowerCase();
  for (const candidate of parsed.data.accepts) {
    const offer = offerSchema.safeParse(candidate);
    if (!offer.success) continue;
    const { network, payTo, extra } = offer.data;
    const template = extra.message;
    if (network !== policy.network || payTo.toLowerCase() !== diamond || extra.resource !== resource) continue;
    if (!template.toLowerCase().includes(`pay to: ${diamond}`) || !template.includes(`Network: ${policy.network}`) || !template.includes(`Resource: ${resource}\n`)) continue;
    if (PLACEHOLDERS.some((p) => template.split(p).length !== 2)) continue;
    const amount = /^Amount:\s*(\d+)\s*uUSDC$/m.exec(template)?.[1];
    if (!amount || BigInt(amount) <= 0n) continue;
    if (BigInt(amount) > policy.maxCallUusdc) throw new EscrowPolicyError(`Quote of ${amount} uUSDC exceeds the per-call cap.`);
    return { network, payTo: payTo.toLowerCase(), resource, amountUusdc: BigInt(amount), template };
  }
  throw new EscrowPolicyError('No escrow offer matches the pinned Diamond, network and resource.');
}

// Fills the node's template verbatim; the address is lowercased because the node lowercases before verifying.
export function buildAuthorization(offer: EscrowOffer, from: string, nonce: string, nowSeconds: number): { message: string; authorization: EscrowAuthorization } {
  if (!/^0x[a-fA-F0-9]{40}$/.test(from)) throw new EscrowPolicyError('Signer address is not an EVM address.');
  if (!/^[A-Za-z0-9-]{8,128}$/.test(nonce)) throw new EscrowPolicyError('Nonce must be 8-128 letters, digits or hyphens.');
  const authorization: EscrowAuthorization = {
    from: from.toLowerCase(), to: offer.payTo, value: offer.amountUusdc.toString(),
    validAfter: String(nowSeconds - WINDOW_SECONDS.before), validBefore: String(nowSeconds + WINDOW_SECONDS.after), nonce,
  };
  const message = offer.template
    .replace('{from}', authorization.from).replace('{nonce}', nonce)
    .replace('{validAfter}', authorization.validAfter).replace('{validBefore}', authorization.validBefore);
  return { message, authorization };
}

export function encodePaymentHeader(network: string, signature: string, authorization: EscrowAuthorization): string {
  return Buffer.from(JSON.stringify({ x402Version: 2, scheme: 'escrow', network, payload: { signature, authorization } })).toString('base64');
}

export function parseEscrowReceipt(header: string | null, expected: { payer: string; amountUusdc: bigint }): EscrowReceipt {
  if (!header || header.length > 16_000) throw new EscrowPolicyError('Delivered response carried no escrow receipt.');
  const receipt = receiptSchema.parse(JSON.parse(Buffer.from(header, 'base64').toString('utf8')));
  if (receipt.payer.toLowerCase() !== expected.payer.toLowerCase() || receipt.amount_uusdc !== expected.amountUusdc.toString()) {
    throw new EscrowPolicyError('Receipt payer or amount differs from the signed authorization.');
  }
  return receipt;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length > 2_000_000) throw new EscrowPolicyError('Response exceeds 2 MB.');
  try { return JSON.parse(text); } catch { return text; }
}

// One paid attempt per call, never retried here. A refusal is not billed; a failure without a receipt is treated as not charged.
export function createEscrowClient(options: { policy: EscrowPolicy; signer: EscrowSigner; maxTotalUusdc: bigint; fetch?: typeof fetch; journal?: (event: EscrowEvent) => Promise<void>; now?: () => number }) {
  const transport = options.fetch ?? fetch;
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const journal = options.journal ?? (async () => {});
  let committed = 0n;
  return {
    spentUusdc: () => committed,
    async ask(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<EscrowResult> {
      const resource = resourceFor(path);
      const url = `${options.policy.node}${path}`;
      const init = { method: 'POST', redirect: 'manual' as const, ...(signal ? { signal } : {}) };
      const quote = await transport(url, { ...init, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const challenge = await readJson(quote);
      if (quote.status !== 402) throw new EscrowPolicyError(`Expected a 402 payment challenge, got HTTP ${quote.status}.`);
      const offer = selectEscrowOffer(challenge, options.policy, resource);
      if (committed + offer.amountUusdc > options.maxTotalUusdc) throw new EscrowPolicyError('This call would exceed the session spending cap.');

      const nonce = crypto.randomUUID();
      const { message, authorization } = buildAuthorization(offer, options.signer.address, nonce, now());
      const signature = await options.signer.signMessage(message);
      // Counted before sending: an interrupted call must never look cheaper than it might have been.
      committed += offer.amountUusdc;
      const event = { nonce, resource, amount_uusdc: offer.amountUusdc.toString() };
      await journal({ type: 'authorized', ...event });

      const response = await transport(url, { ...init, headers: { 'content-type': 'application/json', 'x-payment': encodePaymentHeader(offer.network, signature, authorization) }, body: JSON.stringify(body) });
      const answer = await readJson(response);
      if (response.ok) {
        const receipt = parseEscrowReceipt(response.headers.get('x-payment-response'), { payer: authorization.from, amountUusdc: offer.amountUusdc });
        await journal({ type: 'delivered', ...event, detail: { receipt_hash: receipt.receipt_hash, epoch_id: receipt.epoch_id, miner: receipt.miner } });
        return { status: 'delivered', body: answer, receipt, amountUusdc: offer.amountUusdc, nonce };
      }
      const charged = response.headers.has('x-payment-response');
      if (!charged) committed -= offer.amountUusdc;
      if (response.status === 402) {
        const reason = typeof (answer as { reason?: unknown })?.reason === 'string' ? (answer as { reason: string }).reason : 'payment refused';
        await journal({ type: 'refused', ...event, detail: { reason } });
        return { status: 'refused', reason, nonce };
      }
      await journal({ type: 'failed', ...event, detail: { http_status: response.status, charged } });
      return { status: 'failed', httpStatus: response.status, body: answer, nonce };
    },
  };
}
