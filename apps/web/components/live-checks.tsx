'use client';
import type { CheckOutcome, CheckRequest } from '@triad/core';
import { checkTitle, STATUS_LABEL, statusTone } from '@/lib/format';
import s from './live-checks.module.css';

// The checks being bought, filling in as each one's answers land: who answered, what they said, and the receipt.
export function LiveChecks({ plan, outcomes, elapsed }: { plan: CheckRequest[]; outcomes: Map<string, CheckOutcome>; elapsed: number }) {
  const done = plan.filter((c) => outcomes.has(c.id)).length;
  return (
    <div className={s.live}>
      <div className={s.head}>
        <p className="label">Buying through Telegraph</p>
        <span className="mono muted">{done}/{plan.length} · {elapsed.toFixed(0)} s</span>
      </div>
      <div className={s.track}><span style={{ width: `${plan.length ? (done / plan.length) * 100 : 0}%` }} /></div>
      <ul className={s.rows}>
        {plan.map((c) => {
          const o = outcomes.get(c.id);
          return (
            <li key={c.id} className={o ? s.landed : ''}>
              <div className={s.rowTop}>
                {o ? <span className={`chip ${statusTone(o.status)}`}>{STATUS_LABEL[o.status]}</span> : <span className={s.spinner} aria-hidden="true" />}
                <span className={s.title}>{checkTitle(c.id)}</span>
                <span className="muted">{c.required ? 'two sources' : 'one source'}</span>
              </div>
              {o && (
                <ul className={s.sources}>
                  {o.sources.map((src, i) => (
                    <li key={i}>
                      <span className={s.dot} data-tone={statusTone(src.status)} />
                      <span className={s.src}>{src.kind === 'official' ? 'OFAC SDN list' : src.name}</span>
                      <span className={s.detail}>{src.detail}</span>
                      {src.purchase && <span className="mono muted">paid {(Number(src.purchase.amountUusdc) / 1e6).toFixed(2)} · {src.purchase.rail === 'sepolia-escrow' ? 'escrow' : 'x402'}{src.purchase.receiptHash ? ` · ${src.purchase.receiptHash.slice(0, 10)}…` : ''}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
