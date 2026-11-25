import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CONTENT } from '../content';
import { DOC_PAGES, docHref } from '../nav';
import s from '../docs.module.css';

export const dynamicParams = false;
export function generateStaticParams() {
  return DOC_PAGES.map((p) => ({ slug: p.slug ? [p.slug] : [] }));
}

const find = (slug?: string[]) => DOC_PAGES.findIndex((p) => p.slug === (slug?.join('/') ?? ''));

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }): Promise<Metadata> {
  const page = DOC_PAGES[find((await params).slug)];
  return page ? { title: `${page.title} · Triad docs`, description: page.blurb } : {};
}

export default async function DocPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const index = find((await params).slug);
  const page = DOC_PAGES[index];
  const Body = page ? CONTENT[page.slug] : undefined;
  if (!page || !Body) notFound();
  const prev = DOC_PAGES[index - 1];
  const next = DOC_PAGES[index + 1];
  return (
    <article className={s.article}>
      <p className={`label ${s.eyebrow}`}>{page.group}</p>
      <div className={s.prose}><Body /></div>
      <nav className={s.pager} aria-label="More docs">
        {prev ? <Link href={docHref(prev.slug)}><span className="label">Previous</span>{prev.title}</Link> : <span />}
        {next ? <Link href={docHref(next.slug)} className={s.next}><span className="label">Next</span>{next.title}</Link> : <span />}
      </nav>
    </article>
  );
}
