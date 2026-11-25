import { z } from 'zod';
import type { Purchase } from '@triad/core';
import { createEscrowClient } from './escrow.js';

// One interface over Telegraph's payment rails. A check asks an Intent, optionally naming a Miner by routing ID,
// and gets back either a paid delivery with its receipt or the reason there was none. Nothing is retried here:
// a second attempt is a second purchase and is the caller's decision.

export const TELEGRAPH_TESTNET = {
  node: 'https://devnode.telegraphprotocol.com',
  sepolia: { network: 'eip155:11155111', diamond: '0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b', usdc: '0xcc194e1a843B658526D0D5C431f670028582Ae17' },
  solanaDevnet: { network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1', usdcMint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' },
  maxCallUusdc: 50_000n,
} as const;

export const deliveredBodySchema = z.object({
  miner_id: z.union([z.string(), z.number()]).transform(String).optional(),
  miner_name: z.string().optional(),
  result: z.record(z.string(), z.unknown()).nullable().optional(),
  result_shape: z.string().optional(),
  field_status: z.record(z.string(), z.string()).optional(),
  shape_error: z.string().nullable().optional(),
  signal_hash: z.string().regex(/^0x[0-9a-f]{64}$/i).optional(),
  delivery: z.string().optional(),
}).passthrough();
export type DeliveredBody = z.infer<typeof deliveredBodySchema>;

export interface Delivery { body: DeliveredBody; minerName: string | null; purchase: Purchase }
export type AskResult = { status: 'delivered'; delivery: Delivery } | { status: 'not_delivered'; reason: string };

export interface TelegraphClient {
  readonly rail: Purchase['rail'];
  ask(intent: string, params: Record<string, string>, options: { minerId?: string; signal: AbortSignal }): Promise<AskResult>;
}

export const askPath = (minerId?: string) => (minerId ? `/engine/v1/ask/${minerId}` : '/engine/v1/ask');

export function createEscrowTelegraphClient(escrow: ReturnType<typeof createEscrowClient>): TelegraphClient {
  return {
    rail: 'sepolia-escrow',
    async ask(intent, params, { minerId, signal }) {
      const started = Date.now();
      try {
        const result = await escrow.ask(askPath(minerId), { intent, params }, signal);
        if (result.status === 'refused') return { status: 'not_delivered', reason: `Payment refused: ${result.reason}` };
        if (result.status === 'failed') return { status: 'not_delivered', reason: `The node answered HTTP ${result.httpStatus}.` };
        const body = deliveredBodySchema.safeParse(result.body);
        if (!body.success) return { status: 'not_delivered', reason: 'The delivered answer had an unexpected shape.' };
        return { status: 'delivered', delivery: { body: body.data, minerName: body.data.miner_name ?? null, purchase: {
          rail: 'sepolia-escrow', receiptHash: result.receipt.receipt_hash, signalHash: body.data.signal_hash ?? null,
          amountUusdc: result.amountUusdc.toString(), minerId: body.data.miner_id ?? null, latencyMs: Date.now() - started,
        } } };
      } catch (error) {
        // Includes a 503 before payment and an unpaid last-resort answer, which carries no receipt and is never evidence.
        return { status: 'not_delivered', reason: (error as Error).message.slice(0, 300) };
      }
    },
  };
}
