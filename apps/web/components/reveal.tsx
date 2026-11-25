'use client';
import { usePathname } from 'next/navigation';
import { Fragment, useEffect } from 'react';

// Marks each [data-reveal] element with .in the first time it scrolls into view. The hidden-before-reveal styles apply
// only under html.js-reveal, set here, so every page stays fully visible without JavaScript or with reduced motion.
export function Reveal() {
  const path = usePathname();
  useEffect(() => {
    if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.documentElement.classList.add('js-reveal');
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.1 });
    document.querySelectorAll('[data-reveal]:not(.in)').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [path]);
  return null;
}

// A headline whose words rise out of their own line masks, one after another. `load` plays on page load; otherwise the
// words wait for the nearest [data-reveal] ancestor to come into view.
export function Words({ lines, load = false }: { lines: (string | [string, string])[]; load?: boolean }) {
  let w = 0;
  return (
    <span className={`words${load ? ' load' : ''}`}>
      {lines.map((line, n) => {
        const [text, className] = typeof line === 'string' ? [line, ''] : line;
        return (
          <span key={n} className={className}>
            {n > 0 && <br />}
            {text.split(' ').map((word, i) => (
              <Fragment key={i}>{i > 0 && ' '}<span className="w"><span style={{ ['--w' as string]: w++ }}>{word}</span></span></Fragment>
            ))}
          </span>
        );
      })}
    </span>
  );
}
