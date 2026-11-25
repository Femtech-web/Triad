'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DOC_GROUPS, DOC_PAGES, docHref } from './nav';
import s from './docs.module.css';

export function DocsNav() {
  const path = usePathname().replace(/\/$/, '');
  const current = DOC_PAGES.find((p) => docHref(p.slug) === path);
  const list = (
    <nav aria-label="Documentation">
      {DOC_GROUPS.map((group) => (
        <div key={group.label} className={s.navGroup}>
          <p className={s.navLabel}>{group.label}</p>
          <ul>
            {group.items.map((item) => (
              <li key={item.slug}>
                <Link href={docHref(item.slug)} aria-current={docHref(item.slug) === path ? 'page' : undefined}>{item.title}</Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
  return (
    <>
      <aside className={s.sidebar}>{list}</aside>
      <details className={s.mobileNav}>
        <summary><span className="label">Docs</span><span>{current?.title ?? 'Contents'}</span></summary>
        {list}
      </details>
    </>
  );
}
