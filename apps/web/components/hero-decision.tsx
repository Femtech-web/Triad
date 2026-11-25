'use client';
import { useEffect, useState } from 'react';
import { Verdict } from './verdict';
import s from '@/app/landing.module.css';

// The landing's product window: three decisions from the examples on /check, each played step by step as its witnesses
// answer. It pauses while hovered or focused; with reduced motion it shows the first decision, finished and still.

type Ring = 'idle' | 'checking' | 'ok' | 'fail' | 'wait' | 'skip';
type Effect = 'block' | 'hold' | 'confirmed';
interface Frame {
  rings: [Ring, Ring, Ring];
  notes: [string, string, string];
  // Milliseconds before the next frame.
  after: number;
  verdict?: 'CLEAR' | 'HOLD' | 'BLOCK';
  headline?: string;
  rules?: [Effect, string, string][];
  foot?: string;
}
interface Scene { tab: string; fromName: string; address: [string, string, string]; subject: string; body: string; change: [string, string]; frames: Frame[] }

const WITNESSES = ['Record', 'Network', 'Person'];
const HOLD_MS = 5200;

const SCENES: Scene[] = [
  {
    tab: 'Look-alike', fromName: 'Glencore Treasury Desk', address: ['treasury.desk@', 'glencor.com', ''], subject: 'Updated remittance details',
    body: 'Due to an internal audit our bank account has changed with immediate effect. Please remit TRD-GLE-1060 to the account below and confirm by return.',
    change: ['New account', 'CH56 0483 5012 3456 7800 9'],
    frames: [
      { rings: ['checking', 'idle', 'idle'], notes: ['Comparing the sender', 'Waiting', 'Waiting'], after: 1100 },
      { rings: ['fail', 'skip', 'skip'], notes: ['glencor.com imitates glencore.com', 'Nothing bought', 'No call needed'], after: 0,
        verdict: 'BLOCK', headline: 'Don’t pay. The sender imitates your supplier’s domain.',
        rules: [['block', 'R-SENDER-LOOKALIKE', 'glencor.com is one letter off glencore.com'], ['hold', 'R-PAYOUT-CHANGED', 'payment would go to a new account']],
        foot: 'Caught before a single check was bought.' },
    ],
  },
  {
    tab: 'Confirmed by call', fromName: 'Glencore Treasury Desk', address: ['treasury.desk@', '', 'glencore.com'], subject: 'New receiving bank',
    body: 'We have moved our USD receiving account to a new bank. Please use the details below for all open invoices.',
    change: ['New account', 'CH56 0483 5012 3456 7800 9'],
    frames: [
      { rings: ['checking', 'idle', 'idle'], notes: ['Comparing the sender', 'Waiting', 'Waiting'], after: 1000 },
      { rings: ['ok', 'checking', 'idle'], notes: ['Genuine domain, known contact', 'Buying checks on Telegraph', 'Waiting'], after: 1500 },
      { rings: ['ok', 'ok', 'wait'], notes: ['Genuine domain, known contact', 'Paid checks passed', 'Call +41 41 000 10 05'], after: 2600,
        verdict: 'HOLD', headline: 'Hold. Call the number you already had before paying.',
        rules: [['hold', 'R-PAYOUT-CHANGED', 'payment would go to a new account']], foot: 'Nothing moves until the trusted contact answers.' },
      { rings: ['ok', 'ok', 'ok'], notes: ['Genuine domain, known contact', 'Paid checks passed', 'Confirmed on the known number'], after: 0,
        verdict: 'CLEAR', headline: 'Pay as instructed. The contact you trust confirmed it.',
        rules: [['confirmed', 'R-PAYOUT-CHANGED', 'new account confirmed by call']], foot: 'Re-decided on the same paid answers.' },
    ],
  },
  {
    tab: 'Sanctioned agent', fromName: 'Antofagasta Logistics Desk', address: ['logistics.desk@', '', 'antofagasta.co.uk'], subject: 'Change of forwarding agent',
    body: 'Please release the cargo at Rotterdam to our new agent below, who will collect on arrival.',
    change: ['New pickup agent', 'PAO Sovcomflot · RU'],
    frames: [
      { rings: ['checking', 'idle', 'idle'], notes: ['Comparing the sender', 'Waiting', 'Waiting'], after: 1000 },
      { rings: ['ok', 'checking', 'idle'], notes: ['Genuine mailbox, known contact', 'Asking two Miners and OFAC', 'Waiting'], after: 1700 },
      { rings: ['ok', 'fail', 'skip'], notes: ['Genuine mailbox, known contact', 'Ranked answer: no match. OFAC: entry 34741', 'Blocked before a call'], after: 0,
        verdict: 'BLOCK', headline: 'Don’t release. The new agent is on OFAC’s sanctions list.',
        rules: [['block', 'R-SANCTIONS-MATCH', 'PAO Sovcomflot is OFAC SDN entry 34741'], ['hold', 'R-CARGO-PARTY-CHANGED', 'cargo would go to a different party']],
        foot: 'The ranked answer said no match. OFAC’s own list didn’t.' },
    ],
  },
];

const CHIP: Record<Effect, [string, string]> = { block: ['block', 'blocks'], hold: ['hold', 'needs callback'], confirmed: ['clear', 'confirmed'] };
const duration = (scene: Scene) => scene.frames.reduce((sum, f) => sum + f.after, 0) + HOLD_MS;

function RingMark({ state }: { state: Ring }) {
  return (
    <span className={s.ring} data-state={state} aria-hidden="true">
      <svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" /></svg>
      <svg className={s.ringIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {state === 'ok' && <path d="m6.5 12.5 3.5 3.5 7.5-8" />}
        {state === 'fail' && <path d="m8 8 8 8M16 8l-8 8" />}
        {state === 'skip' && <path d="M8 12h8" />}
        {state === 'wait' && <path d="M12 7.5V12l3 2" />}
      </svg>
    </span>
  );
}

export function HeroDecision() {
  const [scene, setScene] = useState(0);
  const [frame, setFrame] = useState(SCENES[0]!.frames.length - 1);
  const [live, setLive] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setLive(true);
    setFrame(0);
  }, []);

  useEffect(() => {
    if (!live || paused) return;
    const frames = SCENES[scene]!.frames;
    const last = frame === frames.length - 1;
    const timer = setTimeout(() => {
      if (!last) return setFrame(frame + 1);
      setScene((scene + 1) % SCENES.length);
      setFrame(0);
    }, last ? HOLD_MS : frames[frame]!.after);
    return () => clearTimeout(timer);
  }, [live, paused, scene, frame]);

  const current = SCENES[scene]!;
  const shown = current.frames[frame]!;
  const decided = [...current.frames.slice(0, frame + 1)].reverse().find((f) => f.verdict);
  const pick = (i: number) => { setScene(i); setFrame(live ? 0 : SCENES[i]!.frames.length - 1); };

  return (
    <div className={s.window} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div className={s.windowBar}>
        <span /><span /><span />
        <div className={s.tabs} role="tablist" aria-label="Example decisions">
          {SCENES.map((sc, i) => (
            <button key={sc.tab} type="button" role="tab" aria-selected={i === scene} onClick={() => pick(i)}>{sc.tab}</button>
          ))}
        </div>
        {live && <i key={`${scene}-progress`} className={s.progress} style={{ animationDuration: `${duration(current)}ms`, animationPlayState: paused ? 'paused' : 'running' }} />}
      </div>
      <div key={scene} className={`${s.windowGrid} ${live ? s.sceneIn : ''}`}>
        <div className={s.mail}>
          <p className="label">Incoming email</p>
          <dl className={s.mailHead}>
            <dt>From</dt><dd>{current.fromName} <span className={s.addr}>{current.address[0]}{current.address[1] && <mark>{current.address[1]}</mark>}{current.address[2]}</span></dd>
            <dt>Subject</dt><dd>{current.subject}</dd>
          </dl>
          <p className={s.mailBody}>{current.body}</p>
          <div className={s.newAccount}><span className="label">{current.change[0]}</span><span className="mono">{current.change[1]}</span></div>
        </div>
        <div className={s.decision}>
          <ol className={s.witnessRow} aria-label="Witnesses">
            {WITNESSES.map((name, i) => (
              <li key={name} data-state={shown.rings[i]}>
                <RingMark state={shown.rings[i]!} />
                <span className={s.witnessName}>{name}</span>
                <span className={s.witnessNote}>{shown.notes[i]}</span>
              </li>
            ))}
          </ol>
          {decided ? (
            <div key={`${scene}-${decided.verdict}`} className={s.verdictBlock} aria-live="polite">
              <Verdict verdict={decided.verdict!} size="lg" reveal={live} />
              <p className={s.headline}>{decided.headline}</p>
              <ul className={s.rules}>
                {decided.rules!.map(([effect, rule, text], i) => (
                  <li key={rule} style={{ ['--i' as string]: i }}><span className={`chip ${CHIP[effect][0]}`}>{CHIP[effect][1]}</span><span><b className="mono">{rule}</b> {text}</span></li>
                ))}
              </ul>
              <p className={s.decisionFoot}>{decided.foot}</p>
            </div>
          ) : (
            <div className={s.pending} aria-hidden="true"><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></div>
          )}
        </div>
      </div>
    </div>
  );
}
