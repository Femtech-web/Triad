// Buys one Triad check over x402 and records the sale. It asks the endpoint for its terms first (a request carrying no
// valid payment gets the 402 challenge), so no free allowance is used and only the paid decision reaches the ledger.
//   TRIAD_URL=https://triad-five-steel.vercel.app TRIAD_PAYER_KEYFILE=<solana keypair> SOLANA_RPC_URL=<rpc> \
//     node --import tsx src/try-paid.ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createKeyPairSignerFromBytes } from '@solana/kit';
import { decodePaymentResponseHeader } from '@x402/core/http';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import { ExactSvmScheme } from '@x402/svm/exact/client';

const base = (process.env.TRIAD_URL ?? 'https://triad-five-steel.vercel.app').replace(/\/$/, '');
const network = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
const asset = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const signer = await createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(await readFile(process.env.TRIAD_PAYER_KEYFILE!, 'utf8')) as number[]));
const client = x402Client.fromConfig({
  schemes: [{ network, client: new ExactSvmScheme(signer, process.env.SOLANA_RPC_URL ? { rpcUrl: process.env.SOLANA_RPC_URL } : {}) }],
  spendControls: { allowedAssets: [{ network, asset, maxAmountPerPayment: '100000' }] },
});
const http = new x402HTTPClient(client);
const input = {
  supplier: { legalName: 'GLENCORE INTERNATIONAL AG', country: 'CH', domain: 'glencore.com' },
  account: { holder: 'GLENCORE INTERNATIONAL AG', number: 'CH9300762011623852957' },
  contact: { name: 'Glencore Treasury Desk', email: 'treasury.desk@glencore.com', phone: '+41410001005' },
  email: { fromName: 'Glencore Treasury Desk', from: 'treasury.desk@glencor.com', message: 'Our bank account has changed with immediate effect.' },
  change: { kind: 'payout', holder: 'GLENCORE INTERNATIONAL AG', number: 'CH5604835012345678009' },
};
const post = (headers: Record<string, string>) => fetch(`${base}/api/v1/check`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(input) });

const challenge = await post({ 'payment-signature': 'terms' });
if (challenge.status !== 402) throw new Error(`Expected a 402 challenge, got HTTP ${challenge.status}.`);
const required = JSON.parse(Buffer.from(challenge.headers.get('payment-required')!, 'base64').toString('utf8')) as Parameters<typeof client.createPaymentPayload>[0] & { accepts: { amount: string; payTo: string; network: string; asset: string }[] };
const offer = required.accepts[0]!;
console.log(`Terms: ${Number(offer.amount) / 1e6} USDC to ${offer.payTo} on ${offer.network}`);

const payload = await client.createPaymentPayload(required);
const paid = await post(http.encodePaymentSignatureHeader(payload));
const body = await paid.json() as { decision?: string; headline?: string; evidence_sha256?: string; attestation?: { signer: string } | null; billing?: { settled?: boolean; transaction?: string | null; error?: string }; error?: string };
const settlement = paid.headers.get('payment-response') ? decodePaymentResponseHeader(paid.headers.get('payment-response')!) : null;
console.log(`HTTP ${paid.status}: ${body.decision ?? body.error} | ${body.headline ?? ''}`);
console.log(`Billing: ${JSON.stringify(body.billing)}`);
if (!paid.ok || !body.billing?.settled) process.exit(1);

const record = {
  sale: 'one Triad payment check, sold over x402', endpoint: `${base}/api/v1/check`, network, asset,
  amountUusdc: offer.amount, payer: signer.address, payTo: offer.payTo, transaction: body.billing.transaction,
  explorer: `https://explorer.solana.com/tx/${body.billing.transaction}?cluster=devnet`, settlement,
  decision: body.decision, evidence_sha256: body.evidence_sha256, signedBy: body.attestation?.signer ?? null, at: new Date().toISOString(),
};
const out = resolve(import.meta.dirname, '../../../docs/results/x402-sales', `${record.at.slice(0, 16).replace(/:/g, '')}Z.json`);
await mkdir(resolve(out, '..'), { recursive: true });
await writeFile(out, JSON.stringify(record, null, 2) + '\n');
console.log(`Settled: ${record.explorer}\nRecorded: ${out}`);
