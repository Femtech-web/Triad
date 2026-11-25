import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';
import { attestationMessage } from '@triad/evidence/canonical';
import type { Attestation } from '@triad/evidence/canonical';
import { loadDirectory, loadSdnListCached, TELEGRAPH_TESTNET } from '@triad/intel';
import type { MinerDirectory, SdnList } from '@triad/intel';

// What the console's server needs: its testnet keys, a seal for the evidence it issues, the OFAC snapshot it screens
// against, Telegraph's Miner directory, and a per-client rate limit. Keys come from the environment when deployed and
// from the repository's owner-only .secrets files when run locally; neither ever reaches a response.

const ROOT = join(process.cwd(), '../..');
const HEX_KEY = /^0x[0-9a-fA-F]{64}$/;

function evmKey(env: string, file: string): Hex | null {
  const fromEnv = process.env[env];
  if (fromEnv) {
    if (!HEX_KEY.test(fromEnv)) throw new Error(`${env} is not a private key.`);
    return fromEnv as Hex;
  }
  const path = join(ROOT, '.secrets', file);
  if (!existsSync(path)) return null;
  if ((lstatSync(path).mode & 0o077) !== 0) throw new Error(`${file} must be readable only by its owner.`);
  const key = (JSON.parse(readFileSync(path, 'utf8')) as { private_key?: string }).private_key;
  return key && HEX_KEY.test(key) ? (key as Hex) : null;
}

const operatorKey = () => evmKey('TRIAD_EVM_OPERATOR_KEY', 'evm-operator.json');
export function operatorAccount() {
  const key = operatorKey();
  if (!key) throw new LiveUnavailable('This deployment has no operator key, so it can replay recorded runs but not buy new checks.');
  return privateKeyToAccount(key);
}
export function releaseOfficerAccount() {
  const key = evmKey('TRIAD_EVM_RELEASE_OFFICER_KEY', 'evm-release-officer.json');
  if (!key) throw new LiveUnavailable('This deployment has no release officer key.');
  return privateKeyToAccount(key);
}

export class LiveUnavailable extends Error {}

// Signs every evidence file's hash so anyone can check it came from Triad; without a key, files go out unsigned.
const issuerKey = () => evmKey('TRIAD_EVM_ISSUER_KEY', 'evm-issuer.json');
export const issuerAddress = (): string | null => { const key = issuerKey(); return key ? privateKeyToAccount(key).address : null; };
const signatures = new Map<string, Attestation>();
export async function attest(evidenceHash: string): Promise<Attestation | null> {
  const key = issuerKey();
  if (!key) return null;
  const hash = evidenceHash.toLowerCase();
  if (!signatures.has(hash)) {
    const account = privateKeyToAccount(key);
    signatures.set(hash, { scheme: 'eip191', signer: account.address, signature: await account.signMessage({ message: attestationMessage(hash) }) });
  }
  return signatures.get(hash)!;
}

// The seal proves an evidence file came from this server, so a callback or release request can't bring its own answers.
function sealKey(): Buffer {
  const secret = process.env.TRIAD_SEAL_SECRET ?? (operatorKey() ? `derived:${operatorKey()}` : null);
  if (!secret) throw new LiveUnavailable('This deployment cannot seal evidence.');
  return createHash('sha256').update(`triad-console-seal-v1:${secret}`).digest();
}
export const seal = (evidenceHash: string): string => createHmac('sha256', sealKey()).update(evidenceHash.toLowerCase()).digest('hex');
export function sealMatches(evidenceHash: string, candidate: string): boolean {
  const expected = Buffer.from(seal(evidenceHash), 'hex');
  const given = Buffer.from(/^[0-9a-f]{64}$/.test(candidate) ? candidate : '', 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// The OFAC snapshot ships with the app (synced from the repository's cache), and its hash goes into every evidence file.
let sdnList: Promise<SdnList> | null = null;
export function sdn(): Promise<SdnList> {
  const shipped = join(process.cwd(), 'data/ofac');
  sdnList ??= loadSdnListCached(existsSync(join(shipped, 'sdn.csv')) ? shipped : join(ROOT, '.cache/ofac'), Number.POSITIVE_INFINITY)
    .catch((error: Error) => { sdnList = null; throw error; });
  return sdnList;
}

let directoryCache: { at: number; value: Promise<MinerDirectory> } | null = null;
export function directory(): Promise<MinerDirectory> {
  if (!directoryCache || Date.now() - directoryCache.at > 10 * 60_000) {
    const value = loadDirectory(TELEGRAPH_TESTNET.node).catch((error: Error) => { directoryCache = null; throw error; });
    directoryCache = { at: Date.now(), value };
  }
  return directoryCache.value;
}

// Per instance and per client address: enough to stop a loop from draining the testnet wallets, not a quota system.
const windows = new Map<string, number[]>();
export function allow(bucket: string, client: string, limit: number, windowMs = 3_600_000): boolean {
  const key = `${bucket}:${client}`;
  const now = Date.now();
  const recent = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) { windows.set(key, recent); return false; }
  recent.push(now);
  windows.set(key, recent);
  return true;
}
export const clientOf = (request: Request): string => request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'local';
