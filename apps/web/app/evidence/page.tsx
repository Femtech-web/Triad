import type { Metadata } from 'next';
import Link from 'next/link';
import { Verdict } from '@/components/verdict';
import { decisions, releases } from '@/lib/data';
import { short, usdc } from '@/lib/format';
import { DropVerify } from './drop-verify';
import s from './evidence.module.css';

export const metadata: Metadata = { title: 'Evidence · Triad' };

export default function EvidenceIndex() {
  const all = decisions().sort((a, b) => b.evidence.generatedAt.localeCompare(a.evidence.generatedAt));
  const released = new Map(releases().map((r) => [r.authorization.evidenceHash.toLowerCase(), r]));
  return (
    <>
      <section className={`wrap ${s.intro}`}>
        <p className="label rise">Evidence</p>
        <h1 className={`display rise d1 ${s.headline}`}>Every decision ships with its evidence file.</h1>
        <p className="lede rise d2">The record, the instruction, every check bought with its Telegraph receipt, the OFAC snapshot it was screened against, and the rules that fired. It is canonical JSON, so its SHA-256 is the same wherever it is computed. A release signature names that hash, and the escrow stores it.</p>
      </section>

      <section className={`wrap rise d3 ${s.drop}`}>
        <DropVerify />
      </section>

      <section className={`wrap ${s.table}`}>
        <div className={s.tableHead}>
          <h2 className="h2">On record</h2>
          <span className="muted">{all.length} files</span>
        </div>
        {all.length ? (
          <div className={`card ${s.scroll}`}>
            <table>
              <thead><tr><th>Decided (UTC)</th><th>Case</th><th>Decision</th><th>Paid checks</th><th>Evidence</th><th>Released</th></tr></thead>
              <tbody>
                {all.map((d) => {
                  const release = released.get(d.evidence_sha256.toLowerCase());
                  return (
                    <tr key={d.file}>
                      <td className="mono">{d.evidence.generatedAt.slice(0, 16).replace('T', ' ')}</td>
                      <td>{d.evidence.provenance.scenario}</td>
                      <td><Verdict verdict={d.evidence.decision.decision} /></td>
                      <td>{d.evidence.cost.purchases} <span className="muted">· {usdc(d.evidence.cost.telegraphUusdc)}</span></td>
                      <td><Link className="mono" href={`/evidence/${d.evidence_sha256}`}>{short(d.evidence_sha256)}</Link></td>
                      <td>{release ? <a className="mono" href={release.explorer} target="_blank" rel="noreferrer">{short(release.transaction, 8, 4)}</a> : <span className="muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">No decisions recorded yet.</p>}
      </section>
    </>
  );
}
