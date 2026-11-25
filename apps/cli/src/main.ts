#!/usr/bin/env node
import '@triad/intel/dns';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { z } from 'zod';
import { decide, detectChanges, instructionSchema, planChecks, shipmentSchema } from '@triad/core';
import type { CallbackResult } from '@triad/core';
import { buildEvidence, evidenceHash, verifyEvidence } from '@triad/evidence';
import type { EvidenceFile } from '@triad/evidence';
import { createEscrowClient, createEscrowTelegraphClient, createX402SolanaTelegraphClient, gather, loadDirectory, loadSdnListCached, TELEGRAPH_TESTNET } from '@triad/intel';
import type { TelegraphClient } from '@triad/intel';
import { loadEvmAccount, loadSolanaSigner, SOLANA_DEVNET_RPC } from './keys.js';
import { fundCommand, releaseCommand } from './settle.js';

// triad decide <scenario.json> [--send] [--rail sepolia|solana] [--key <file>]   plan a scenario's checks; with --send, buy them
//   (Sepolia escrow or Solana devnet x402) and decide
// triad verify <evidence.json>                           recompute an evidence file's hash and check its receipts
// triad fund <scenario.json> [--send]                    lock the shipment's payment in its escrow (the operator pays)
// triad release <evidence.json> [--send]                 pay a CLEAR decision's payout, signed by the release officer
const ROOT = resolve(import.meta.dirname, '../../..');
const PRICE_UUSDC = 10_000n;

const scenarioSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]{3,60}$/),
  description: z.string().min(1).max(500),
  synthetic: z.array(z.string()).max(20),
  shipment: shipmentSchema,
  instruction: instructionSchema,
  callback: z.object({ contactId: z.string(), channel: z.enum(['phone', 'email']), outcome: z.enum(['confirmed', 'denied']), respondedAt: z.string().datetime() }).strict().optional(),
}).strict();

function option(args: string[], flag: string): string | undefined {
  const at = args.indexOf(flag);
  return at >= 0 ? args[at + 1] : undefined;
}

async function loadSigner(path: string) {
  const account = await loadEvmAccount(path);
  return { address: account.address, signMessage: (message: string) => account.signMessage({ message }) };
}

async function readScenario(file: string) {
  const scenario = scenarioSchema.parse(JSON.parse(await readFile(file, 'utf8')));
  if (scenario.instruction.shipmentId !== scenario.shipment.id) throw new Error('The instruction is for a different shipment.');
  return scenario;
}

async function decideCommand(args: string[]) {
  const file = args[0];
  if (!file) throw new Error('Usage: triad decide <scenario.json> [--send] [--key <file>]');
  const scenario = await readScenario(file);
  const changeSet = detectChanges(scenario.shipment, scenario.instruction);
  const plan = planChecks(scenario.shipment, changeSet);
  const maxCalls = plan.reduce((n, c) => n + (c.required ? 2 : 1), 0);
  console.log(`${scenario.name}: ${changeSet.changes.map((c) => c.kind).join(', ') || 'no changes'}; sender ${changeSet.sender.domain?.relation ?? 'unknown'}`);
  for (const c of plan) console.log(`  ${c.required ? 'required' : 'optional'}  ${c.id.padEnd(24)} ${c.purpose}`);
  console.log(`  at most ${maxCalls} paid calls, ${(Number(BigInt(maxCalls) * PRICE_UUSDC) / 1e6).toFixed(2)} test USDC`);
  if (!args.includes('--send')) { console.log('Dry run: add --send to buy the checks.'); return; }

  const rail = option(args, '--rail') ?? 'sepolia';
  const budget = BigInt(maxCalls) * PRICE_UUSDC;
  let telegraph: TelegraphClient;
  if (rail === 'solana') {
    const signer = await loadSolanaSigner(option(args, '--key') ?? resolve(ROOT, '.secrets/solana-operator.json'));
    telegraph = createX402SolanaTelegraphClient({ signer, rpcUrl: SOLANA_DEVNET_RPC, maxTotalUusdc: budget });
  } else if (rail === 'sepolia') {
    const keyFile = option(args, '--key') ?? process.env.TRIAD_BUYER_KEYFILE ?? resolve(ROOT, '.secrets/evm-operator.json');
    telegraph = createEscrowTelegraphClient(createEscrowClient({
      policy: { node: TELEGRAPH_TESTNET.node, network: TELEGRAPH_TESTNET.sepolia.network, diamond: TELEGRAPH_TESTNET.sepolia.diamond, maxCallUusdc: TELEGRAPH_TESTNET.maxCallUusdc },
      signer: await loadSigner(keyFile), maxTotalUusdc: budget,
    }));
  } else throw new Error('--rail is sepolia or solana.');
  const [directory, sdn] = await Promise.all([loadDirectory(TELEGRAPH_TESTNET.node), loadSdnListCached(resolve(ROOT, '.cache/ofac'))]);
  const started = Date.now();
  const outcomes = await gather(plan, { telegraph, directory, sdn });
  const callback = scenario.callback as CallbackResult | undefined;
  const decision = decide({ shipment: scenario.shipment, instruction: scenario.instruction, changeSet, plan, outcomes, ...(callback ? { callback } : {}) });
  const evidence = buildEvidence({ provenance: { scenario: scenario.name, synthetic: scenario.synthetic, network: 'testnet' }, shipment: scenario.shipment, instruction: scenario.instruction, changeSet, plan, outcomes, decision });
  const hash = evidenceHash(evidence);
  // Paid evidence is never lost to a name clash: seconds in the name, and a numbered suffix if it still exists.
  const dir = resolve(ROOT, 'docs/results/decisions');
  await mkdir(dir, { recursive: true });
  const stamp = evidence.generatedAt.slice(0, 19).replace(/:/g, '');
  let out = '';
  for (let n = 0; ; n++) {
    out = resolve(dir, `${stamp}Z-${scenario.name}${n ? `-${n}` : ''}.json`);
    try { await writeFile(out, JSON.stringify({ evidence_sha256: hash, evidence }, null, 2) + '\n', { flag: 'wx' }); break; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || n > 50) throw error; }
  }

  for (const o of outcomes) console.log(`  ${o.status.padEnd(12)} ${o.checkId.padEnd(24)} ${o.detail.slice(0, 160)}`);
  console.log(`\n${decision.decision}${decision.needs.length ? ` (needs ${decision.needs.join(' and ')})` : ''} in ${((Date.now() - started) / 1000).toFixed(1)} s, ${(Number(evidence.cost.telegraphUusdc) / 1e6).toFixed(2)} test USDC over ${evidence.cost.purchases} purchases`);
  for (const h of decision.hits) console.log(`  ${h.effect.padEnd(14)} ${h.rule.padEnd(24)} ${h.text.slice(0, 160)}`);
  console.log(`Evidence: ${basename(out)} (sha256 ${hash})`);
}

async function verifyCommand(args: string[]) {
  const file = args[0];
  if (!file) throw new Error('Usage: triad verify <evidence.json>');
  const stored = JSON.parse(await readFile(file, 'utf8')) as { evidence_sha256?: string; evidence?: EvidenceFile };
  if (!stored.evidence) throw new Error(`${file} holds no evidence file.`);
  const result = verifyEvidence(stored.evidence, stored.evidence_sha256);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

const [command, ...rest] = process.argv.slice(2);
const commands: Record<string, (args: string[]) => Promise<void>> = {
  decide: decideCommand,
  verify: verifyCommand,
  fund: async (args) => fundCommand((await readScenario(args[0] ?? '')).shipment, args.includes('--send')),
  release: async (args) => releaseCommand(args[0] ?? '', args.includes('--send')),
};
const run = commands[command ?? ''] ? commands[command!]!(rest) : Promise.reject(new Error(`Commands: ${Object.keys(commands).join(' | ')}`));
run.catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
