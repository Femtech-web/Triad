import type { Verdict } from '@/lib/format';
import { NOTE, gatesOfChanges, noteSerial } from '@/lib/gates';

export function Stamp({ verdict, press = false }: { verdict: Verdict; press?: boolean }) {
  return <span className={`stamp ${NOTE[verdict].tone}${press ? ' press' : ''}`}>{NOTE[verdict].stamp}</span>;
}

// "Stop note TRN-7F83-957F · G-02 Cargo release": what a decision was issued as, where it came from, and its serial.
export function NoteLine({ verdict, hash, changes = [], press = false }: { verdict: Verdict; hash: string; changes?: string[]; press?: boolean }) {
  const gates = gatesOfChanges(changes);
  return (
    <p className="note-line">
      <Stamp verdict={verdict} press={press} />
      <span className="note-kind">{NOTE[verdict].kind}</span>
      <span className="mono note-serial" title={hash}>{noteSerial(hash)}</span>
      {gates.map((g) => <span key={g.id} className="chip">{g.id} · {g.name}</span>)}
    </p>
  );
}
