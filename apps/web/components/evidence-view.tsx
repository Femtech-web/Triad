import { RULES } from '@triad/core';
import type { CheckOutcome, CheckRequest, SourceAnswer } from '@triad/core';
import type { EvidenceFile } from '@triad/evidence/canonical';
import { checkTitle, EFFECT_LABEL, EFFECT_TONE, short, SOLANA_TX, STATUS_LABEL, statusTone, usdc } from '@/lib/format';
import { Verdict } from './verdict';
import { VerifyBadge } from './verify-badge';
import s from './evidence.module.css';

function Source({ source }: { source: SourceAnswer }) {
  const p = source.purchase;
  return (
    <li className={s.source}>
      <div className={s.sourceHead}>
        <span className={s.sourceName}>{source.kind === 'official' ? 'OFAC SDN list' : source.name}</span>
        <span className={`chip ${statusTone(source.status)}`}>{STATUS_LABEL[source.status]}</span>
      </div>
      <p className={s.detail}>{source.detail}</p>
      {p && (
        <dl className={s.receipt}>
          <dt>Paid</dt><dd>{usdc(p.amountUusdc)} · {p.rail === 'sepolia-escrow' ? 'Sepolia escrow' : p.rail === 'solana-x402' ? 'Solana x402' : 'Base x402'} · {(p.latencyMs / 1000).toFixed(1)} s</dd>
          {p.minerId && <><dt>Miner</dt><dd className="mono">{p.minerId}</dd></>}
          <dt>Receipt</dt><dd className="mono" title={p.receiptHash ?? ''}>{p.receiptHash ? short(p.receiptHash, 12, 8) : 'none'}</dd>
          <dt>Signal</dt><dd className="mono" title={p.signalHash ?? ''}>{p.signalHash ? short(p.signalHash, 12, 8) : 'none'}</dd>
          {p.settlementTx && <><dt>Payment</dt><dd><a className="mono" href={SOLANA_TX(p.settlementTx)} target="_blank" rel="noreferrer">{short(p.settlementTx, 10, 6)}</a></dd></>}
        </dl>
      )}
      {source.snapshot && (
        <dl className={s.receipt}>
          <dt>Snapshot</dt><dd className="mono" title={source.snapshot.sha256}>{short(source.snapshot.sha256, 12, 8)}</dd>
          <dt>Retrieved</dt><dd className="mono">{source.snapshot.retrievedAt.slice(0, 16).replace('T', ' ')} UTC</dd>
        </dl>
      )}
    </li>
  );
}

function Check({ request, outcome }: { request: CheckRequest; outcome: CheckOutcome | undefined }) {
  return (
    <article className={s.check}>
      <div className={s.checkHead}>
        <div>
          <p className={s.checkTitle}>{checkTitle(request.id)}</p>
          <p className={`mono ${s.intent}`}>{request.intent}</p>
        </div>
        <span className={s.chips}>
          <span className="chip">{request.required ? 'required' : 'optional'}</span>
          {outcome && <span className={`chip ${statusTone(outcome.status)}`}>{STATUS_LABEL[outcome.status]}</span>}
        </span>
      </div>
      <p className={s.purpose}>{request.purpose}</p>
      {outcome ? <ol className={s.sources}>{outcome.sources.map((src, i) => <Source key={i} source={src} />)}</ol> : <p className="muted">Not asked.</p>}
    </article>
  );
}

export function EvidenceView({ evidence, hash, compact }: { evidence: EvidenceFile; hash: string; compact?: boolean }) {
  const { decision, plan, outcomes, instruction, changeSet, shipment } = evidence;
  const byId = new Map(outcomes.map((o) => [o.checkId, o]));
  const target = decision.callback.target;
  const scenario = evidence.provenance.scenario;
  return (
    <div className={s.view}>
      {!compact && (
        <header className={s.head}>
          <div className={s.headText}>
            <p className="label">Evidence file · {evidence.format}</p>
            <h1 className={s.title}>{scenario === 'check' ? 'A payment check' : scenario?.replace(/^console:/, 'Attack lab: ') ?? 'Decision'}</h1>
            <p className={`mono ${s.hash}`}>{hash}</p>
          </div>
          <Verdict verdict={decision.decision} size="lg" reveal />
        </header>
      )}

      <VerifyBadge evidence={evidence} hash={hash} />

      <dl className={`fields ${s.meta}`}>
        <dt>Decided</dt><dd>{evidence.generatedAt.slice(0, 19).replace('T', ' ')} UTC under <span className="mono">{decision.policy}</span></dd>
        <dt>Pays</dt><dd>{shipment.seller.legalName} · {shipment.reference}{shipment.commodity !== 'Goods or services' ? ` · ${shipment.commodity}, ${shipment.quantity}` : ''}</dd>
        <dt>Instruction</dt><dd>{instruction.channel.displayName} <span className="mono muted">&lt;{instruction.channel.from}&gt;</span>{instruction.channel.replyTo ? <>, reply-to <span className="mono muted">{instruction.channel.replyTo}</span></> : null}</dd>
        <dt>Sender</dt><dd>{changeSet.sender.domain?.reason ?? 'The record has no trusted domain'}</dd>
        <dt>Paid checks</dt><dd>{evidence.cost.purchases} purchases, {usdc(evidence.cost.telegraphUusdc)}</dd>
        <dt>Synthetic</dt><dd className="muted">{evidence.provenance.synthetic.join('; ') || 'nothing'}</dd>
      </dl>

      <section className={s.section}>
        <h3 className="h3">Why {decision.decision}{decision.needs.length ? `, needing ${decision.needs.join(' and ')}` : ''}</h3>
        {decision.hits.length ? (
          <ol className={s.hits}>
            {decision.hits.map((h, i) => (
              <li key={i} className={s.hit}>
                <span className={`mono ${s.rule}`}>{h.rule}</span>
                {h.effect === 'hold_callback' && decision.callback.accepted && decision.callback.result?.outcome === 'confirmed'
                  ? <span className="chip clear">confirmed by call</span> : <span className={`chip ${EFFECT_TONE[h.effect]}`}>{EFFECT_LABEL[h.effect]}</span>}
                <span className={s.hitText}><b>{RULES[h.rule]}.</b> {h.text}</span>
              </li>
            ))}
          </ol>
        ) : <p className={s.none}>No rule fired: nothing changed that needs a witness, and every required check came back clean.</p>}
      </section>

      <div className={s.columns}>
        <div className={`${s.list} ${s.facts}`}><p className="label">Facts</p>{decision.facts.length ? <ul>{decision.facts.map((t, i) => <li key={i}>{t}</li>)}</ul> : <p className="muted">None.</p>}</div>
        <div className={`${s.list} ${s.unknowns}`}><p className="label">Unknowns</p>{decision.unknowns.length ? <ul>{decision.unknowns.map((t, i) => <li key={i}>{t}</li>)}</ul> : <p className="muted">None.</p>}</div>
      </div>

      <section className={s.section}>
        <h3 className="h3">The person</h3>
        <p className={s.none}>
          {target ? <>Out-of-band callback to <b>{target.name}</b> by {target.channel} at <span className="mono">{target.address}</span>. </> : decision.hits.some((h) => h.effect === 'hold_callback') ? 'No trusted channel outside the instruction’s own mailbox. ' : 'No callback needed. '}
          {decision.callback.result ? <>They <b>{decision.callback.result.outcome}</b> the change ({decision.callback.result.respondedAt.slice(0, 16).replace('T', ' ')} UTC){decision.callback.accepted ? '.' : ', but on a contact or channel the decision did not choose, so it was ignored.'}</> : target ? (decision.decision === 'BLOCK' ? 'A block is final, so the call is not placed.' : 'Not answered yet.') : ''}
        </p>
      </section>

      <section className={s.section}>
        <h3 className="h3">What was bought, and from whom</h3>
        {plan.length ? <div className={s.checks}>{plan.map((r) => <Check key={r.id} request={r} outcome={byId.get(r.id)} />)}</div>
          : <p className={s.none}>{decision.decision === 'BLOCK' ? 'Nothing: the email alone was enough to block it.' : 'Nothing changed, so nothing needed checking.'}</p>}
      </section>
    </div>
  );
}
