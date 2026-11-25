'use client';
import { useEffect, useState } from 'react';
import { contentProblems, evidenceHashWeb } from '@triad/evidence/canonical';
import type { EvidenceFile } from '@triad/evidence/canonical';
import s from './evidence.module.css';

// Recomputes the hash here, in the reader's browser, from the canonical bytes: no Triad server is trusted for it.
export function VerifyBadge({ evidence, hash }: { evidence: EvidenceFile; hash: string }) {
  const [result, setResult] = useState<{ hash: string; problems: string[] } | null>(null);
  useEffect(() => {
    let live = true;
    void evidenceHashWeb(evidence).then((computed) => { if (live) setResult({ hash: computed, problems: contentProblems(evidence) }); });
    return () => { live = false; };
  }, [evidence]);
  if (!result) return <p className={s.verify}>Recomputing the SHA-256 in your browser…</p>;
  const matches = result.hash === hash.toLowerCase();
  const ok = matches && result.problems.length === 0;
  return (
    <div className={`${s.verify} ${ok ? s.verified : s.failed}`} role="status">
      <span className={s.verifyMark} aria-hidden="true">{ok ? '✓' : '✕'}</span>
      <span>
        {matches ? 'Verified in your browser: the canonical bytes hash to the stated SHA-256' : `Mismatch: your browser computed ${result.hash}`}
        {result.problems.length ? `; ${result.problems.join(' ')}` : matches ? ', and every paid answer carries a receipt and a signal hash.' : '.'}
      </span>
    </div>
  );
}
