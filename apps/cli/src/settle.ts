import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPublicClient, createWalletClient, http } from 'viem';
import type { Address, Hex } from 'viem';
import { sepolia } from 'viem/chains';
import type { Shipment } from '@triad/core';
import { verifyEvidence } from '@triad/evidence';
import type { EvidenceFile } from '@triad/evidence';
import { TELEGRAPH_TESTNET } from '@triad/intel';
import { authorizeEvmRelease, authorizeSolanaRelease, createEvmSettlement, createSolanaSettlement, fromHex, shipmentKey, toHex } from '@triad/settle';
import type { ReleaseAuthorization } from '@triad/settle';
import { loadEvmAccount, loadSolanaSigner, SEPOLIA_RPC, SEPOLIA_TEST_USDC, SOLANA_DEVNET_RPC } from './keys.js';

// Funding and releasing a shipment's escrow, on the rail its payout names. A release needs a verified evidence file
// whose decision is CLEAR; it pays the payout that decision cleared, signed by the shipment's release officer and
// submitted by the operator.

const ROOT = resolve(import.meta.dirname, '../../..');
const SECRETS = resolve(ROOT, '.secrets');
const AUTHORIZATION_TTL_SECONDS = 15 * 60;
const REFUND_AFTER_SECONDS = 7 * 86_400;
const now = () => Math.floor(Date.now() / 1000);

async function sepoliaRail() {
  const deployment = JSON.parse(await readFile(resolve(ROOT, 'deployments/sepolia.json'), 'utf8')) as { address: Address };
  const operator = await loadEvmAccount(resolve(SECRETS, 'evm-operator.json'));
  const publicClient = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });
  const wallet = createWalletClient({ account: operator, chain: sepolia, transport: http(SEPOLIA_RPC) });
  return { escrow: deployment.address, operator, settlement: createEvmSettlement({ publicClient, wallet, escrow: deployment.address }) };
}

async function solanaRail() {
  const { createSolanaRpc, createSolanaRpcSubscriptions, address } = await import('@solana/kit');
  const deployment = JSON.parse(await readFile(resolve(ROOT, 'deployments/solana-devnet.json'), 'utf8')) as { programId: string };
  const operator = await loadSolanaSigner(resolve(SECRETS, 'solana-operator.json'));
  const programAddress = address(deployment.programId);
  const settlement = createSolanaSettlement({
    rpc: createSolanaRpc(SOLANA_DEVNET_RPC), rpcSubscriptions: createSolanaRpcSubscriptions(SOLANA_DEVNET_RPC.replace(/^http/, 'ws')), programAddress, payer: operator,
  });
  return { programAddress, operator, mint: address(TELEGRAPH_TESTNET.solanaDevnet.usdcMint), settlement };
}

// The release officer's ed25519 key, as Web Crypto keys: it only signs, and never leaves this process.
async function solanaOfficer() {
  const { createKeyPairFromBytes, getAddressFromPublicKey } = await import('@solana/kit');
  const bytes = JSON.parse(await readFile(resolve(SECRETS, 'solana-release-officer.json'), 'utf8')) as number[];
  const keyPair = await createKeyPairFromBytes(new Uint8Array(bytes));
  return { address: await getAddressFromPublicKey(keyPair.publicKey), keyPair };
}

export async function fundCommand(shipment: Shipment, send: boolean) {
  const key = shipmentKey(shipment.id);
  const amount = BigInt(shipment.amount.value);
  const refundAfter = BigInt(now() + REFUND_AFTER_SECONDS);
  if (shipment.payout.rail === 'solana-devnet') {
    const { address } = await import('@solana/kit');
    const { programAddress, operator, mint, settlement } = await solanaRail();
    const current = await settlement.read(key);
    console.log(JSON.stringify({ shipment: shipment.id, shipmentKey: toHex(key), program: programAddress, buyer: operator.address, mint, amount: shipment.amount, releaseOfficer: shipment.releaseOfficer.publicKey, state: current?.state ?? 'None' }, null, 1));
    if (current) throw new Error(`Shipment ${shipment.id} is already ${current.state}.`);
    if (!send) { console.log('Dry run: add --send to fund the escrow.'); return; }
    const tx = await settlement.fund({ mint, shipmentKey: key, amount, releaseOfficer: address(shipment.releaseOfficer.publicKey), refundAfter });
    console.log(`Funded: https://explorer.solana.com/tx/${tx.signature}?cluster=devnet`);
    return;
  }
  const { escrow, operator, settlement } = await sepoliaRail();
  const current = await settlement.read(toHex(key));
  console.log(JSON.stringify({ shipment: shipment.id, shipmentKey: toHex(key), escrow, buyer: operator.address, amount: shipment.amount, releaseOfficer: shipment.releaseOfficer.publicKey, state: current.state }, null, 1));
  if (current.state !== 'None') throw new Error(`Shipment ${shipment.id} is already ${current.state}.`);
  if (!send) { console.log('Dry run: add --send to fund the escrow.'); return; }
  const tx = await settlement.fund({ shipmentKey: toHex(key), token: SEPOLIA_TEST_USDC, amount, releaseOfficer: shipment.releaseOfficer.publicKey as Address, refundAfter });
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
  const key = shipmentKey(shipment.id);
  const validUntil = BigInt(now() + AUTHORIZATION_TTL_SECONDS);

  let authorization: ReleaseAuthorization;
  let submit: () => Promise<{ transaction: string; explorer: string }>;
  let escrow: string;
  if (payout.rail === 'solana-devnet') {
    const { address } = await import('@solana/kit');
    const officer = await solanaOfficer();
    if (officer.address !== shipment.releaseOfficer.publicKey) throw new Error('This shipment names a different release officer.');
    const { programAddress, mint, settlement } = await solanaRail();
    const state = await settlement.read(key);
    if (state?.state !== 'Funded') throw new Error(`Shipment ${shipment.id} is ${state?.state ?? 'not funded'}, not Funded.`);
    authorization = await authorizeSolanaRelease(officer, { programAddress, shipmentKey: key, payee: address(payout.address), mint, amount: state.amount, evidenceHash: fromHex(stored.evidence_sha256), validUntil });
    escrow = programAddress;
    submit = async () => {
      const tx = await settlement.release(authorization, state.buyer, mint);
      return { transaction: tx.signature, explorer: `https://explorer.solana.com/tx/${tx.signature}?cluster=devnet` };
    };
  } else {
    const officer = await loadEvmAccount(resolve(SECRETS, 'evm-release-officer.json'));
    if (officer.address.toLowerCase() !== shipment.releaseOfficer.publicKey.toLowerCase()) throw new Error('This shipment names a different release officer.');
    const rail = await sepoliaRail();
    const state = await rail.settlement.read(toHex(key));
    if (state.state !== 'Funded') throw new Error(`Shipment ${shipment.id} is ${state.state}, not Funded.`);
    authorization = await authorizeEvmRelease(officer, { chainId: sepolia.id, escrow: rail.escrow, shipmentKey: toHex(key), payee: payout.address as Address, amount: state.amount, evidenceHash: stored.evidence_sha256, validUntil });
    escrow = rail.escrow;
    submit = async () => {
      const tx = await rail.settlement.release(authorization);
      return { transaction: tx.hash, explorer: `https://sepolia.etherscan.io/tx/${tx.hash}` };
    };
  }

  console.log(JSON.stringify({ shipment: shipment.id, rail: payout.rail, decision: decision.decision, payee: payout.address, holder: payout.holderName, amount: authorization.amount, evidence: stored.evidence_sha256, signer: authorization.signer }, null, 1));
  if (!send) { console.log('Dry run: add --send to release.'); return; }
  const { transaction, explorer } = await submit();
  const record = { rail: payout.rail, escrow, transaction, explorer, evidenceFile: file.split('/').pop(), authorization, releasedAt: new Date().toISOString() };
  const out = resolve(ROOT, 'docs/results/releases', `${record.releasedAt.slice(0, 16).replace(/:/g, '')}Z-${shipment.id}.json`);
  await mkdir(resolve(out, '..'), { recursive: true });
  await writeFile(out, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
  console.log(`Released: ${explorer}`);
}
