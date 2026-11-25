import type { Metadata } from 'next';
import Link from 'next/link';
import { IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif } from 'next/font/google';
import { Mark } from '@/components/mark';
import { Nav } from '@/components/nav';
import './globals.css';

const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-serif' });
const sans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Triad: release gate for commodity trades',
  description: 'A supplier payment or cargo release moves only when the record, independent intelligence bought through Telegraph and the previously trusted contact agree.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <header className="masthead">
          <div className="wrap">
            <Link href="/" className="brand" aria-label="Triad home"><Mark className="brand-mark" /><span className="brand-name">Triad</span></Link>
            <Nav />
          </div>
        </header>
        <main>{children}</main>
        <footer className="footer">
          <div className="wrap">
            <span>Triad · built for Telegraph Hackathon Season II (Mission 08). Testnets only: Ethereum Sepolia and Solana devnet, test USDC.</span>
            <span>Every decision ships with its evidence file.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
