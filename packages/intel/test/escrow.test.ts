import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAuthorization, createEscrowClient, EscrowPolicyError, resourceFor, selectEscrowOffer } from '../src/telegraph/escrow.js';
import type { EscrowEvent } from '../src/telegraph/escrow.js';

// Synthetic node: the challenge mirrors the documented escrow offer; addresses are the pinned testnet ones.
const diamond = '0x72a70e949362670bf8bcead24efc5b8f950aa08b';
const policy = { node: 'https://node.example', network: 'eip155:11155111', diamond: '0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b', maxCallUusdc: 50_000n };
const payer = '0x9F05252a8f756E50B7e0A1f2a92C98b1ff0C5B27';
const template = (resource: string, amount = 10000, payTo = diamond, network = 'eip155:11155111') =>
  `Telegraph Escrow Payment\n\nWallet: {from}\nPay To: ${payTo}\nNetwork: ${network}\nAmount: ${amount} uUSDC\nResource: ${resource}\nNonce: {nonce}\nValid After: {validAfter}\nValid Before: {validBefore}`;
const offer = (resource: string, overrides: Record<string, unknown> = {}, amount = 10000) => ({
  scheme: 'escrow', network: 'eip155:11155111', price: '$0.01', payTo: diamond,
  extra: { resource, signWith: 'personal_sign (EIP-191)', message: template(resource, amount) }, ...overrides,
});
const receipt = (amount = '10000', who = payer.toLowerCase()) => Buffer.from(JSON.stringify({
  receipt_hash: `0x${'d'.repeat(64)}`, rail: 'escrow', payer: who, miner: '905227', intent: 'SECURITY_REVIEW_GENERAL',
  amount_uusdc: amount, epoch_id: 31, settlement: 'epoch', chain: 'telegraph', timestamp: 1795230000,
})).toString('base64');

function node(paid: (headers: Headers) => Response, accepts: unknown[] = [offer('/v1/ask/905227')]) {
  const calls: { headers: Headers; body: string }[] = [];
  const fetcher = (async (_url: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    calls.push({ headers, body: String(init.body) });
    if (!headers.has('x-payment')) return Response.json({ x402Version: 2, accepts }, { status: 402 });
    return paid(headers);
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}
function signer(log: string[] = []) {
  return { address: payer, signMessage: async (message: string) => { log.push(message); return `0x${'a'.repeat(130)}`; } };
}

test('a delivered call signs the node template verbatim and returns a matching receipt', async () => {
  const messages: string[] = [];
  const events: EscrowEvent[] = [];
  const { fetcher, calls } = node(() => new Response(JSON.stringify({ result: { verdict: 'Needs changes' } }), { headers: { 'x-payment-response': receipt() } }));
  const client = createEscrowClient({ policy, signer: signer(messages), maxTotalUusdc: 100_000n, fetch: fetcher, journal: async (e) => { events.push(e); }, now: () => 1795230000 });
  const result = await client.ask('/engine/v1/ask/905227', { intent: 'SECURITY_REVIEW_GENERAL', params: { target: 'Is lodash 4.17.15 vulnerable?' } });
  assert.equal(result.status, 'delivered');
  assert.equal(client.spentUusdc(), 10_000n);
  assert.match(messages[0]!, new RegExp(`^Telegraph Escrow Payment\\n\\nWallet: ${payer.toLowerCase()}\\nPay To: ${diamond}\\nNetwork: eip155:11155111\\nAmount: 10000 uUSDC\\nResource: /v1/ask/905227\\nNonce: [0-9a-f-]{36}\\nValid After: 1795229995\\nValid Before: 1795230100$`));
  const header = JSON.parse(Buffer.from(calls[1]!.headers.get('x-payment')!, 'base64').toString('utf8'));
  assert.deepEqual([header.scheme, header.network, header.payload.authorization.from, header.payload.authorization.to, header.payload.authorization.value], ['escrow', 'eip155:11155111', payer.toLowerCase(), diamond, '10000']);
  assert.equal(calls[0]!.body, calls[1]!.body, 'the paid request carries the exact quoted body');
  assert.deepEqual(events.map((e) => e.type), ['authorized', 'delivered']);
});

test('nothing is signed for a wrong destination, network, resource, template or an over-cap quote', async () => {
  const resource = '/v1/ask/905227';
  const bad = [
    [offer(resource, { payTo: '0x0000000000000000000000000000000000000001' })],
    [offer(resource, { network: 'eip155:1' })],
    [offer('/v1/ask')],
    [offer(resource, { extra: { resource, message: template(resource).replace('Nonce: {nonce}\n', '') } })],
    [offer(resource, { extra: { resource, message: template(resource, 10000, '0x0000000000000000000000000000000000000001') } })],
  ];
  for (const accepts of bad) {
    const messages: string[] = [];
    const { fetcher } = node(() => new Response('{}'), accepts);
    const client = createEscrowClient({ policy, signer: signer(messages), maxTotalUusdc: 100_000n, fetch: fetcher });
    await assert.rejects(client.ask('/engine/v1/ask/905227', { query: 'q' }), EscrowPolicyError);
    assert.equal(messages.length, 0);
  }
  assert.throws(() => selectEscrowOffer({ accepts: [offer(resource, {}, 60_000)] }, policy, resource), /exceeds the per-call cap/);
  assert.throws(() => resourceFor('/engine/v1/other'), EscrowPolicyError);
});

test('the session cap, refusals and unbilled failures are accounted for exactly', async () => {
  const { fetcher } = node(() => new Response(JSON.stringify({ reason: 'insufficient escrow for delivery' }), { status: 402 }));
  const client = createEscrowClient({ policy, signer: signer(), maxTotalUusdc: 15_000n, fetch: fetcher });
  const refused = await client.ask('/engine/v1/ask/905227', { query: 'q' });
  assert.deepEqual([refused.status, refused.status === 'refused' && refused.reason], ['refused', 'insufficient escrow for delivery']);
  assert.equal(client.spentUusdc(), 0n, 'a refusal is not billed');

  const failing = node(() => new Response('{"error":"invalid request body"}', { status: 400 }));
  const second = createEscrowClient({ policy, signer: signer(), maxTotalUusdc: 15_000n, fetch: failing.fetcher });
  assert.equal((await second.ask('/engine/v1/ask/905227', { query: 'q' })).status, 'failed');
  assert.equal(second.spentUusdc(), 0n, 'no receipt on a failure means not charged');

  const delivered = node(() => new Response('{}', { headers: { 'x-payment-response': receipt() } }));
  const capped = createEscrowClient({ policy, signer: signer(), maxTotalUusdc: 15_000n, fetch: delivered.fetcher });
  await capped.ask('/engine/v1/ask/905227', { query: 'q' });
  await assert.rejects(capped.ask('/engine/v1/ask/905227', { query: 'q' }), /session spending cap/);
});

test('receipts must match the signed payer and amount, and windows stay under two minutes', async () => {
  const wrong = node(() => new Response('{}', { headers: { 'x-payment-response': receipt('20000') } }));
  const client = createEscrowClient({ policy, signer: signer(), maxTotalUusdc: 100_000n, fetch: wrong.fetcher });
  await assert.rejects(client.ask('/engine/v1/ask/905227', { query: 'q' }), /payer or amount differs/);
  const built = buildAuthorization({ network: 'eip155:11155111', payTo: diamond, resource: '/v1/ask', amountUusdc: 10000n, template: template('/v1/ask') }, payer, 'nonce-1234', 1000);
  assert.ok(Number(built.authorization.validBefore) - Number(built.authorization.validAfter) <= 120);
  assert.throws(() => buildAuthorization({ network: 'n', payTo: diamond, resource: '/v1/ask', amountUusdc: 1n, template: 't' }, payer, 'short', 1000), /Nonce/);
});
