// The docs' table of contents: plain data, shared by the sidebar (client) and the pages (server).
export interface DocEntry { slug: string; title: string; blurb: string }
export interface DocGroup { label: string; items: DocEntry[] }

export const DOC_GROUPS: DocGroup[] = [
  { label: 'Getting started', items: [
    { slug: '', title: 'Welcome to Triad', blurb: 'what it is, and where everything lives' },
    { slug: 'how-it-works', title: 'How a decision is made', blurb: 'three witnesses, five steps, one real decision' },
  ] },
  { label: 'Use Triad', items: [
    { slug: 'check', title: 'Check a payment change', blurb: 'the everyday check, in the browser' },
    { slug: 'attack-lab', title: 'The attack lab', blurb: 'try to get a payment past it' },
    { slug: 'extension', title: 'Gmail and Outlook', blurb: 'check an email where it arrives' },
    { slug: 'agents', title: 'Agent API', blurb: 'POST /api/v1/check, free or paid over x402' },
    { slug: 'mcp', title: 'MCP server', blurb: 'four tools for any MCP client' },
  ] },
  { label: 'How it decides', items: [
    { slug: 'gates', title: 'Gates', blurb: 'one engine, a gate per kind of change' },
    { slug: 'policy', title: 'The policy', blurb: 'triad-release-v1 and its 23 rules' },
    { slug: 'telegraph', title: 'What it buys on Telegraph', blurb: 'Intents, two sources, OFAC' },
    { slug: 'evidence', title: 'Release notes', blurb: 'the signed note, its serial, and the evidence under it' },
  ] },
  { label: 'Money', items: [
    { slug: 'settlement', title: 'Escrows on two chains', blurb: 'Solana devnet and Ethereum Sepolia' },
  ] },
  { label: 'Trust', items: [
    { slug: 'benchmark', title: 'Benchmark and results', blurb: '40 frozen cases and an attack set we didn’t write' },
    { slug: 'ledger', title: 'The public ledger', blurb: 'every decision, nothing personal' },
    { slug: 'limits', title: 'Limits and FAQ', blurb: 'what is real, what is testnet, what it can’t do' },
  ] },
  { label: 'Build', items: [
    { slug: 'self-hosting', title: 'Run it yourself', blurb: 'from source, with your own keys' },
  ] },
];

export const DOC_PAGES = DOC_GROUPS.flatMap((g) => g.items.map((item) => ({ ...item, group: g.label })));
export const docHref = (slug: string) => (slug ? `/docs/${slug}` : '/docs');
