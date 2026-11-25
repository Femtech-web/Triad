import { RULES } from '@triad/core';
import type { CheckOutcome, CheckRequest, SourceAnswer } from '@triad/core';
import type { EvidenceFile } from '@triad/evidence/canonical';
import { checkTitle, EFFECT_LABEL, EFFECT_TONE, short, SOLANA_TX, STATUS_LABEL, statusTone, usdc } from '@/lib/format';
import { Stamp } from './stamp';
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
          <dt>Receipt</dt><dd className="mono" title={p.receiptHash ?? ''}>{p.receiptHash ? short(p.receiptHash, 14, 8) : 'none'}</dd>
          <dt>Signal</dt><dd className="mono" title={p.signalHash ?? ''}>{p.signalHash ? short(p.signalHash, 14, 8) : 'none'}</dd>
          {p.settlementTx && <><dt>Payment</dt><dd><a className="mono" href={SOLANA_TX(p.settlementTx)} target="_blank" rel="noreferrer">{short(p.settlementTx, 10, 6)}</a></dd></>}
        </dl>
      )}
      {source.snapshot && (
        <dl className={s.receipt}>
          <dt>Snapshot</dt><dd className="mono" title={source.snapshot.sha256}>{short(source.snapshot.sha256, 14, 8)}</dd>
          <dt>Retrieved</dt><dd className="mono">{source.snapshot.retrievedAt.slice(0, 16).replace('T', ' ')} UTC</dd>
        </dl>
      )}
    </li>
  );
}

function Check({ request, outcome }: { request: CheckRequest; outcome: CheckOutcome | undefined }) {
  return (
    <article className={`doc ${s.check}`}>
      <div className={`doc-head ${s.checkHead}`}>
        <span className={s.checkTitle}>{checkTitle(request.id)}</span>
        <span className={s.chips}>
          <span className="chip">{request.required ? 'required' : 'optional'}</span>
          {outcome && <span className={`chip ${statusTone(outcome.status)}`}>{STATUS_LABEL[outcome.status]}</span>}
        </span>
      </div>
      <div className="doc-body">
        <p className={s.purpose}>{request.purpose}</p>
        <p className={`mono muted ${s.intent}`}>{request.intent}</p>
        {outcome ? <ol className={s.sources}>{outcome.sources.map((src, i) => <Source key={i} source={src} />)}</ol> : <p className="muted">Not asked.</p>}
      </div>
    </article>
  );
}

function List({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return (
    <div className={`${s.list} ${s[tone]}`}>
      <h4>{title}</h4>
      {items.length ? <ul>{items.map((t, i) => <li key={i}>{t}</li>)}</ul> : <p className="muted">None.</p>}
    </div>
  );
}

export function EvidenceView({ evidence, hash, compact }: { evidence: EvidenceFile; hash: string; compact?: boolean }) {
  const { decision, plan, outcomes, instruction, changeSet, shipment } = evidence;
  const byId = new Map(outcomes.map((o) => [o.checkId, o]));
  const target = decision.callback.target;
  return (
    <div className={s.view}>
      {!compact && (
        <header className={s.head}>
          <div>
            <p className="kicker">Evidence file · {evidence.format}</p>
            <h1 className={s.title}>{evidence.provenance.scenario?.replace(/^console:/, 'Console run of ') ?? 'Decision'}</h1>
            <p className={`mono ${s.hash}`}>{hash}</p>
          </div>
          <Stamp verdict={decision.decision} big press />
        </header>
      )}

      <dl className={`fields ${s.meta}`}>
        <dt>Decided</dt><dd>{evidence.generatedAt.slice(0, 19).replace('T', ' ')} UTC under <span className="mono">{decision.policy}</span></dd>
        <dt>Shipment</dt><dd>{shipment.reference} · {shipment.commodity}, {shipment.quantity} · {shipment.seller.legalName}</dd>
        <dt>Instruction</dt><dd>{instruction.channel.displayName} &lt;{instruction.channel.from}&gt;{instruction.channel.replyTo ? `, reply-to ${instruction.channel.replyTo}` : ''}</dd>
        <dt>Sender</dt><dd>{changeSet.sender.domain?.reason ?? 'The record has no trusted domain'}</dd>
        <dt>Paid checks</dt><dd>{evidence.cost.purchases} purchases, {usdc(evidence.cost.telegraphUusdc)}</dd>
        <dt>Synthetic</dt><dd>{evidence.provenance.synthetic.join('; ') || 'nothing'}</dd>
      </dl>
      <VerifyBadge evidence={evidence} hash={hash} />

      <h3 className={s.h3}>Why {decision.decision}{decision.needs.length ? `, needing ${decision.needs.join(' and ')}` : ''}</h3>
      {decision.hits.length ? (
        <ol className={s.hits}>
          {decision.hits.map((h, i) => (
            <li key={i} className={s.hit}>
              <span className={`mono ${s.rule}`}>{h.rule}</span>
              <span className={`chip ${EFFECT_TONE[h.effect]}`}>{EFFECT_LABEL[h.effect]}</span>
              <span className={s.hitText}><span className={s.ruleName}>{RULES[h.rule]}.</span> {h.text}</span>
            </li>
          ))}
        </ol>
      ) : <p className={s.none}>No rule fired: nothing changed that needs a witness, and every required check came back clean.</p>}

      <div className={s.columns}>
        <List title="Facts" items={decision.facts} tone="factsTone" />
        <List title="Unknowns" items={decision.unknowns} tone="unknownsTone" />
      </div>

      <h3 className={s.h3}>The person</h3>
      <p className={s.person}>
        {target ? <>Out-of-band callback to <strong>{target.name}</strong> by {target.channel} at <span className="mono">{target.address}</span>. </> : decision.hits.some((h) => h.effect === 'hold_callback') ? 'No trusted channel outside the instruction’s own mailbox. ' : 'No callback needed. '}
        {decision.callback.result ? <>They <strong>{decision.callback.result.outcome}</strong> the change ({decision.callback.result.respondedAt.slice(0, 16).replace('T', ' ')} UTC){decision.callback.accepted ? '.' : ', but on a contact or channel the decision did not choose, so it was ignored.'}</> : target ? (decision.decision === 'BLOCK' ? 'A block is final, so the call is not placed.' : 'Not answered yet.') : ''}
      </p>

      <h3 className={s.h3}>What was bought, and from whom</h3>
      {plan.length ? <div className={s.checks}>{plan.map((r) => <Check key={r.id} request={r} outcome={byId.get(r.id)} />)}</div> : <p className={s.none}>Nothing changed, so nothing needed checking.</p>}
    </div>
  );
}
