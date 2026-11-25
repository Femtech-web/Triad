import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPublicClient, createWalletClient, http } from 'viem';
import type { Address, Hex } from 'viem';
import { sepolia } from 'viem/chains';
import type { Shipment } from '@triad/core';
import { verifyEvidence } from '@triad/evidence';
import type { EvidenceFile } from '@triad/evidence';
import { authorizeEvmRelease, createEvmSettlement, shipmentKey, toHex } from '@triad/settle';
import { loadEvmAccount, SEPOLIA_RPC, SEPOLIA_TEST_USDC } from './keys.js';

// Funding and releasing a shipment's escrow. A release needs a verified evidence file whose decision is CLEAR; it pays
// the payout that decision cleared, signed by the shipment's release officer and submitted by the operator.

const ROOT = resolve(import.meta.dirname, '../../..');
const SECRETS = resolve(ROOT, '.secrets');
const AUTHORIZATION_TTL_SECONDS = 15 * 60;

async function sepoliaRail() {
  const deployment = JSON.parse(await readFile(resolve(ROOT, 'deployments/sepolia.json'), 'utf8')) as { address: Address };
  const operator = await loadEvmAccount(resolve(SECRETS, 'evm-operator.json'));
  const publicClient = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });
  const wallet = createWalletClient({ account: operator, chain: sepolia, transport: http(SEPOLIA_RPC) });
  return { escrow: deployment.address, operator, settlement: createEvmSettlement({ publicClient, wallet, escrow: deployment.address }) };
}

export async function fundCommand(shipment: Shipment, send: boolean) {
  if (shipment.payout.rail !== 'sepolia') throw new Error(`Funding on ${shipment.payout.rail} is not wired into the CLI yet.`);
  const key = toHex(shipmentKey(shipment.id));
  const amount = BigInt(shipment.amount.value);
  const refundAfter = BigInt(Math.floor(Date.now() / 1000) + 7 * 86_400);
  const { escrow, operator, settlement } = await sepoliaRail();
  const current = await settlement.read(key);
  console.log(JSON.stringify({ shipment: shipment.id, shipmentKey: key, escrow, buyer: operator.address, amount: shipment.amount, releaseOfficer: shipment.releaseOfficer.publicKey, state: current.state }, null, 1));
  if (current.state !== 'None') throw new Error(`Shipment ${shipment.id} is already ${current.state}.`);
  if (!send) { console.log('Dry run: add --send to fund the escrow.'); return; }
  const tx = await settlement.fund({ shipmentKey: key, token: SEPOLIA_TEST_USDC, amount, releaseOfficer: shipment.releaseOfficer.publicKey as Address, refundAfter });
  console.log(`Funded: https://sepolia.etherscan.io/tx/${tx.hash}`);
}

export async function releaseCommand(file: string, send: boolean) {
  const stored = JSON.parse(await readFile(file, 'utf8')) as { evidence_sha256?: Hex; evidence?: EvidenceFile };
  if (!stored.evidence || !stored.evidence_sha256) throw new Error(`${file} holds no evidence file.`);
  const check = verifyEvidence(stored.evidence, stored.evidence_sha256);
  if (!check.ok) throw new Error(`Evidence does not verify: ${check.problems.join(' ')}`);
  const { shipment, instruction, decision } = stored.evidence;
  if (decision.decision !== 'CLEAR') throw new Error(`The decision is ${decision.decision}${decision.needs.length ? ` (needs ${decision.needs.join(' and ')})` : ''}; only CLEAR is released.`);
  const payout = instruction.changes.payout ?? shipment.payout;
  if (payout.rail !== 'sepolia') throw new Error(`Releasing on ${payout.rail} is not wired into the CLI yet.`);

  const officer = await loadEvmAccount(resolve(SECRETS, 'evm-release-officer.json'));
  if (officer.address.toLowerCase() !== shipment.releaseOfficer.publicKey.toLowerCase()) throw new Error('This shipment names a different release officer.');
  const { escrow, settlement } = await sepoliaRail();
  const key = toHex(shipmentKey(shipment.id));
  const before = await settlement.read(key);
  if (before.state !== 'Funded') throw new Error(`Shipment ${shipment.id} is ${before.state}, not Funded.`);
  const authorization = await authorizeEvmRelease(officer, {
    chainId: sepolia.id, escrow, shipmentKey: key, payee: payout.address as Address, amount: before.amount,
    evidenceHash: stored.evidence_sha256, validUntil: BigInt(Math.floor(Date.now() / 1000) + AUTHORIZATION_TTL_SECONDS),
  });
  console.log(JSON.stringify({ shipment: shipment.id, decision: decision.decision, payee: payout.address, holder: payout.holderName, amount: before.amount.toString(), evidence: stored.evidence_sha256, signer: authorization.signer }, null, 1));
  if (!send) { console.log('Dry run: add --send to release.'); return; }
  const tx = await settlement.release(authorization);
  const record = { rail: 'sepolia', escrow, transaction: tx.hash, blockNumber: tx.blockNumber.toString(), explorer: `https://sepolia.etherscan.io/tx/${tx.hash}`, evidenceFile: file.split('/').pop(), authorization, releasedAt: new Date().toISOString() };
  const out = resolve(ROOT, 'docs/results/releases', `${record.releasedAt.slice(0, 16).replace(/:/g, '')}Z-${shipment.id}.json`);
  await mkdir(resolve(out, '..'), { recursive: true });
  await writeFile(out, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
  console.log(`Released: ${record.explorer}`);
}
