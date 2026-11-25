import { x402Client, x402HTTPClient } from '@x402/core/client';
import { ExactSvmScheme } from '@x402/svm/exact/client';
import type { TransactionSigner } from '@solana/kit';
import { askPath, deliveredBodySchema, TELEGRAPH_TESTNET } from './client.js';
import type { AskResult, TelegraphClient } from './client.js';

// Telegraph's x402 `exact` rail on Solana devnet: each call is a USDC TransferChecked from the operator, with the fee
// paid by Telegraph's facilitator. Only the pinned network and USDC mint are payable, under a per-call and a per-run cap.
// One paid attempt per call, never retried here.

export interface X402SolanaOptions {
  signer: TransactionSigner;
  rpcUrl: string;
  node?: string;
  maxCallUusdc?: bigint;
  maxTotalUusdc: bigint;
  transport?: typeof fetch;
}

const decodeHeader = (value: string | null): Record<string, unknown> | null => {
  if (!value) return null;
  try { return JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as Record<string, unknown>; } catch { return null; }
};

export function createX402SolanaTelegraphClient(options: X402SolanaOptions): TelegraphClient {
  const node = options.node ?? TELEGRAPH_TESTNET.node;
  const transport = options.transport ?? fetch;
  const { network, usdcMint } = TELEGRAPH_TESTNET.solanaDevnet;
  const maxCall = options.maxCallUusdc ?? TELEGRAPH_TESTNET.maxCallUusdc;
  const client = x402Client.fromConfig({
    schemes: [{ network, client: new ExactSvmScheme(options.signer, { rpcUrl: options.rpcUrl }) }],
    spendControls: { allowedAssets: [{ network, asset: usdcMint, maxAmountPerPayment: maxCall.toString() }] },
  });
  const http = new x402HTTPClient(client);
  let committed = 0n;

  return {
    rail: 'solana-x402',
    async ask(intent, params, { minerId, signal }): Promise<AskResult> {
      const started = Date.now();
      const url = `${node}${askPath(minerId)}`;
      const body = JSON.stringify({ intent, params });
      try {
        const quote = await transport(url, { method: 'POST', redirect: 'error', signal, headers: { 'content-type': 'application/json' }, body });
        if (quote.status !== 402) return { status: 'not_delivered', reason: `Expected a 402 payment challenge, got HTTP ${quote.status}.` };
        await quote.body?.cancel();
        // The body is a simplified view; the full x402 v2 requirements (asset, amount, fee payer) are in this header.
        const challenge = decodeHeader(quote.headers.get('payment-required'));
        const offer = (challenge as { accepts?: { network?: string; asset?: string; amount?: string }[] } | null)?.accepts?.find((a) => a.network === network && a.asset === usdcMint);
        if (!offer?.amount || !/^\d+$/.test(offer.amount)) return { status: 'not_delivered', reason: 'No Solana devnet USDC offer in the challenge.' };
        const amount = BigInt(offer.amount);
        if (amount > maxCall || committed + amount > options.maxTotalUusdc) return { status: 'not_delivered', reason: `A ${amount} uUSDC call would exceed the spending cap.` };

        const payload = await client.createPaymentPayload(challenge as Parameters<typeof client.createPaymentPayload>[0]);
        // Counted before sending: an interrupted call must never look cheaper than it might have been.
        committed += amount;
        const response = await transport(url, { method: 'POST', redirect: 'error', signal, headers: { 'content-type': 'application/json', ...http.encodePaymentSignatureHeader(payload) }, body });
        const settlement = decodeHeader(response.headers.get('payment-response'));
        const receipt = decodeHeader(response.headers.get('x-telegraph-receipt'));
        if (!response.ok) {
          if (!settlement) committed -= amount;
          return { status: 'not_delivered', reason: `The node answered HTTP ${response.status}${settlement ? ' after settling the payment' : ''}.` };
        }
        const delivered = deliveredBodySchema.safeParse(await response.json());
        if (!delivered.success) return { status: 'not_delivered', reason: 'The delivered answer had an unexpected shape.' };
        const settlementTx = typeof settlement?.transaction === 'string' ? settlement.transaction : null;
        const receiptHash = typeof receipt?.receipt_hash === 'string' ? receipt.receipt_hash : null;
        // An answer with neither a settlement nor a receipt is an unpaid fallback, never evidence.
        if (!settlementTx && !receiptHash) return { status: 'not_delivered', reason: 'Delivered answer carried no payment settlement or receipt.' };
        return { status: 'delivered', delivery: { body: delivered.data, minerName: delivered.data.miner_name ?? null, purchase: {
          rail: 'solana-x402', receiptHash: receiptHash ?? settlementTx, signalHash: delivered.data.signal_hash ?? null,
          amountUusdc: amount.toString(), minerId: delivered.data.miner_id ?? null, latencyMs: Date.now() - started,
          ...(settlementTx ? { settlementTx } : {}),
        } } };
      } catch (error) {
        return { status: 'not_delivered', reason: (error as Error).message.slice(0, 300) };
      }
    },
  };
}
