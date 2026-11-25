import Link from 'next/link';
import { gatesOfRules, NOTE, noteSerial } from '@/lib/gates';
import { readLedger } from '@/lib/server/ledger';
import { Stamp } from './note';
import s from '@/app/landing.module.css';

const SURFACE: Record<string, string> = { check: 'Check', lab: 'Attack lab' };
const MOVING_FROM = 6;

// The latest decisions from the public ledger, as a strip under the hero. It moves only when there are enough entries
// to fill it without repeating; it pauses on hover, and holds still for reduced motion.
export async function LedgerTape() {
  const ledger = await readLedger();
  const entries = ledger.recent.slice(0, 24);
  if (!entries.length) return null;
  const moving = entries.length >= MOVING_FROM;
  const items = entries.map((e) => {
    const gate = gatesOfRules(e.rules)[0];
    return (
      <li key={`${e.at}-${e.hash}`} className={s.tapeItem}>
        <span className="mono muted">{e.at.slice(5, 16).replace('T', ' ')}</span>
        <Stamp verdict={e.decision} />
        <span>{gate ? `${gate.id} ${gate.name}` : NOTE[e.decision].kind}</span>
        <span className="muted">{SURFACE[e.surface] ?? e.surface} · {e.step === 'callback' ? 'after the call' : e.purchases ? `${e.purchases} paid · ${(Number(e.costUusdc) / 1e6).toFixed(2)} USDC` : 'nothing bought'}</span>
        <span className="mono">{noteSerial(e.hash)}</span>
      </li>
    );
  });
  return (
    <div className={s.tapeWrap}>
      <Link href="/ledger" className={s.tapeLabel}><span className={s.liveDot} aria-hidden="true" />Live from the ledger<span className="muted"> · {ledger.stats.decisions} decisions</span></Link>
      <div className={`${s.tape}${moving ? ` ${s.moving}` : ''}`}>
        <ul className={s.tapeTrack} style={moving ? { animationDuration: `${entries.length * 6}s` } : undefined}>
          {items}
          {moving && items.map((item) => <li key={`again-${item.key}`} className={s.tapeItem} aria-hidden="true">{item.props.children}</li>)}
        </ul>
      </div>
    </div>
  );
}
