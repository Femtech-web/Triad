import { readFile } from 'node:fs/promises';
import { createKeyPairSignerFromBytes } from '@solana/kit';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import { ExactSvmScheme } from '@x402/svm/exact/client';
import { recoverMessageAddress } from 'viem';
import { attestationMessage, contentProblems, evidenceHashWeb } from '@triad/evidence/canonical';
import type { Attestation, EvidenceFile } from '@triad/evidence/canonical';

// Triad's HTTP API for agents, with x402 payment when the free allowance runs out. Decisions are kept in memory by
// hash so the trusted contact's answer can be recorded against them later in the session.

export const ISSUER = '0xE107c20e529d13b8ac6E1Bad05224664dc912dCf';
const SOLANA_DEVNET = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
const DEVNET_USDC = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const MAX_PAYMENT_UUSDC = 100_000n;

export interface Issued { evidence: EvidenceFile; evidence_sha256: string; seal?: string; attestation?: Attestation | null }
export interface CheckAnswer extends Issued {
  decision: 'CLEAR' | 'HOLD' | 'BLOCK'; headline: string; nextSteps: string[]; needs: string[];
  rules: { rule: string; effect: string; text: string }[]; callbackTarget: { name: string; channel: string; address: string } | null;
  paidChecks: number; billing: Record<string, unknown>;
}

export interface TriadClientOptions { baseUrl: string; payerKeyFile?: string; rpcUrl?: string }

export function createTriadClient({ baseUrl, payerKeyFile, rpcUrl }: TriadClientOptions) {
  const decisions = new Map<string, Issued>();
  let payer: Promise<{ client: x402Client; http: x402HTTPClient }> | null = null;

  const loadPayer = () => {
    if (!payerKeyFile) return null;
    payer ??= (async () => {
      const bytes = JSON.parse(await readFile(payerKeyFile, 'utf8')) as number[];
      const signer = await createKeyPairSignerFromBytes(new Uint8Array(bytes));
      const client = x402Client.fromConfig({
        schemes: [{ network: SOLANA_DEVNET, client: new ExactSvmScheme(signer, rpcUrl ? { rpcUrl } : {}) }],
        spendControls: { allowedAssets: [{ network: SOLANA_DEVNET, asset: DEVNET_USDC, maxAmountPerPayment: MAX_PAYMENT_UUSDC.toString() }] },
      });
      return { client, http: new x402HTTPClient(client) };
    })();
    return payer;
  };

  async function post<T>(path: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; data: T; response: Response }> {
    const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() as T, response };
  }

  const remember = (issued: Issued) => { decisions.set(issued.evidence_sha256.toLowerCase(), issued); return issued; };
  const latest = (hash: string) => {
    const found = decisions.get(hash.toLowerCase());
    if (!found) throw new Error('No decision with that hash in this session. Run check_payment_change first.');
    return found;
  };

  return {
    async check(input: unknown): Promise<CheckAnswer> {
      let reply = await post<CheckAnswer & { error?: string }>('/api/v1/check', input);
      if (reply.status === 402) {
        const pay = loadPayer();
        if (!pay) throw new Error(`The free allowance is used and no payer is configured: ${(reply.data as { error?: string }).error ?? 'payment required'}. Set TRIAD_PAYER_KEYFILE to a Solana devnet keypair holding devnet USDC.`);
        const { client, http } = await pay;
        const required = JSON.parse(Buffer.from(reply.response.headers.get('payment-required') ?? '', 'base64').toString('utf8')) as Parameters<typeof client.createPaymentPayload>[0];
        const payload = await client.createPaymentPayload(required);
        reply = await post<CheckAnswer & { error?: string }>('/api/v1/check', input, http.encodePaymentSignatureHeader(payload));
      }
      if (reply.status >= 400) throw new Error(reply.data.error ?? `Triad answered HTTP ${reply.status}.`);
      remember(reply.data);
      return reply.data;
    },

    async recordCallback(hash: string, outcome: 'confirmed' | 'denied'): Promise<Issued> {
      const reply = await post<Issued & { error?: string }>('/api/callback', { ...latest(hash), outcome });
      if (reply.status >= 400) throw new Error(reply.data.error ?? `Triad answered HTTP ${reply.status}.`);
      return remember(reply.data);
    },

    async share(hash: string): Promise<string> {
      const reply = await post<{ permalink?: string; error?: string }>('/api/share', latest(hash));
      if (reply.status >= 400 || !reply.data.permalink) throw new Error(reply.data.error ?? `Triad answered HTTP ${reply.status}.`);
      return `${baseUrl}${reply.data.permalink}`;
    },
  };
}

// Checks an evidence file without trusting Triad: the canonical hash, the receipts, and who signed it.
export async function verifyEvidenceFile(file: { evidence_sha256?: string; evidence?: EvidenceFile; attestation?: Attestation | null }) {
  if (!file.evidence) throw new Error('This is not a Triad evidence file.');
  const hash = await evidenceHashWeb(file.evidence);
  const problems = contentProblems(file.evidence);
  let signedBy: string | null = null;
  if (file.attestation) {
    try { signedBy = await recoverMessageAddress({ message: attestationMessage(hash), signature: file.attestation.signature }); } catch { signedBy = null; }
  }
  return {
    hash, hashMatches: !file.evidence_sha256 || file.evidence_sha256.toLowerCase() === hash, problems,
    signedByTriad: signedBy?.toLowerCase() === ISSUER.toLowerCase(), signedBy, decision: file.evidence.decision.decision,
  };
}
