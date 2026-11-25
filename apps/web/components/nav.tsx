'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [['/console', 'Console'], ['/benchmark', 'Benchmark'], ['/evidence', 'Evidence']] as const;

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav">
      {LINKS.map(([href, label]) => <Link key={href} href={href} aria-current={path.startsWith(href) ? 'page' : undefined}>{label}</Link>)}
    </nav>
  );
}
