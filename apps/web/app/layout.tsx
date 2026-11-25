import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from 'next/font/google';
import { Mark } from '@/components/mark';
import { Nav } from '@/components/nav';
import { Reveal } from '@/components/reveal';
import './globals.css';

const display = Bricolage_Grotesque({ subsets: ['latin'], axes: ['opsz'], variable: '--font-display' });
const sans = Instrument_Sans({ subsets: ['latin'], variable: '--font-sans' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Triad · Check a payment change before you pay',
  description: 'Triad stops payment-redirection and cargo-release fraud: a changed instruction moves money or cargo only when the record, independent checks bought through Telegraph, and the contact you already trusted agree.',
};
export const viewport: Viewport = { themeColor: '#07080b', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <header className="masthead">
          <div className="wrap">
            <Link href="/" className="brand" aria-label="Triad home"><Mark className="brand-mark" /><span className="brand-name">Triad</span></Link>
            <Nav />
          </div>
        </header>
        <main>{children}</main>
        <Reveal />
        <footer className="footer">
          <div className="wrap">
            <span>Triad · built on Telegraph for Hackathon Season II, Mission 08. Testnets only: Ethereum Sepolia and Solana devnet.</span>
            <nav aria-label="Footer">
              <Link href="/check">Check a payment</Link>
              <Link href="/console">Attack lab</Link>
              <Link href="/benchmark">Benchmark</Link>
              <Link href="/ledger">Ledger</Link>
              <Link href="/evidence">Notes</Link>
              <Link href="/docs">Docs</Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
