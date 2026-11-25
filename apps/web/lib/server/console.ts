import 'server-only';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPublicClient, createWalletClient, http, isAddress } from 'viem';
import type { Address, Hex } from 'viem';
import { sepolia } from 'viem/chains';
import { decide, detectChanges, instructionSchema, planChecks, shipmentSchema } from '@triad/core';
import type { CheckOutcome, CheckRequest, Instruction, Shipment } from '@triad/core';
import { buildEvidence, evidenceHash, withCallback } from '@triad/evidence';
import type { Attestation, EvidenceFile } from '@triad/evidence';
import { createEscrowClient, createEscrowTelegraphClient, gather, TELEGRAPH_TESTNET } from '@triad/intel';
import { authorizeEvmRelease, createEvmSettlement, shipmentKey, toHex } from '@triad/settle';
import { consoleCase } from '../cases';
import { CHECK_SYNTHETIC, checkInputSchema, toCase } from '../check-model';
import { evidenceByHash } from '../data';
import { recordDecision, shareEvidence } from './ledger';
import type { Step, Surface } from './ledger';
import { attest, directory, operatorAccount, releaseOfficerAccount, sdn, seal, sealMatches } from './runtime';

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

export interface Issued { evidence: EvidenceFile; evidence_sha256: string; seal: string; attestation: Attestation | null }

async function issue(evidence: EvidenceFile, surface: Surface, step: Step, spent?: { purchases: number; uusdc: bigint }): Promise<Issued> {
  const hash = evidenceHash(evidence);
  const [attestation] = await Promise.all([attest(hash), recordDecision(evidence, hash, surface, step, spent)]);
  return { evidence, evidence_sha256: hash, seal: seal(hash), attestation };
}

// Optional per-answer progress, for callers that stream.
export interface Progress { onPlan?: (plan: CheckRequest[]) => void; onOutcome?: (outcome: CheckOutcome) => void }
const surfaceOf = (e: EvidenceFile): Surface => (e.provenance.scenario === 'check' ? 'check' : 'lab');

// Buys the checks a change makes relevant and decides. Both the attack lab and the everyday check run through here.
async function decideLive(shipment: Shipment, instruction: Instruction, provenance: EvidenceFile['provenance'], surface: Surface, progress: Progress = {}): Promise<Issued> {
  const changeSet = detectChanges(shipment, instruction);
  // A block from the email alone is final, so nothing is bought for it.
  const blockedByEmail = decide({ shipment, instruction, changeSet, plan: [], outcomes: [] }).decision === 'BLOCK';
  const plan = blockedByEmail ? [] : planChecks(shipment, changeSet);
  const maxCalls = plan.reduce((n, c) => n + (c.required ? 2 : 1), 0);
  if (maxCalls > MAX_CALLS) throw new ConsoleError(`This instruction would need ${maxCalls} paid calls; the console allows ${MAX_CALLS}.`);
  progress.onPlan?.(plan);
  const outcomes = plan.length ? await gather(plan, { telegraph: telegraphClient(maxCalls), directory: await directory(), sdn: await sdn(), ...(progress.onOutcome ? { onOutcome: progress.onOutcome } : {}) }) : [];
  const decision = decide({ shipment, instruction, changeSet, plan, outcomes });
  return issue(buildEvidence({ provenance, shipment, instruction, changeSet, plan, outcomes, decision }), surface, 'decision');
}

function telegraphClient(maxCalls: number) {
  const operator = operatorAccount();
  return createEscrowTelegraphClient(createEscrowClient({
    policy: { node: TELEGRAPH_TESTNET.node, network: TELEGRAPH_TESTNET.sepolia.network, diamond: TELEGRAPH_TESTNET.sepolia.diamond, maxCallUusdc: TELEGRAPH_TESTNET.maxCallUusdc },
    signer: { address: operator.address, signMessage: (message: string) => operator.signMessage({ message }) },
    maxTotalUusdc: BigInt(maxCalls) * PRICE_UUSDC,
  }));
}

const invalid = (what: string, issues: { path: PropertyKey[]; message: string }[]) =>
  new ConsoleError(`The ${what} is not valid: ${issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);

export async function runLive(caseName: string, submitted: unknown, progress: Progress = {}): Promise<Issued> {
  const base = consoleCase(caseName);
  if (!base) throw new ConsoleError(`There is no case named ${caseName}.`, 404);
  const parsed = instructionSchema.safeParse(submitted);
  if (!parsed.success) throw invalid('instruction', parsed.error.issues);
  if (parsed.data.shipmentId !== base.shipment.id) throw new ConsoleError('The instruction names a different shipment.');

  const officer = releaseOfficerAccount();
  const runId = randomBytes(5).toString('hex');
  const shipment = {
    ...base.shipment, id: `console-${runId}`, amount: { ...CONSOLE_AMOUNT },
    ...(base.shipment.payout.rail === 'sepolia' ? { releaseOfficer: { name: 'Triad console release desk', rail: 'sepolia' as const, publicKey: officer.address } } : {}),
  };
  const instruction: Instruction = { ...parsed.data, id: `ins-console-${runId}`, shipmentId: shipment.id };
  return decideLive(shipment, instruction, { scenario: `console:${base.name}`, synthetic: [...base.synthetic, 'amount (scaled to 0.01 test USDC for the console)'], network: 'testnet' }, 'lab', progress);
}

// The everyday check: a record and an email described in plain fields. It decides, and never releases anything.
export async function runCheck(submitted: unknown, progress: Progress = {}): Promise<Issued> {
  const parsed = checkInputSchema.safeParse(submitted);
  if (!parsed.success) throw invalid('check', parsed.error.issues);
  const built = toCase(parsed.data, `check-${randomBytes(5).toString('hex')}`);
  const shipment = shipmentSchema.safeParse(built.shipment);
  const instruction = instructionSchema.safeParse(built.instruction);
  if (!shipment.success) throw invalid('record', shipment.error.issues);
  if (!instruction.success) throw invalid('email', instruction.error.issues);
  return decideLive(shipment.data, instruction.data, { scenario: 'check', synthetic: CHECK_SYNTHETIC, network: 'testnet' }, 'check', progress);
}

// Evidence the server may build on: one it sealed, or one the repository records.
function trusted(input: { evidence: EvidenceFile; evidence_sha256: string; seal?: string }): EvidenceFile {
  const hash = evidenceHash(input.evidence);
  if (hash !== input.evidence_sha256.toLowerCase()) throw new ConsoleError('The evidence file does not match its hash.');
  if (input.seal ? sealMatches(hash, input.seal) : evidenceByHash(hash)) return input.evidence;
  throw new ConsoleError('This evidence was not issued by this console.', 403);
}

// The person on the trusted line answers. Nothing is bought again: the same answers are decided with the callback.
export async function answerCallback(input: { evidence: EvidenceFile; evidence_sha256: string; seal?: string; outcome: 'confirmed' | 'denied' }): Promise<Issued> {
  const evidence = trusted(input);
  if (!evidence.decision.needs.includes('callback') || !evidence.decision.callback.target) throw new ConsoleError('This decision is not waiting for a callback.');
  const answeredBy = evidence.provenance.scenario === 'check' ? 'recorded in the app by the payer after calling the trusted contact' : 'answered in the attack lab by the person playing the trusted contact';
  return issue(withCallback(evidence, input.outcome, new Date().toISOString(), answeredBy), surfaceOf(evidence), 'callback');
}

// After a hold for missing evidence, buys again only the required checks that failed for a reason a retry can fix: an
// outage or an answer that couldn't be read. An answer that disagrees, or is about another entity, is a real answer and
// stays; optional checks never hold a decision, so they aren't bought again.
const RETRYABLE = new Set(['unavailable', 'unreadable']);
export async function retryMissing(input: { evidence: EvidenceFile; evidence_sha256: string; seal?: string }, progress: Progress = {}): Promise<Issued> {
  const evidence = trusted(input);
  if (!evidence.decision.needs.includes('evidence')) throw new ConsoleError('This decision is not waiting for evidence.');
  const answered = new Map(evidence.outcomes.map((o) => [o.checkId, o]));
  const plan = evidence.plan.filter((c) => c.required && (!answered.has(c.id) || RETRYABLE.has(answered.get(c.id)!.status)));
  if (!plan.length) throw new ConsoleError('Nothing to retry: every check has an answer, and the hold comes from what the answers said.');
  const maxCalls = plan.reduce((n, c) => n + (c.required ? 2 : 1), 0);
  progress.onPlan?.(plan);
  const fresh = await gather(plan, { telegraph: telegraphClient(maxCalls), directory: await directory(), sdn: await sdn(), ...(progress.onOutcome ? { onOutcome: progress.onOutcome } : {}) });
  const retried = new Map(fresh.map((o) => [o.checkId, o]));
  const outcomes = evidence.plan.map((c) => retried.get(c.id) ?? answered.get(c.id)).filter((o): o is CheckOutcome => Boolean(o));
  const { shipment, instruction, changeSet } = evidence;
  const callback = evidence.decision.callback.result;
  const decision = decide({ shipment, instruction, changeSet, plan: evidence.plan, outcomes, ...(callback ? { callback } : {}) });
  const bought = fresh.flatMap((o) => o.sources.flatMap((src) => (src.purchase ? [src.purchase] : [])));
  return issue(buildEvidence({ provenance: evidence.provenance, shipment, instruction, changeSet, plan: evidence.plan, outcomes, decision }), surfaceOf(evidence), 'retry',
    { purchases: bought.length, uusdc: bought.reduce((n, p) => n + BigInt(p.amountUusdc), 0n) });
}

// Publishes a decision's full evidence file, at its owner's request, under a permalink.
export async function share(input: { evidence: EvidenceFile; evidence_sha256: string; seal?: string }): Promise<{ permalink: string }> {
  const evidence = trusted(input);
  const hash = evidenceHash(evidence);
  if (!(await shareEvidence({ evidence_sha256: hash, evidence, attestation: await attest(hash) }))) throw new ConsoleError('Sharing is not set up on this deployment.', 503);
  return { permalink: `/evidence/${hash}` };
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
