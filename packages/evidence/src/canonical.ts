import type { ChangeSet, CheckOutcome, CheckRequest, Decision, Instruction, Shipment } from '@triad/core';

// The evidence file is what a release authorization signs and the escrow stores: canonical JSON hashed with SHA-256.
// Canonical means sorted object keys, no insignificant whitespace, and no undefined values, so anyone recomputes
// the same bytes from the same content. This module has no Node imports, so a browser can verify a file too.

export const EVIDENCE_FORMAT = 'triad-evidence-v1';

export interface EvidenceFile {
  format: typeof EVIDENCE_FORMAT;
  generatedAt: string;
  // States plainly what is synthetic: the scenario's parties, or nothing.
  provenance: { scenario: string | null; synthetic: string[]; network: 'testnet' };
  shipment: Shipment;
  instruction: Instruction;
  changeSet: ChangeSet;
  plan: CheckRequest[];
  outcomes: CheckOutcome[];
  decision: Decision;
  cost: { telegraphUusdc: string; purchases: number };
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Evidence cannot hold a non-finite number.');
    return JSON.stringify(value);
  }
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  throw new Error(`Evidence cannot hold a ${typeof value}.`);
}

// The same SHA-256 as evidenceHash, through Web Crypto, so a browser verifies a file without any Triad server.
export async function evidenceHashWeb(file: EvidenceFile): Promise<`0x${string}`> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(file)));
  return `0x${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

// Triad's issuer signs this message (EIP-191) for every evidence file it issues. The signature travels beside the file,
// never inside it, so the file's hash is the same signed or not.
export const attestationMessage = (hash: string) => `Triad evidence file\n${hash.toLowerCase()}`;
export interface Attestation { scheme: 'eip191'; signer: `0x${string}`; signature: `0x${string}` }

// Everything checkable without the hash: the format, and that every paid answer has a receipt and a signal hash.
export function contentProblems(file: EvidenceFile): string[] {
  const problems: string[] = [];
  if (file.format !== EVIDENCE_FORMAT) problems.push(`Unknown format ${String(file.format)}.`);
  for (const outcome of file.outcomes ?? []) {
    for (const source of outcome.sources) {
      if (source.kind === 'telegraph' && source.status !== 'unavailable' && (!source.purchase?.receiptHash || !source.purchase.signalHash)) {
        problems.push(`${outcome.checkId}: ${source.name}'s answer has no receipt or signal hash.`);
      }
      if (source.kind === 'official' && !source.snapshot?.sha256) problems.push(`${outcome.checkId}: the official list answer has no snapshot hash.`);
    }
  }
  return problems;
}
