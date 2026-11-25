import type { Verdict } from './format';

// One engine, a gate per kind of change. A gate names what the change controls, what Triad buys for it, and where to
// run it. Every decision is issued as a note named for what it lets happen.

export interface Gate {
  id: 'G-01' | 'G-02' | 'G-03';
  name: string;
  guards: string;
  buys: string[];
  where: { href: string; label: string };
  // The rule a gate's change always raises, and the benchmark cases whose notes show it at work.
  rule: string;
  examples: string[];
}

export const GATES: Gate[] = [
  { id: 'G-01', name: 'Payment change', guards: 'New bank details for a supplier you already pay.', rule: 'R-PAYOUT-CHANGED',
    buys: ['Company registry', 'Sanctions, plus OFAC', 'Tax number', 'Sender’s domain and mail records'],
    where: { href: '/check', label: 'Run it in Check a payment' }, examples: ['attack-lookalike-glencore', 'legit-bank-change-confirmed-glencore'] },
  { id: 'G-02', name: 'Cargo release', guards: 'A new consignee or pickup agent before cargo leaves the port.', rule: 'R-CARGO-PARTY-CHANGED',
    buys: ['Registry on the new party', 'Sanctions, plus OFAC'],
    where: { href: '/check', label: 'Run it in Check a payment' }, examples: ['attack-sanctioned-pickup-sovcomflot', 'legit-pickup-agent-confirmed-antofagasta'] },
  { id: 'G-03', name: 'Vessel substitution', guards: 'A different ship for the cargo than the one on the record.', rule: 'R-VESSEL-CHANGED',
    buys: ['Sanctions on the vessel, plus OFAC by IMO', 'Vessel position'],
    where: { href: '/console?case=attack-sanctioned-vessel-imo9413559', label: 'Try it in the attack lab' }, examples: ['attack-sanctioned-vessel-imo9413559'] },
];

const BY_CHANGE: Record<string, Gate['id']> = { payout: 'G-01', document: 'G-01', consignee: 'G-02', pickup_party: 'G-02', vessel: 'G-03' };
export const gatesOfChanges = (kinds: string[]): Gate[] => GATES.filter((g) => kinds.some((k) => BY_CHANGE[k] === g.id));
export const gatesOfRules = (rules: string[]): Gate[] => GATES.filter((g) => rules.includes(g.rule));

export const NOTE: Record<Verdict, { kind: string; stamp: string; tone: string }> = {
  CLEAR: { kind: 'Release note', stamp: 'Release', tone: 'clear' },
  HOLD: { kind: 'Hold note', stamp: 'Hold', tone: 'hold' },
  BLOCK: { kind: 'Stop note', stamp: 'Stop', tone: 'block' },
};

// The serial is the start of the evidence hash, so a serial always leads back to exactly one file.
export function noteSerial(hash: string): string {
  const h = hash.replace(/^0x/i, '').slice(0, 8).toUpperCase();
  return `TRN-${h.slice(0, 4)}-${h.slice(4)}`;
}
