import Link from 'next/link';
import { gatesOfRules, NOTE, noteSerial } from '@/lib/gates';
import { readLedger } from '@/lib/server/ledger';
import { Stamp } from './note';
import s from '@/app/landing.module.css';

const SURFACE: Record<string, string> = { check: 'Check', lab: 'Attack lab' };
const SHOWN = 5;

// The latest decisions from the public ledger, under the hero, with the way to the full list.
export async function LedgerRecent() {
  const ledger = await readLedger();
  const entries = ledger.recent.slice(0, SHOWN);
  if (!entries.length) return null;
  return (
    <div className={`card ${s.recent}`}>
      <div className={s.recentHead}>
        <p className={s.recentTitle}><span className={s.liveDot} aria-hidden="true" />Live from the ledger</p>
        <span className="muted">{ledger.stats.decisions} decisions · {ledger.stats.paidAnswers} checks bought on Telegraph</span>
      </div>
      <ol className={s.recentList}>
        {entries.map((e) => {
          const gate = gatesOfRules(e.rules)[0];
          return (
            <li key={`${e.at}-${e.hash}`}>
              <span className="mono muted">{e.at.slice(5, 16).replace('T', ' ')}</span>
              <Stamp verdict={e.decision} />
              <span className={s.recentWhat}>{gate ? `${gate.id} ${gate.name}` : NOTE[e.decision].kind}</span>
              <span className="muted">{SURFACE[e.surface] ?? e.surface} · {e.step === 'callback' ? 'after the call' : e.purchases ? `${e.purchases} paid · ${(Number(e.costUusdc) / 1e6).toFixed(2)} USDC` : 'nothing bought'}</span>
              <span className={`mono ${s.recentSerial}`}>{noteSerial(e.hash)}</span>
            </li>
          );
        })}
      </ol>
      <Link className="btn secondary sm" href="/ledger">Open the full ledger <span className="arrow" aria-hidden="true">→</span></Link>
    </div>
  );
}
