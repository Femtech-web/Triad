'use client';
import { useEffect, useState } from 'react';
import { recoverMessageAddress } from 'viem';
import { attestationMessage, contentProblems, evidenceHashWeb } from '@triad/evidence/canonical';
import type { Attestation, EvidenceFile } from '@triad/evidence/canonical';
import s from './evidence.module.css';

type Signed = 'signed' | 'wrong-signer' | 'bad' | 'unsigned';

// Recomputes the hash here, in the reader's browser, from the canonical bytes, and recovers who signed it: no Triad
// server is trusted for either.
export function VerifyBadge({ evidence, hash, attestation, issuer }: { evidence: EvidenceFile; hash: string; attestation?: Attestation | null; issuer?: string | null }) {
  const [result, setResult] = useState<{ hash: string; problems: string[]; signed: Signed; signer: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      const computed = await evidenceHashWeb(evidence);
      let signed: Signed = 'unsigned';
      let signer: string | null = null;
      if (attestation) {
        try {
          signer = await recoverMessageAddress({ message: attestationMessage(computed), signature: attestation.signature });
          signed = signer.toLowerCase() !== attestation.signer.toLowerCase() ? 'bad' : issuer && signer.toLowerCase() !== issuer.toLowerCase() ? 'wrong-signer' : 'signed';
        } catch { signed = 'bad'; }
      }
      if (live) setResult({ hash: computed, problems: contentProblems(evidence), signed, signer });
    })();
    return () => { live = false; };
  }, [evidence, attestation, issuer]);
  if (!result) return <p className={s.verify}>Recomputing the SHA-256 in your browser…</p>;
  const matches = result.hash === hash.toLowerCase();
  const ok = matches && result.problems.length === 0 && result.signed !== 'bad' && result.signed !== 'wrong-signer';
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  return (
    <div className={`${s.verify} ${ok ? s.verified : s.failed}`} role="status">
      <span className={s.verifyMark} aria-hidden="true"><span>{ok ? '✓' : '✕'}</span></span>
      <span>
        {matches ? 'Verified in your browser: the canonical bytes hash to the stated SHA-256' : `Mismatch: your browser computed ${result.hash}`}
        {result.problems.length ? `; ${result.problems.join(' ')}` : matches ? ', every paid answer carries a receipt and a signal hash' : ''}
        {result.signed === 'signed' && result.signer ? <>, and the hash is signed by Triad’s issuer <span className="mono">{short(result.signer)}</span>.</>
          : result.signed === 'wrong-signer' ? <>; the signature is valid but from <span className="mono">{short(result.signer!)}</span>, not Triad’s issuer.</>
            : result.signed === 'bad' ? '; the signature does not match this file.'
              : '. This file carries no issuer signature.'}
      </span>
    </div>
  );
}
