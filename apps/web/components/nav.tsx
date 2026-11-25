'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [['/console', 'Attack lab', ''], ['/benchmark', 'Benchmark', 'hide-sm'], ['/ledger', 'Ledger', 'hide-sm'], ['/evidence', 'Evidence', 'hide-sm']] as const;

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {LINKS.map(([href, label, cls]) => <Link key={href} href={href} className={cls} aria-current={path.startsWith(href) ? 'page' : undefined}>{label}</Link>)}
      <Link href="/check" className="btn primary sm" aria-current={path.startsWith('/check') ? 'page' : undefined}>Check a payment</Link>
    </nav>
  );
}
