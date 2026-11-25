import type { Verdict as V } from '@/lib/format';

const ICONS: Record<V, React.ReactNode> = {
  CLEAR: <path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.3 7.5 9.5 4.4-1.2 7.5-5.1 7.5-9.5V6L12 3Zm-3.2 9.2 2.3 2.3 4.6-4.8" />,
  HOLD: <><circle cx="12" cy="12" r="8.5" /><path d="M10 9v6M14 9v6" /></>,
  BLOCK: <><path d="M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3L8.3 3Z" /><path d="m9.5 9.5 5 5m0-5-5 5" /></>,
};

export function Verdict({ verdict, size, reveal, className = '' }: { verdict: V; size?: 'lg'; reveal?: boolean; className?: string }) {
  return (
    <span className={`verdict ${verdict.toLowerCase()}${size ? ` ${size}` : ''}${reveal ? ' reveal' : ''} ${className}`} role="img" aria-label={`Decision: ${verdict}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[verdict]}</svg>
      {verdict}
    </span>
  );
}
