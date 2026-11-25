'use client';
import { useState } from 'react';
import { evidenceHashWeb } from '@triad/evidence/canonical';
import type { EvidenceFile } from '@triad/evidence/canonical';
import { EvidenceView } from '@/components/evidence-view';
import s from './evidence.module.css';

// Any evidence file, including one downloaded from a live console run, checked entirely in this browser.
export function DropVerify() {
  const [loaded, setLoaded] = useState<{ evidence: EvidenceFile; hash: string; stated: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  async function read(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      if (file.size > 2_000_000) throw new Error('That file is larger than any evidence file.');
      const json = JSON.parse(await file.text()) as { evidence_sha256?: string; evidence?: EvidenceFile } & Partial<EvidenceFile>;
      const evidence = (json.evidence ?? json) as EvidenceFile;
      if (!evidence.decision || !evidence.outcomes) throw new Error('This is not a Triad evidence file.');
      setLoaded({ evidence, hash: json.evidence_sha256 ?? (await evidenceHashWeb(evidence)), stated: Boolean(json.evidence_sha256) });
    } catch (e) { setLoaded(null); setError((e as Error).message); }
  }

  return (
    <>
      <label className={`${s.dropZone} ${over ? s.over : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void read(e.dataTransfer.files[0]); }}>
        <input type="file" accept="application/json,.json" className={s.fileInput} onChange={(e) => void read(e.target.files?.[0])} />
        <span className={s.dropTitle}>Verify a file yourself</span>
        <span className={s.dropText}>Drop an evidence file here, or choose one: a download from the console, or any file in the repository. It is hashed in this browser and never uploaded.</span>
      </label>
      {error && <p className={s.dropError} role="alert">{error}</p>}
      {loaded && (
        <div className={s.dropped}>
          {!loaded.stated && <p className="muted">The file states no hash, so the one shown is the hash your browser computed.</p>}
          <EvidenceView evidence={loaded.evidence} hash={loaded.hash} />
        </div>
      )}
    </>
  );
}
