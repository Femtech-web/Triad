'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { decide, detectChanges, instructionSchema, planChecks, RULES } from '@triad/core';
import type { Instruction, Party, Shipment } from '@triad/core';
import type { EvidenceFile } from '@triad/evidence/canonical';
import { EvidenceView } from '@/components/evidence-view';
import { Stamp } from '@/components/stamp';
import type { ConsoleCase } from '@/lib/cases';
import { CATEGORY_LABEL, checkTitle, EFFECT_LABEL, EFFECT_TONE, RELATION_LABEL, short, usdc } from '@/lib/format';
import { MOVES } from '@/lib/moves';
import s from './console.module.css';

interface Issued { evidence: EvidenceFile; evidence_sha256: string; seal?: string }
interface Release { escrow: string; fundTx: string | null; releaseTx: string; explorer: string; payee: string; amount: string; signer: string }
interface Run { mode: 'live' | 'replay'; steps: Issued[]; release: Release | null; draftKey: string }
type Busy = { kind: 'live' | 'replay' | 'callback' | 'release'; started: number } | null;

const PRICE_UUSDC = 10_000;
const keyOf = (i: Instruction) => JSON.stringify(i);
const without = <T extends object>(o: T, key: keyof T): T => { const next = { ...o }; delete next[key]; return next; };
const agreed = (e: EvidenceFile) => {
  const witnesses = [e.plan.length ? 'the paid checks' : null, e.decision.callback.accepted ? 'the trusted contact' : null].filter(Boolean);
  return witnesses.length ? `The record, ${witnesses.join(' and ')} agree.` : 'Nothing changed from the record.';
};
const caseTitle = (c: ConsoleCase) => `${CATEGORY_LABEL[c.category] ?? c.category} · ${c.shipment.seller.legalName}`;

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

function useElapsed(busy: Busy): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!busy) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [busy]);
  return busy ? Math.max(0, (now - busy.started) / 1000) : 0;
}

/* ---------- Case picker ---------- */

function CasePicker({ cases, current, onPick }: { cases: ConsoleCase[]; current: ConsoleCase; onPick: (name: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const groups: [string, ConsoleCase[]][] = [
    ['On the record', cases.filter((c) => c.group === 'showcase')],
    ['Attacks', cases.filter((c) => c.group === 'attack')],
    ['Legitimate changes', cases.filter((c) => c.group === 'legitimate')],
  ];
  return (
    <div className={`doc ${s.caseBar}`}>
      <div className={s.caseNow}>
        <span className="kicker">{current.group === 'showcase' ? 'On the record' : current.group === 'attack' ? 'Attack' : 'Legitimate change'} · {current.name}</span>
        <h2 className={s.caseTitle}>{caseTitle(current)}</h2>
        <p className={s.caseDesc}>{current.description}</p>
      </div>
      <div className={s.caseSide}>
        {current.expected && <span className={s.expected}>Benchmark expects <Stamp verdict={current.expected} className={s.miniStamp} /></span>}
        <button type="button" className="btn ghost" onClick={() => dialog.current?.showModal()}>Choose a case ({cases.length})</button>
      </div>
      <dialog ref={dialog} className={s.dialog} onClick={(e) => { if (e.target === dialog.current) dialog.current?.close(); }}>
        <div className={s.dialogInner}>
          <div className={s.dialogHead}>
            <h2 className="section">Choose a case</h2>
            <button type="button" className="btn ghost" onClick={() => dialog.current?.close()}>Close</button>
          </div>
          <p className={s.dialogNote}>Forty frozen benchmark cases, and the showcase runs with paid evidence on record. Every one starts from a trusted record; you can rewrite the email once it is open.</p>
          {groups.map(([title, list]) => list.length > 0 && (
            <section key={title} className={s.group}>
              <h3 className="kicker">{title} ({list.length})</h3>
              <ul className={s.caseList}>
                {list.map((c) => (
                  <li key={c.name}>
                    <button type="button" className={`${s.caseItem} ${c.name === current.name ? s.caseActive : ''}`} onClick={() => { onPick(c.name); dialog.current?.close(); }}>
                      <span className={s.caseItemTitle}>{caseTitle(c)}</span>
                      <span className={s.caseItemDesc}>{c.description}</span>
                      <span className={s.caseItemMeta}>
                        {c.expected && <span className={`chip ${c.expected.toLowerCase()}`}>expects {c.expected}</span>}
                        {c.recorded ? <span className="chip">recorded run</span> : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </dialog>
    </div>
  );
}

/* ---------- The trusted record ---------- */

function Record({ shipment }: { shipment: Shipment }) {
  const authorized = shipment.seller.contacts.filter((c) => shipment.authorizedContactIds.includes(c.id));
  return (
    <details className={`doc ${s.record}`} open>
      <summary className="doc-head"><span className="doc-title">The record</span><span className="kicker">trusted before the email arrived</span></summary>
      <div className="doc-body">
        <dl className="fields">
          <dt>Shipment</dt><dd>{shipment.reference} · {shipment.commodity}, {shipment.quantity} · {shipment.loadPort} → {shipment.dischargePort}</dd>
          <dt>Seller</dt><dd>{shipment.seller.legalName} ({shipment.seller.country}){shipment.seller.registrationId && <span className="mono muted"> LEI {shipment.seller.registrationId}</span>}</dd>
          <dt>Trusted domain</dt><dd className="mono">{shipment.seller.domain ?? 'none'}</dd>
          <dt>May instruct</dt><dd>{authorized.map((c) => <span key={c.id} className={s.contact}>{c.name} <span className="mono muted">{c.email}{c.phone ? ` · ${c.phone}` : ''}</span></span>)}</dd>
          <dt>Pays</dt><dd>{shipment.payout.holderName} <span className="mono muted">{short(shipment.payout.address, 8, 6)}{shipment.payout.bankRef ? ` · ${shipment.payout.bankRef}` : ''}</span></dd>
          <dt>Consignee</dt><dd>{shipment.consignee.legalName} ({shipment.consignee.country})</dd>
          {shipment.pickupParty && <><dt>Pickup agent</dt><dd>{shipment.pickupParty.legalName} ({shipment.pickupParty.country})</dd></>}
          <dt>Vessel</dt><dd>{shipment.vessel.name} <span className="mono muted">{shipment.vessel.imo}</span></dd>
        </dl>
      </div>
    </details>
  );
}

/* ---------- The instruction editor ---------- */

type ChangeKey = 'payout' | 'pickupParty' | 'consignee' | 'vessel';

function Field({ label, value, onChange, mono, placeholder, invalid }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean; placeholder?: string; invalid?: string | null }) {
  return (
    <label className={s.field}>
      <span className={s.fieldLabel}>{label}</span>
      <input className={`${s.input} ${mono ? s.monoInput : ''} ${invalid ? s.invalid : ''}`} value={value} placeholder={placeholder} spellCheck={false} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(invalid)} />
      {invalid && <span className={s.fieldError}>{invalid}</span>}
    </label>
  );
}

function Editor({ shipment, draft, setDraft, original }: { shipment: Shipment; draft: Instruction; setDraft: (i: Instruction) => void; original: Instruction }) {
  const set = (patch: Partial<Instruction>) => setDraft({ ...draft, ...patch });
  const channel = (patch: Partial<Instruction['channel']>) => {
    const next = { ...draft.channel, ...patch };
    set({ channel: next.replyTo ? next : without(next, 'replyTo') });
  };
  const changes = (key: ChangeKey, value: unknown) => {
    const next = { ...draft.changes } as Record<string, unknown>;
    if (value === undefined) delete next[key]; else next[key] = value;
    set({ changes: next as Instruction['changes'] });
  };
  const party = (key: 'pickupParty' | 'consignee', next: Party) => changes(key, next);
  const toggles: { key: ChangeKey; label: string; start: () => unknown }[] = [
    { key: 'payout', label: 'Bank account', start: () => ({ ...shipment.payout }) },
    { key: 'pickupParty', label: 'Pickup agent', start: () => ({ id: 'pickup-new', legalName: '', country: '', contacts: [] }) },
    { key: 'consignee', label: 'Consignee', start: () => ({ id: 'consignee-new', legalName: '', country: '', contacts: [] }) },
    { key: 'vessel', label: 'Vessel', start: () => ({ ...shipment.vessel }) },
  ];
  const evm = shipment.payout.rail === 'sepolia';
  const payout = draft.changes.payout;
  const addressProblem = payout && (evm ? !/^0x[0-9a-fA-F]{40}$/.test(payout.address) : !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(payout.address)) ? `Not a ${evm ? 'Sepolia' : 'Solana'} address` : null;

  return (
    <div className={`doc ${s.email}`}>
      <div className="doc-head"><span className="doc-title">The incoming instruction</span><span className="mono muted">{draft.receivedAt.slice(11, 16)} UTC</span></div>
      <div className="doc-body">
        <div className={s.moves} role="group" aria-label="Attacker's moves">
          <span className={s.movesLabel}>Attacker’s moves</span>
          {MOVES.map((m) => <button key={m.id} type="button" className={s.move} title={m.hint} onClick={() => setDraft(m.apply(shipment, draft))}>{m.label}</button>)}
          <button type="button" className={`${s.move} ${s.reset}`} onClick={() => setDraft(original)} disabled={keyOf(draft) === keyOf(original)}>Reset</button>
        </div>
        <div className={s.headers}>
          <Field label="From (name)" value={draft.channel.displayName} onChange={(v) => channel({ displayName: v })} />
          <Field label="From (address)" value={draft.channel.from} onChange={(v) => channel({ from: v })} mono />
          <Field label="Reply-To" value={draft.channel.replyTo ?? ''} onChange={(v) => channel({ replyTo: v })} mono placeholder="none" />
        </div>
        <label className={s.field}>
          <span className={s.fieldLabel}>Message</span>
          <textarea className={s.body} value={draft.summary} rows={3} onChange={(e) => set({ summary: e.target.value })} />
        </label>

        <div className={s.changesHead}>
          <span className="kicker">What it asks to change</span>
          <span className={s.toggles}>
            {toggles.map((t) => {
              const on = draft.changes[t.key] !== undefined;
              return <button key={t.key} type="button" className={`${s.toggle} ${on ? s.toggleOn : ''}`} aria-pressed={on} onClick={() => changes(t.key, on ? undefined : t.start())}>{on ? '− ' : '+ '}{t.label}</button>;
            })}
          </span>
        </div>
        {!Object.keys(draft.changes).length && <p className={s.noChange}>Nothing: this instruction only asks to settle as agreed.</p>}
        {payout && (
          <fieldset className={s.change}>
            <legend>New bank account</legend>
            <Field label="Account holder" value={payout.holderName} onChange={(v) => changes('payout', { ...payout, holderName: v })} />
            <Field label={evm ? 'Sepolia address' : 'Solana address'} value={payout.address} onChange={(v) => changes('payout', { ...payout, address: v.trim() })} mono invalid={addressProblem} />
            <Field label="Bank reference" value={payout.bankRef ?? ''} onChange={(v) => changes('payout', v ? { ...payout, bankRef: v } : without(payout, 'bankRef'))} mono />
            <p className={s.tip}>Put your own {evm ? 'Sepolia' : 'Solana devnet'} address here. If you get it past Triad, a live run’s escrow pays it.</p>
          </fieldset>
        )}
        {(['pickupParty', 'consignee'] as const).map((key) => {
          const p = draft.changes[key];
          return p && (
            <fieldset key={key} className={s.change}>
              <legend>{key === 'pickupParty' ? 'New pickup agent' : 'New consignee'}</legend>
              <Field label="Legal name" value={p.legalName} onChange={(v) => party(key, { ...p, legalName: v })} />
              <Field label="Country (ISO)" value={p.country} onChange={(v) => party(key, { ...p, country: v.toUpperCase().slice(0, 2) })} mono />
              <Field label="Registration ID" value={p.registrationId ?? ''} onChange={(v) => party(key, v ? { ...p, registrationId: v } : without(p, 'registrationId'))} mono placeholder="optional" />
            </fieldset>
          );
        })}
        {draft.changes.vessel && (
          <fieldset className={s.change}>
            <legend>Substitute vessel</legend>
            <Field label="Vessel name" value={draft.changes.vessel.name} onChange={(v) => changes('vessel', { ...draft.changes.vessel, name: v })} />
            <Field label="IMO number" value={draft.changes.vessel.imo} onChange={(v) => changes('vessel', { ...draft.changes.vessel, imo: v.toUpperCase() })} mono />
          </fieldset>
        )}
        {draft.changes.documents?.map((d) => (
          <div key={d.sha256} className={s.attachment}>
            <span className="kicker">Attached {d.kind.replace(/_/g, ' ')}</span>
            <span className="mono">{d.reference} · sha256 {short(d.sha256, 8, 6)}</span>
            {d.content && <p>{d.content}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Before anything is bought ---------- */

function Preflight({ shipment, draft }: { shipment: Shipment; draft: Instruction }) {
  const analysis = useMemo(() => {
    const parsed = instructionSchema.safeParse(draft);
    if (!parsed.success) return { error: parsed.error.issues.map((i) => `${i.path.join('.') || 'instruction'}: ${i.message}`).slice(0, 3) };
    const changeSet = detectChanges(shipment, parsed.data);
    const plan = planChecks(shipment, changeSet);
    const preview = decide({ shipment, instruction: parsed.data, changeSet, plan, outcomes: plan.map((c) => ({ checkId: c.id, status: 'answered', fields: {}, detail: '', sources: [] })) });
    return { changeSet, plan, hits: preview.hits.filter((h) => !h.checkId), maxCalls: plan.reduce((n, c) => n + (c.required ? 2 : 1), 0) };
  }, [shipment, draft]);

  if ('error' in analysis) return <div className={s.preflight}><p className={s.invalidNote}>The instruction can’t be read yet: {analysis.error?.join('; ')}</p></div>;
  const { changeSet, plan, hits, maxCalls } = analysis;
  const relation = changeSet.sender.domain;
  return (
    <div className={s.preflight}>
      <p className="kicker">Before anything is bought</p>
      <p className={s.senderLine}>
        <span className={`chip ${relation?.relation === 'same' || relation?.relation === 'subdomain' ? 'clear' : relation?.relation === 'lookalike' || relation?.relation === 'brand_in_other_domain' ? 'block' : 'hold'}`}>{relation ? RELATION_LABEL[relation.relation] : 'no domain'}</span>
        {relation?.reason ?? 'The record has no trusted domain.'}
      </p>
      {hits.length > 0 && (
        <ul className={s.preHits}>
          {hits.map((h, i) => <li key={i}><span className={`chip ${EFFECT_TONE[h.effect]}`}>{EFFECT_LABEL[h.effect]}</span> <span className="mono">{h.rule}</span> {RULES[h.rule]}.</li>)}
        </ul>
      )}
      <p className={s.planHead}>{plan.length ? <>Triad will buy <strong>{plan.length} check{plan.length === 1 ? '' : 's'}</strong>, at most {maxCalls} calls ({usdc(maxCalls * PRICE_UUSDC)}): required ones from two independent Miners.</> : 'Nothing changed, so nothing needs buying.'}</p>
      {plan.length > 0 && <ul className={s.plan}>{plan.map((c) => <li key={c.id}><span>{checkTitle(c.id)}</span><span className="chip">{c.required ? 'required ×2' : 'optional'}</span></li>)}</ul>}
    </div>
  );
}

/* ---------- The console ---------- */

export function Console({ cases, live }: { cases: ConsoleCase[]; live: { enabled: boolean; reason: string | null } }) {
  const [caseName, setCaseName] = useState(cases[0]!.name);
  const current = cases.find((c) => c.name === caseName) ?? cases[0]!;
  const [draft, setDraft] = useState<Instruction>(current.instruction);
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const elapsed = useElapsed(busy);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('case');
    if (wanted && wanted !== caseName && cases.some((c) => c.name === wanted)) pick(wanted);
  }, []);

  function pick(name: string) {
    const next = cases.find((c) => c.name === name);
    if (!next) return;
    setCaseName(name);
    setDraft(next.instruction);
    setRun(null);
    setError(null);
    window.history.replaceState(null, '', `?case=${encodeURIComponent(name)}`);
  }

  const edited = keyOf(draft) !== keyOf(current.instruction);
  const valid = instructionSchema.safeParse(draft).success;
  const latest = run?.steps.at(-1) ?? null;
  const stale = run && run.draftKey !== keyOf(draft);

  async function act(kind: NonNullable<Busy>['kind'], work: () => Promise<void>) {
    setBusy({ kind, started: Date.now() });
    setError(null);
    try { await work(); setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }

  const replay = () => act('replay', async () => {
    const response = await fetch(`/api/evidence/${current.recorded!.hash}`);
    if (!response.ok) throw new Error('The recorded evidence could not be loaded.');
    const stored = await response.json() as Issued;
    setRun({ mode: 'replay', steps: [stored], release: null, draftKey: keyOf(draft) });
  });
  const runLive = () => act('live', async () => {
    const issued = await post<Issued>('/api/decide', { case: current.name, instruction: instructionSchema.parse(draft) });
    setRun({ mode: 'live', steps: [issued], release: null, draftKey: keyOf(draft) });
  });
  const callback = (outcome: 'confirmed' | 'denied') => act('callback', async () => {
    const next = await post<Issued>('/api/callback', { ...latest!, outcome });
    setRun((r) => (r ? { ...r, steps: [...r.steps, next] } : r));
  });
  const release = () => act('release', async () => {
    const done = await post<Release>('/api/release', { ...latest!, rail: 'sepolia' });
    setRun((r) => (r ? { ...r, release: done } : r));
  });

  const decision = latest?.evidence.decision;
  const target = decision?.callback.target;
  const before = run && run.steps.length > 1 ? run.steps[0]!.evidence.decision.decision : null;

  return (
    <>
      <section className={`wrap ${s.intro}`}>
        <p className="kicker rise">Attack console</p>
        <h1 className={`display rise d1 ${s.headline}`}>Try to get a payment past it.</h1>
        <p className="lede rise d2">Open a case, rewrite the email or the change it asks for, and run it. Triad buys only the checks your change makes relevant, from Telegraph, and decides under a fixed policy. When it wants a callback, you are the person on the trusted line.</p>
      </section>

      <section className={`wrap ${s.cases}`}>
        <CasePicker cases={cases} current={current} onPick={pick} />
      </section>

      <section className={`wrap ${s.grid}`}>
        <div className={s.left}>
          <Record shipment={current.shipment} />
          <Editor shipment={current.shipment} draft={draft} setDraft={setDraft} original={current.instruction} />
        </div>

        <aside className={s.right}>
          <div className={`doc ${s.desk}`}>
            <div className="doc-head"><span className="doc-title">The desk</span><span className="kicker">policy triad-release-v1</span></div>
            <div className="doc-body">
              <Preflight shipment={current.shipment} draft={draft} />
              <div className={s.runs}>
                <button type="button" className="btn" disabled={!valid || !live.enabled || Boolean(busy)} onClick={runLive}>{busy?.kind === 'live' ? `Buying checks… ${elapsed.toFixed(0)} s` : 'Run it live'}</button>
                {current.recorded && <button type="button" className="btn ghost" disabled={edited || Boolean(busy)} onClick={replay} title={edited ? 'The recorded run is for the unedited instruction' : ''}>{busy?.kind === 'replay' ? 'Loading…' : `Replay the recorded run (${current.recorded.purchases} purchases)`}</button>}
              </div>
              <p className={s.runNote}>
                {!live.enabled ? live.reason : 'A live run pays real testnet fees through Telegraph and records every receipt. It takes 10 to 60 seconds.'}
                {current.recorded && edited ? ' The recorded run is for the case as written; reset to replay it.' : ''}
              </p>
              {busy?.kind === 'live' && <div className={s.progress} aria-live="polite"><span className={s.bar} />Asking Telegraph’s Miners and OFAC’s list, then deciding. Nothing is released while this runs.</div>}
              {error && <p className={s.error} role="alert">{error}</p>}
            </div>
          </div>

          {latest && decision && (
            <div ref={resultRef} className={`doc ${s.result}`}>
              <div className="doc-head"><span className="doc-title">{run!.mode === 'live' ? 'Live decision' : 'Recorded decision'}</span><span className="mono muted">{short(latest.evidence_sha256, 10, 6)}</span></div>
              <div className="doc-body">
                {stale && <p className={s.stale}>You have edited the instruction since this run.</p>}
                <div className={s.verdict}>
                  {before && <><Stamp verdict={before} className={s.prevStamp} /><span className={s.arrow} aria-hidden="true">→</span></>}
                  <Stamp key={latest.evidence_sha256} verdict={decision.decision} big press />
                  <p className={s.verdictText}>
                    {decision.decision === 'BLOCK' ? 'Nothing moves. A block is final: no callback can release it.'
                      : decision.decision === 'HOLD' ? `Held until ${decision.needs.map((n) => (n === 'callback' ? 'the trusted contact confirms' : 'the missing evidence arrives')).join(' and ')}.`
                        : `${agreed(latest.evidence)} The escrow may pay what this evidence names.`}
                  </p>
                </div>
                <ul className={s.topHits}>
                  {decision.hits.slice(0, 4).map((h, i) => <li key={i}><span className={`chip ${EFFECT_TONE[h.effect]}`}>{EFFECT_LABEL[h.effect]}</span> {h.text}</li>)}
                  {decision.hits.length > 4 && <li className="muted">and {decision.hits.length - 4} more below.</li>}
                </ul>

                {decision.needs.includes('callback') && target && (
                  <div className={s.call}>
                    <p className="kicker">Callback · out of band</p>
                    <p className={s.dial}><span className={s.phone}>{target.channel === 'phone' ? '☎' : '✉'}</span> Triad calls <strong>{target.name}</strong> on <span className="mono">{target.address}</span>, the {target.channel === 'phone' ? 'number' : 'address'} on the record before this email arrived. Nothing in the email is used to reach them.</p>
                    <p className={s.youAre}>You are {target.name}. Did your desk send this instruction?</p>
                    <div className={s.callButtons}>
                      <button type="button" className="btn ok" disabled={Boolean(busy)} onClick={() => callback('confirmed')}>Yes, we sent it</button>
                      <button type="button" className="btn danger" disabled={Boolean(busy)} onClick={() => callback('denied')}>No, we never sent this</button>
                    </div>
                  </div>
                )}

                {decision.decision === 'CLEAR' && (
                  <div className={s.releaseBox}>
                    <p className="kicker">Release · Ethereum Sepolia</p>
                    {run!.release ? (
                      <dl className="fields">
                        <dt>Paid</dt><dd>{usdc(run!.release.amount)} to <span className="mono">{short(run!.release.payee, 8, 6)}</span></dd>
                        {run!.release.fundTx && <><dt>Funded</dt><dd><a className="mono" href={`https://sepolia.etherscan.io/tx/${run!.release.fundTx}`} target="_blank" rel="noreferrer">{short(run!.release.fundTx)}</a></dd></>}
                        <dt>Released</dt><dd><a className="mono" href={run!.release.explorer} target="_blank" rel="noreferrer">{short(run!.release.releaseTx)}</a></dd>
                        <dt>Signed by</dt><dd className="mono">{short(run!.release.signer, 8, 6)}, naming evidence {short(latest.evidence_sha256, 8, 6)}</dd>
                      </dl>
                    ) : run!.mode === 'live' && latest.seal ? (
                      <>
                        <p className={s.releaseText}>The operator locks {usdc(latest.evidence.shipment.amount.value)} in the escrow for this run’s shipment. The release officer signs the payee, the amount and this evidence hash; the contract pays exactly that or reverts.</p>
                        <button type="button" className="btn" disabled={Boolean(busy)} onClick={release}>{busy?.kind === 'release' ? `Funding and releasing… ${elapsed.toFixed(0)} s` : 'Fund the escrow and release'}</button>
                      </>
                    ) : <p className={s.releaseText}>Recorded runs are not paid again. Run this case live to fund a fresh escrow and release it.</p>}
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </section>

      {latest && (
        <section className={`wrap ${s.evidence}`}>
          <div className={s.evidenceHead}>
            <h2 className="section">The evidence file</h2>
            <a className="btn ghost" download={`triad-${latest.evidence_sha256.slice(2, 14)}.json`} href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ evidence_sha256: latest.evidence_sha256, evidence: latest.evidence }, null, 2))}`}>Download it</a>
          </div>
          <EvidenceView evidence={latest.evidence} hash={latest.evidence_sha256} compact />
        </section>
      )}
    </>
  );
}
