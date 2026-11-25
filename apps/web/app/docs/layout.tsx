import type { Metadata } from 'next';
import { DocsNav } from './docs-nav';
import s from './docs.module.css';

export const metadata: Metadata = { title: 'Docs · Triad', description: 'How Triad decides, how to use it from a browser, an inbox or an agent, and how to verify everything it does.' };

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`wrap ${s.shell}`}>
      <DocsNav />
      <div className={s.main}>{children}</div>
    </div>
  );
}
