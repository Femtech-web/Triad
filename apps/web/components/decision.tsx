'use client';
import type { EvidenceFile } from '@triad/evidence/canonical';
import { EFFECT_LABEL, EFFECT_TONE, money } from '@/lib/format';
import { headline, nextSteps } from '@/lib/plain';
import { NoteLine } from './note';
import { Verdict } from './verdict';
import s from './decision.module.css';

// One decision as the person acting on it needs it: the verdict, what it means, what to do, and why.
// `role` decides who answers the callback: the payer recording the call, or the viewer playing the contact.
export function Decision({ history, hash, onCallback, onRetry, onShare, permalink, busy, role = 'record', atStake, children }: {
  history: EvidenceFile[]; hash?: string; onCallback?: (outcome: 'confirmed' | 'denied') => void; onRetry?: () => void; onShare?: () => void; permalink?: string | null;
  busy?: boolean; role?: 'record' | 'play'; atStake?: { usd: number; paper: boolean } | null; children?: React.ReactNode;
}) {
  const evidence = history.at(-1)!;
  const d = evidence.decision;
  const before = history.length > 1 ? history.at(-2)!.decision.decision : null;
  const target = d.callback.target;
  const steps = nextSteps(evidence);
  const awaitingCall = d.needs.includes('callback') && target && onCallback;
  return (
    <div className={s.decision}>
      {hash && <NoteLine key={hash} verdict={d.decision} hash={hash} changes={evidence.changeSet.changes.map((c) => c.kind)} press />}
      <div className={s.verdictRow}>
        {before && <><Verdict verdict={before} className={s.before} /><span className={s.arrow} aria-hidden="true">→</span></>}
        <Verdict key={evidence.generatedAt} verdict={d.decision} size="lg" reveal />
      </div>
      <p className={s.headline}>{headline(evidence)}</p>

      {steps.length > 0 && (
        <div className={s.block}>
          <p className="label">What to do now</p>
          <ol className={s.steps}>{steps.map((t, i) => <li key={i}>{t}</li>)}</ol>
        </div>
      )}

      {awaitingCall && (
        <div className={s.call}>
          <div className={s.callTop}>
            <span className={s.phone} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6.6 3.5h2.6l1.4 4-2 1.4a11 11 0 0 0 6.5 6.5l1.4-2 4 1.4v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z" /></svg></span>
            <div>
              <p className={s.callWho}>{target.name}</p>
              <p className="mono muted">{target.address} · on record before this email</p>
            </div>
          </div>
          <p className={s.callAsk}>{role === 'play' ? `You are ${target.name}. Did you send this instruction?` : `What did ${target.name} say?`}</p>
          <div className={s.callButtons}>
            <button type="button" className="btn ok" disabled={busy} onClick={() => onCallback('confirmed')}>{role === 'play' ? 'Yes, we sent it' : 'They confirmed it'}</button>
            <button type="button" className="btn danger" disabled={busy} onClick={() => onCallback('denied')}>{role === 'play' ? 'No, we never sent this' : 'They didn’t send it'}</button>
          </div>
        </div>
      )}

      {d.hits.length > 0 && (
        <div className={s.block}>
          <p className="label">Why</p>
          <ul className={s.reasons}>
            {d.hits.slice(0, 5).map((h, i) => {
              const resolved = h.effect === 'hold_callback' && d.callback.accepted && d.callback.result?.outcome === 'confirmed';
              return <li key={i}><span className={`chip ${resolved ? 'clear' : EFFECT_TONE[h.effect]}`}>{resolved ? 'confirmed by call' : EFFECT_LABEL[h.effect]}</span><span>{h.text}</span></li>;
            })}
            {d.hits.length > 5 && <li className="muted">and {d.hits.length - 5} more in the note’s evidence</li>}
          </ul>
        </div>
      )}
      {d.needs.includes('evidence') && onRetry && (
        <div className={s.retry}>
          <p>Some checks had no usable answer, usually an outage or a rate limit. Triad can buy just those again; answers it already has are kept.</p>
          <button type="button" className="btn secondary sm" disabled={busy} onClick={onRetry}>Retry the missing checks</button>
        </div>
      )}

      <dl className={s.ledger}>
        <div><dt>Intelligence bought</dt><dd>{evidence.cost.purchases} check{evidence.cost.purchases === 1 ? '' : 's'} · {(Number(evidence.cost.telegraphUusdc) / 1e6).toFixed(2)} test USDC</dd></div>
        {atStake && atStake.usd > 0 && <div><dt>{atStake.paper ? 'At stake (paper)' : 'At stake'}</dt><dd>{money(atStake.usd)}</dd></div>}
        {atStake && atStake.usd > 0 && evidence.cost.purchases > 0 && <div><dt>Per $1m at stake</dt><dd>{(Number(evidence.cost.telegraphUusdc) / atStake.usd).toFixed(4)} USDC</dd></div>}
      </dl>
      {onShare && (
        <div className={s.share}>
          {permalink ? (
            <>
              <span>Shared at</span>
              <a className="mono" href={permalink} target="_blank" rel="noreferrer">{typeof window === 'undefined' ? permalink : `${window.location.host}${permalink}`}</a>
              <button type="button" className="btn ghost sm" onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}${permalink}`)}>Copy link</button>
            </>
          ) : (
            <>
              <span>Only the verdict, rules, cost and hash appear in the public ledger.</span>
              <button type="button" className="btn ghost sm" disabled={busy} onClick={onShare}>Share this decision</button>
            </>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
