import type { Verdict } from '@/lib/format';

export function Stamp({ verdict, big, press, className = '' }: { verdict: Verdict; big?: boolean; press?: boolean; className?: string }) {
  return <span className={`stamp ${verdict.toLowerCase()}${big ? ' big' : ''}${press ? ' press' : ''} ${className}`} role="img" aria-label={`Decision: ${verdict}`}>{verdict}</span>;
}
