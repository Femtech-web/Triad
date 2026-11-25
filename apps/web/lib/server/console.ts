import 'server-only';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPublicClient, createWalletClient, http, isAddress } from 'viem';
import type { Address, Hex } from 'viem';
import { sepolia } from 'viem/chains';
import { decide, detectChanges, instructionSchema, planChecks } from '@triad/core';
import type { Instruction } from '@triad/core';
import { buildEvidence, evidenceHash, withCallback } from '@triad/evidence';
import type { EvidenceFile } from '@triad/evidence';
import { createEscrowClient, createEscrowTelegraphClient, gather, TELEGRAPH_TESTNET } from '@triad/intel';
import { authorizeEvmRelease, createEvmSettlement, shipmentKey, toHex } from '@triad/settle';
import { consoleCase } from '../cases';
import { evidenceByHash } from '../data';
import { directory, operatorAccount, releaseOfficerAccount, sdn, seal, sealMatches } from './runtime';

// Every console run is its own shipment: a fresh id, so its escrow can be funded and released once, and an amount
// scaled to 0.01 test USDC, so the testnet wallets last. The evidence file says both.
const CONSOLE_AMOUNT = { value: '10000', currency: 'USDC', decimals: 6 } as const;
const PRICE_UUSDC = 10_000n;
const MAX_CALLS = 16;
const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com';
const SEPOLIA_TEST_USDC = '0xcc194e1a843B658526D0D5C431f670028582Ae17' as const;
const AUTHORIZATION_TTL_SECONDS = 15 * 60;

export class ConsoleError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export interface Issued { evidence: EvidenceFile; evidence_sha256: string; seal: string }

function issue(evidence: EvidenceFile): Issued {
  const hash = evidenceHash(evidence);
  return { evidence, evidence_sha256: hash, seal: seal(hash) };
}

export async function runLive(caseName: string, submitted: unknown): Promise<Issued> {
  const base = consoleCase(caseName);
  if (!base) throw new ConsoleError(`There is no case named ${caseName}.`, 404);
  const parsed = instructionSchema.safeParse(submitted);
  if (!parsed.success) throw new ConsoleError(`The instruction is not valid: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  if (parsed.data.shipmentId !== base.shipment.id) throw new ConsoleError('The instruction names a different shipment.');

  const officer = releaseOfficerAccount();
  const runId = randomBytes(5).toString('hex');
  const shipment = {
    ...base.shipment, id: `console-${runId}`, amount: { ...CONSOLE_AMOUNT },
    ...(base.shipment.payout.rail === 'sepolia' ? { releaseOfficer: { name: 'Triad console release desk', rail: 'sepolia' as const, publicKey: officer.address } } : {}),
  };
  const instruction: Instruction = { ...parsed.data, id: `ins-console-${runId}`, shipmentId: shipment.id };
  const changeSet = detectChanges(shipment, instruction);
  const plan = planChecks(shipment, changeSet);
  const maxCalls = plan.reduce((n, c) => n + (c.required ? 2 : 1), 0);
  if (maxCalls > MAX_CALLS) throw new ConsoleError(`This instruction would need ${maxCalls} paid calls; the console allows ${MAX_CALLS}.`);

  const operator = operatorAccount();
  const telegraph = createEscrowTelegraphClient(createEscrowClient({
    policy: { node: TELEGRAPH_TESTNET.node, network: TELEGRAPH_TESTNET.sepolia.network, diamond: TELEGRAPH_TESTNET.sepolia.diamond, maxCallUusdc: TELEGRAPH_TESTNET.maxCallUusdc },
    signer: { address: operator.address, signMessage: (message: string) => operator.signMessage({ message }) },
    maxTotalUusdc: BigInt(maxCalls) * PRICE_UUSDC,
  }));
  const [dir, list] = await Promise.all([directory(), sdn()]);
  const outcomes = await gather(plan, { telegraph, directory: dir, sdn: list });
  const decision = decide({ shipment, instruction, changeSet, plan, outcomes });
  return issue(buildEvidence({
    provenance: { scenario: `console:${base.name}`, synthetic: [...base.synthetic, 'amount (scaled to 0.01 test USDC for the console)'], network: 'testnet' },
    shipment, instruction, changeSet, plan, outcomes, decision,
  }));
}

// Evidence the server may build on: one it sealed, or one the repository records.
function trusted(input: { evidence: EvidenceFile; evidence_sha256: string; seal?: string }): EvidenceFile {
  const hash = evidenceHash(input.evidence);
  if (hash !== input.evidence_sha256.toLowerCase()) throw new ConsoleError('The evidence file does not match its hash.');
  if (input.seal ? sealMatches(hash, input.seal) : evidenceByHash(hash)) return input.evidence;
  throw new ConsoleError('This evidence was not issued by this console.', 403);
}

// The person on the trusted line answers. Nothing is bought again: the same answers are decided with the callback.
export function answerCallback(input: { evidence: EvidenceFile; evidence_sha256: string; seal?: string; outcome: 'confirmed' | 'denied' }): Issued {
  const evidence = trusted(input);
  if (!evidence.decision.needs.includes('callback') || !evidence.decision.callback.target) throw new ConsoleError('This decision is not waiting for a callback.');
  return issue(withCallback(evidence, input.outcome, new Date().toISOString(), 'answered in the console by the person playing the trusted contact'));
}

// Transactions from the operator go one at a time, so concurrent releases never race for a nonce.
let queue: Promise<unknown> = Promise.resolve();
const serially = <T>(work: () => Promise<T>): Promise<T> => {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
};

export interface ConsoleRelease { rail: 'sepolia'; escrow: Address; shipmentKey: Hex; fundTx: Hex | null; releaseTx: Hex; explorer: string; payee: Address; amount: string; evidenceHash: string; signer: Address }

export async function releaseOnSepolia(input: { evidence: EvidenceFile; evidence_sha256: string; seal: string }): Promise<ConsoleRelease> {
  const evidence = trusted(input);
  const { shipment, instruction, decision } = evidence;
  if (decision.decision !== 'CLEAR') throw new ConsoleError(`The decision is ${decision.decision}; only CLEAR is released.`);
  if (!shipment.id.startsWith('console-')) throw new ConsoleError('Only shipments created by a live console run are funded and released here.');
  const payout = instruction.changes.payout ?? shipment.payout;
  if (payout.rail !== 'sepolia' || !isAddress(payout.address)) throw new ConsoleError('This payout is not a Sepolia address.');
  const officer = releaseOfficerAccount();
  if (officer.address.toLowerCase() !== shipment.releaseOfficer.publicKey.toLowerCase()) throw new ConsoleError('This shipment names a different release officer.');

  const { address: escrow } = JSON.parse(readFileSync(join(process.cwd(), 'data/deployments/sepolia.json'), 'utf8')) as { address: Address };
  const operator = operatorAccount();
  const publicClient = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });
  const wallet = createWalletClient({ account: operator, chain: sepolia, transport: http(SEPOLIA_RPC) });
  const settlement = createEvmSettlement({ publicClient, wallet, escrow });
  const key = toHex(shipmentKey(shipment.id));

  return serially(async () => {
    let state = await settlement.read(key);
    if (state.state === 'Released' || state.state === 'Refunded') throw new ConsoleError(`This shipment's escrow is already ${state.state.toLowerCase()}.`, 409);
    let fundTx: Hex | null = null;
    if (state.state === 'None') {
      const amount = BigInt(shipment.amount.value);
      fundTx = (await settlement.fund({ shipmentKey: key, token: SEPOLIA_TEST_USDC, amount, releaseOfficer: officer.address, refundAfter: BigInt(Math.floor(Date.now() / 1000) + 7 * 86_400) })).hash;
      state = { ...state, state: 'Funded', amount };
    }
    const authorization = await authorizeEvmRelease(officer, {
      chainId: sepolia.id, escrow, shipmentKey: key, payee: payout.address as Address, amount: state.amount,
      evidenceHash: input.evidence_sha256 as Hex, validUntil: BigInt(Math.floor(Date.now() / 1000) + AUTHORIZATION_TTL_SECONDS),
    });
    const tx = await settlement.release(authorization);
    return { rail: 'sepolia', escrow, shipmentKey: key, fundTx, releaseTx: tx.hash, explorer: `https://sepolia.etherscan.io/tx/${tx.hash}`,
      payee: payout.address as Address, amount: state.amount.toString(), evidenceHash: input.evidence_sha256, signer: officer.address };
  });
}
