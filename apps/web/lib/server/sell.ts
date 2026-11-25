import 'server-only';
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http';
import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server';
import type { PaymentPayload, PaymentRequirements } from '@x402/core/types';
import { ExactSvmScheme } from '@x402/svm/exact/server';

// Triad sells its decisions to agents the way it buys Telegraph's answers: per call, over x402. A check costs $0.05 in
// devnet USDC on Solana, settled through the public x402 facilitator into Triad's own Solana wallet, the one that pays
// for the checks. A payment is verified before the work and settled only after a decision was made.

const NETWORK = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1' as const;
export const PRICE = '$0.05';
const FACILITATOR = process.env.TRIAD_X402_FACILITATOR ?? 'https://x402.org/facilitator';
export const PAY_TO = process.env.TRIAD_X402_PAY_TO ?? 'ATxmzqGTLjHXJo1gCVCgNxUUNyDU1yaLLYHRPCy1BvN4';

let server: Promise<x402ResourceServer> | null = null;
function resourceServer(): Promise<x402ResourceServer> {
  server ??= (async () => {
    const s = new x402ResourceServer(new HTTPFacilitatorClient({ url: FACILITATOR })).register(NETWORK, new ExactSvmScheme());
    await s.initialize();
    return s;
  })().catch((error: Error) => { server = null; throw error; });
  return server;
}

const requirements = async () => (await resourceServer()).buildPaymentRequirementsFromOptions([{ scheme: 'exact', payTo: PAY_TO, price: PRICE, network: NETWORK, maxTimeoutSeconds: 300 }], {});

export async function paymentRequired(url: string, error?: string): Promise<Response> {
  const s = await resourceServer();
  const required = await s.createPaymentRequiredResponse(await requirements(), { url, description: 'One Triad payment check: a decision, its evidence file and its next steps', mimeType: 'application/json' }, error);
  return Response.json(required, { status: 402, headers: { 'PAYMENT-REQUIRED': encodePaymentRequiredHeader(required) } });
}

export interface VerifiedPayment { payload: PaymentPayload; requirement: PaymentRequirements; payer: string | null }

export async function verify(header: string): Promise<VerifiedPayment | { error: string }> {
  let payload: PaymentPayload;
  try { payload = decodePaymentSignatureHeader(header); } catch { return { error: 'The payment header is not a valid x402 payment.' }; }
  const s = await resourceServer();
  const requirement = s.findMatchingRequirements(await requirements(), payload);
  if (!requirement) return { error: 'The payment does not match what this endpoint accepts.' };
  const result = await s.verifyPayment(payload, requirement);
  return result.isValid ? { payload, requirement, payer: result.payer ?? null } : { error: `The payment was not accepted: ${result.invalidReason ?? 'invalid'}.` };
}

export async function settle(payment: VerifiedPayment): Promise<{ header: string; transaction: string | null } | { error: string }> {
  const result = await (await resourceServer()).settlePayment(payment.payload, payment.requirement);
  return result.success ? { header: encodePaymentResponseHeader(result), transaction: result.transaction ?? null } : { error: `Settlement failed: ${result.errorReason ?? 'unknown'}.` };
}
