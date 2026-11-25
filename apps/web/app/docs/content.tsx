import Link from 'next/link';
import type { ReactNode } from 'react';
import { POLICY_VERSION, RULES } from '@triad/core';
import { Verdict } from '@/components/verdict';
import { benchmarkReport, bestDecision, lookalikeResults, releases, roiReport, sales } from '@/lib/data';
import { money } from '@/lib/format';
import { GATES, NOTE, noteSerial } from '@/lib/gates';
import s from './docs.module.css';

// The body of each docs page, keyed by slug. Figures come from the public record the app ships with.

const APP = 'https://triad-five-steel.vercel.app';
const ext = (href: string, children: ReactNode) => <a href={href} target="_blank" rel="noreferrer">{children}</a>;
const Callout = ({ tone = 'note', title, children }: { tone?: 'note' | 'warn'; title: string; children: ReactNode }) => (
  <div className={`${s.callout} ${tone === 'warn' ? s.warn : ''}`}><span className={s.calloutTitle}>{title}</span><div>{children}</div></div>
);
const KV = ({ rows }: { rows: [ReactNode, ReactNode][] }) => (
  <dl className={s.kv}>{rows.map(([k, v], i) => <div key={i}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
);
const Code = ({ children }: { children: string }) => <pre className={s.code}><code>{children}</code></pre>;

const EFFECTS: Record<string, 'block' | 'hold_callback' | 'hold_evidence'> = {
  'R-SENDER-LOOKALIKE': 'block', 'R-DISPLAY-NAME-SPOOF': 'block', 'R-REPLY-TO-LOOKALIKE': 'block', 'R-SANCTIONS-MATCH': 'block',
  'R-ENTITY-INACTIVE': 'block', 'R-DOCUMENT-FORGED': 'block', 'R-CALLBACK-DENIED': 'block',
  'R-PAYOUT-CHANGED': 'hold_callback', 'R-PAYEE-NOT-SELLER': 'hold_callback', 'R-CARGO-PARTY-CHANGED': 'hold_callback', 'R-VESSEL-CHANGED': 'hold_callback',
  'R-SENDER-NOT-AUTHORIZED': 'hold_callback', 'R-SENDER-OUTSIDE-DOMAIN': 'hold_callback', 'R-REPLY-TO-DIVERTED': 'hold_callback',
  'R-PAYOUT-RAIL-MISMATCH': 'hold_evidence', 'R-VAT-INVALID': 'hold_evidence', 'R-DOCUMENT-DOUBTFUL': 'hold_evidence', 'R-SENDER-DOMAIN-NO-MAIL': 'hold_evidence',
  'R-RECORD-DOMAIN-DIFFERS': 'hold_evidence', 'R-WRONG-ENTITY': 'hold_evidence', 'R-SOURCES-DISAGREE': 'hold_evidence', 'R-EVIDENCE-MISSING': 'hold_evidence',
  'R-NO-OUT-OF-BAND-CHANNEL': 'hold_evidence',
};

function Welcome() {
  return (
    <>
      <h1>Welcome to <span className={s.accent}>Triad.</span></h1>
      <p className={s.lead}><strong>Triad is a release gate for physical commodity trades.</strong> A changed payment or cargo instruction moves only when three witnesses agree: the record you already trusted, independent checks bought through Telegraph, and the contact you knew before the email arrived.</p>
      <p>Payment-redirection fraud rarely fakes the supplier. It fakes the change: new bank details, a new pickup agent, a substitute vessel, sent from a look-alike domain or a hijacked mailbox. Registry and sanctions screening pass these attacks by design, because the company is real. Triad checks the change itself, buys only the checks that change makes relevant, and answers in plain words with what to do next. Every decision is issued as a signed, numbered note: release, hold or stop. The hash of the evidence under it is the only thing that can release escrowed money.</p>
      <h2 id="ways-in">Three ways in</h2>
      <ul>
        <li><b>A person</b> pastes the email into <Link href="/check">Check a payment change</Link>, or clicks the <Link href="/docs/extension">browser extension</Link> in Gmail or Outlook.</li>
        <li><b>An agent</b> calls <Link href="/docs/agents"><code>POST /api/v1/check</code></Link> or the <Link href="/docs/mcp">MCP server</Link>, free for five checks a day and then $0.05 over x402 on Solana.</li>
        <li><b>A sceptic</b> opens the <Link href="/docs/attack-lab">attack lab</Link> and tries to get a payment past it, with a real escrow release when it says CLEAR.</li>
      </ul>
      <h2 id="where">Where everything lives</h2>
      <KV rows={[
        ['The app', ext(APP, 'triad-five-steel.vercel.app')],
        ['Check a payment change', <Link key="c" href="/check">/check</Link>],
        ['Attack lab', <Link key="l" href="/console">/console</Link>],
        ['Benchmark', <Link key="b" href="/benchmark">/benchmark</Link>],
        ['Public ledger', <Link key="g" href="/ledger">/ledger</Link>],
        ['Verify a note', <Link key="e" href="/evidence">/evidence</Link>],
        ['Agent API', <code key="a">POST /api/v1/check</code>],
        ['Policy', <Link key="p" href="/docs/policy"><code>{POLICY_VERSION}</code>, {Object.keys(RULES).length} rules</Link>],
        ['Escrow on Ethereum Sepolia', ext('https://sepolia.etherscan.io/address/0x313060d737a2ba1f2eb5e62278a61286bff8d7eb', <code>ShipmentEscrow 0x3130…8d7eb</code>)],
        ['Escrow on Solana devnet', ext('https://explorer.solana.com/address/7hRAkLUZ2EMuFpsc3mtKfKnfxUJvcbgJqhWDShtxz567?cluster=devnet', <code>triad_escrow 7hRAkLUZ…xz567</code>)],
        ['Evidence signer (EIP-191)', <code key="i">0xE107c20e529d13b8ac6E1Bad05224664dc912dCf</code>],
        ['Triad’s Telegraph escrow', ext('https://devnode.telegraphprotocol.com/v1/ledger/account/0xb545a45454754d5c8687231B52704cc689D2739d', <code>0xb545…739d</code>)],
        ['Solana wallet (buys checks, sells checks)', ext('https://explorer.solana.com/address/ATxmzqGTLjHXJo1gCVCgNxUUNyDU1yaLLYHRPCy1BvN4?cluster=devnet', <code>ATxmzq…BvN4</code>)],
        ['Source code', ext('https://github.com/Femtech-web/Triad', 'github.com/Femtech-web/Triad')],
        ['Telegraph', ext('https://x.com/Telegraphprotoc', '@Telegraphprotoc')],
      ]} />
      <Callout tone="warn" title="Testnet">Triad runs on Telegraph’s testnet. Checks are paid in test USDC; escrows hold test USDC on Ethereum Sepolia and devnet USDC on Solana. None of it has monetary value. The companies, sanctions lists and registries it checks are real.</Callout>
      <h2 id="reading">Reading order</h2>
      <p>New here? Read <Link href="/docs/how-it-works">How a decision is made</Link>, then try <Link href="/check">a check</Link>. Evaluating the build? Go to <Link href="/docs/evidence">Evidence files</Link>, <Link href="/docs/benchmark">Benchmark and results</Link> and <Link href="/docs/limits">Limits</Link>.</p>
    </>
  );
}

function HowItWorks() {
  return (
    <>
      <h1>How a decision is made</h1>
      <p className={s.lead}>Every change to where money or cargo goes is unverified until three independent witnesses agree. A fixed policy turns what they said into one of three decisions.</p>
      <h2 id="witnesses">The three witnesses</h2>
      <ol>
        <li><b>The record.</b> What you already trusted for this shipment: the payee and account, the consignee, the pickup agent, the vessel, and the contacts allowed to change them. Each instruction is compared with it field by field, and its sender with the trusted domain, including look-alikes and homoglyphs.</li>
        <li><b>The network.</b> Checks bought through Telegraph for exactly what changed: registry, sanctions, tax number, company domain, mail records, documents, vessel. Required checks need two independent Miners, and sanctions are also matched against OFAC’s own list. See <Link href="/docs/telegraph">What it buys on Telegraph</Link>.</li>
        <li><b>The person.</b> A call to the contact the record already trusted, on the number you had before the email, never through the mailbox the change came from. A confirmation only answers “is this genuine?”. It never stands in for a missing check.</li>
      </ol>
      <h2 id="steps">Five steps</h2>
      <ol>
        <li><b>Spot the change.</b> A look-alike sender or a changed account is caught before anything is spent. A block from the email alone costs nothing.</li>
        <li><b>Buy only what matters.</b> Each change maps to specific Telegraph checks. Nothing changed means nothing bought.</li>
        <li><b>Corroborate.</b> Two Miners for every required check; OFAC’s list for sanctions; an answer that doesn’t name the company asked about can’t satisfy a check.</li>
        <li><b>Call the trusted contact.</b> A denial blocks. A confirmation clears only if every required check passed.</li>
        <li><b>Issue the note.</b> CLEAR, HOLD or BLOCK under <code>{POLICY_VERSION}</code>, issued as a signed release, hold or stop note. Its hash is what releases the money.</li>
      </ol>
      <h2 id="decisions">The three decisions</h2>
      <div className={s.decisions}>
        <div><Verdict verdict="BLOCK" /><p>Evidence shows the instruction is wrong: a look-alike sender, a sanctions match, an inactive company, a forged document, a denied call. Final.</p></div>
        <div><Verdict verdict="HOLD" /><p>Nothing proves it wrong, but it can’t move yet. It names what is missing: the <b>callback</b>, <b>evidence</b>, or both.</p></div>
        <div><Verdict verdict="CLEAR" /><p>Nothing that controls where money or cargo goes has changed, or the trusted contact confirmed it and every required check passed.</p></div>
      </div>
      <h2 id="example">One decision, end to end</h2>
      <p>On 24 November a copper seller’s genuine logistics contact asked to release cargo at Rotterdam to a new pickup agent, PAO Sovcomflot. The sender was authorized, so the record raised only a hold for a callback. Triad bought registry and sanctions checks on the new party. Telegraph’s ranked sanctions answer said “no match”. OFAC’s SDN list has it as entry 34741, so Triad blocked the release and recorded which source had missed it, for six paid checks.</p>
      <p><Link href="/evidence/0x7f83957f16dea1bb5b15c002f408ef5c4317a04bcaf1c126e1129c9174dea93d">Open that stop note, {noteSerial('0x7f83957f16dea1bb5b15c002f408ef5c4317a04bcaf1c126e1129c9174dea93d')} →</Link></p>
    </>
  );
}

function Check() {
  return (
    <>
      <h1>Check a payment change</h1>
      <p className={s.lead}>The everyday product. Enter who you pay as you had it before the email, paste the email, and say what it asks to change. Triad tells you what to do next.</p>
      <p><Link href="/check">Open the check →</Link></p>
      <h2 id="fields">What you enter</h2>
      <KV rows={[
        ['Who you pay', 'Legal name, country and web domain, plus a registration ID if you have one.'],
        ['The account you pay today', 'Holder and account number from your records, not from the email.'],
        ['The contact you’d call', 'Name, email and phone you had before this email arrived.'],
        ['The email', 'Display name, sender address and the message.'],
        ['What it asks to change', 'A new bank account, a new pickup agent, or nothing at all.'],
        ['Amount (optional)', 'Shown beside the decision as what is at stake.'],
      ]} />
      <h2 id="what-happens">What happens</h2>
      <ol>
        <li><b>As you type</b>, Triad shows which rules the email alone already triggers and exactly which checks it would buy.</li>
        <li><b>Check it</b> buys those checks through Telegraph. Answers stream in as each one lands.</li>
        <li><b>The answer</b> is a decision and a headline in plain words, with next steps: don’t pay and why, call this contact on this number, or pay as agreed.</li>
        <li><b>Record the call.</b> When Triad holds for a callback, say whether the contact confirmed or denied the change. The decision updates on the same paid answers, and nothing is bought again.</li>
      </ol>
      <h2 id="after">After the decision</h2>
      <ul>
        <li><b>Download the note</b> saves its evidence file. Drop it on <Link href="/evidence">/evidence</Link> to re-check its hash and Triad’s signature in your browser.</li>
        <li><b>Share</b> publishes that one decision at a permalink. Nothing is public until you press it.</li>
        <li><b>Retry</b> appears when a required check failed because a source was down; it re-buys only that check.</li>
      </ul>
      <Callout title="Cost">Free in the browser. Triad pays for the checks in test USDC, and a block from the email alone buys nothing. Nothing is ever paid out from a check.</Callout>
    </>
  );
}

function AttackLab() {
  return (
    <>
      <h1>The attack lab</h1>
      <p className={s.lead}>For trying to beat it. Every one of the forty benchmark cases is here, editable, with a real escrow release at the end.</p>
      <p><Link href="/console">Open the attack lab →</Link></p>
      <ol>
        <li><b>Open a case.</b> Choose any of the forty, or a showcase run, and rewrite the email or the change it asks for.</li>
        <li><b>Apply the attacker’s moves.</b> One click each: a look-alike domain, free mail with a copied name, a Reply-To diversion, paying another company, a sanctioned pickup agent or tanker.</li>
        <li><b>Run it live</b> to buy the checks through Telegraph, or <b>replay</b> a recorded run for free.</li>
        <li><b>Answer the call.</b> When Triad holds for a callback, you are the person on the trusted line. Confirm or deny, and watch the decision change.</li>
        <li><b>Release it.</b> On CLEAR, the lab funds a fresh escrow on Ethereum Sepolia with 0.01 test USDC and releases it against that evidence file. Put your own Sepolia address in the payout: if you get it past Triad, the escrow pays you.</li>
      </ol>
    </>
  );
}

function Extension() {
  return (
    <>
      <h1>Gmail and Outlook</h1>
      <p className={s.lead}>Check a payment-change email where it arrives. Open it in Gmail or Outlook on the web, click Triad’s icon, and the check opens filled in.</p>
      <h2 id="privacy">What it can see</h2>
      <ul>
        <li><b>Only what you click.</b> It uses <code>activeTab</code>, so it reads a mail page only after you click its icon.</li>
        <li><b>Your suppliers stay in your browser.</b> Their domain, the account you pay and the contact you’d call live in the extension’s local storage. Triad never stores them.</li>
        <li><b>Nothing is sent until you press “Check it”.</b> The email reaches Triad’s page in the URL fragment, which browsers never send to a server.</li>
      </ul>
      <h2 id="install">Install</h2>
      <KV rows={[
        ['Chrome, Edge or Brave', <>Open <code>chrome://extensions</code>, turn on Developer mode, choose <b>Load unpacked</b> and select <code>apps/extension</code>.</>],
        ['Firefox', <>Open <code>about:debugging#/runtime/this-firefox</code>, choose <b>Load Temporary Add-on</b> and select <code>apps/extension/manifest.json</code>.</>],
      ]} />
      <p>Then open the extension’s options and add the suppliers you pay.</p>
    </>
  );
}

function Agents() {
  return (
    <>
      <h1>Agent API</h1>
      <p className={s.lead}>One endpoint takes the same fields as the page and returns the decision, the next steps in plain words, and the signed evidence file.</p>
      <Code>{`curl -s ${APP}/api/v1/check -H 'content-type: application/json' -d '{
  "supplier": {"legalName": "GLENCORE INTERNATIONAL AG", "country": "CH", "domain": "glencore.com"},
  "account":  {"holder": "GLENCORE INTERNATIONAL AG", "number": "CH9300762011623852957"},
  "contact":  {"name": "Glencore Treasury Desk", "email": "treasury.desk@glencore.com", "phone": "+41410001005"},
  "email":    {"fromName": "Glencore Treasury Desk", "from": "treasury.desk@glencor.com", "message": "Our bank account has changed."},
  "change":   {"kind": "payout", "holder": "GLENCORE INTERNATIONAL AG", "number": "CH5604835012345678009"}
}'`}</Code>
      <p><code>change.kind</code> is <code>payout</code> (with <code>holder</code> and <code>number</code>), <code>pickup</code> (with <code>legalName</code> and <code>country</code>) or <code>none</code>.</p>
      <h2 id="response">The answer</h2>
      <KV rows={[
        [<code key="d">decision</code>, <>CLEAR, HOLD or BLOCK.</>],
        [<code key="h">headline</code>, 'One sentence: what to do, and why.'],
        [<code key="n">nextSteps</code>, 'What to do next, in order.'],
        [<code key="ne">needs</code>, 'For a HOLD: callback, evidence, or both.'],
        [<code key="r">rules</code>, 'Each rule that fired, with its effect and the reason.'],
        [<code key="c">callbackTarget</code>, 'Who to call and on which number from the record.'],
        [<code key="e">evidence</code>, <>The full evidence file, with <code>evidence_sha256</code> and Triad’s <code>attestation</code>.</>],
        [<code key="b">billing</code>, 'Whether this check was free, or the settled x402 transaction.'],
      ]} />
      <h2 id="pricing">Free, then $0.05 over x402</h2>
      <p>Each address gets <b>5 free checks a day</b>, and at most 30 an hour. After that, a check costs <b>$0.05 in devnet USDC over x402 on Solana</b>:</p>
      <ol>
        <li>The endpoint answers <code>402</code> with the terms in the <code>PAYMENT-REQUIRED</code> header: amount, asset, network and payee.</li>
        <li>Your x402 client signs the payment and sends the same request again with a <code>PAYMENT-SIGNATURE</code> header.</li>
        <li>Triad verifies the payment, runs the check, and settles through the public x402 facilitator only after a decision was made. The settlement comes back in <code>PAYMENT-RESPONSE</code>. A check that fails is not charged.</li>
      </ol>
      {sales()[0] && <p>The first paid check settled on {new Date(sales()[0]!.at).toUTCString().slice(5, 16)}: {ext(sales()[0]!.explorer, 'see the transaction')}. The buyer was our own test wallet.</p>}
    </>
  );
}

function Mcp() {
  return (
    <>
      <h1>MCP server</h1>
      <p className={s.lead}>Gives any MCP client four tools over the same API, and pays the x402 price by itself once the free allowance is used.</p>
      <KV rows={[
        [<code key="1">check_payment_change</code>, 'Runs a check and returns the decision, next steps and evidence hash.'],
        [<code key="2">record_callback_answer</code>, 'Records whether the trusted contact confirmed or denied the change, and returns the new decision.'],
        [<code key="3">share_decision</code>, 'Publishes one decision at a permalink, only with its owner’s consent.'],
        [<code key="4">verify_evidence</code>, 'Recomputes an evidence file’s hash, checks its receipts, and recovers who signed it.'],
      ]} />
      <Code>{`pnpm --filter @triad/mcp start

# in your MCP client's configuration
{ "mcpServers": { "triad": {
    "command": "pnpm",
    "args": ["--dir", "/path/to/triad", "--filter", "@triad/mcp", "start"],
    "env": { "TRIAD_URL": "${APP}" } } } }`}</Code>
      <p>To let it pay, set <code>TRIAD_PAYER_KEYFILE</code> to a Solana devnet keypair holding devnet USDC. It caps every payment at 0.10 USDC. <code>SOLANA_RPC_URL</code> picks the RPC it uses.</p>
    </>
  );
}

function Gates() {
  return (
    <>
      <h1>Gates</h1>
      <p className={s.lead}>One engine, a gate per kind of change. Each gate names what the change controls, what Triad buys for it, and the note it issues.</p>
      <p>The gate follows from what the instruction changes, not from what the email claims. An instruction that changes two things goes through both gates, and the stricter outcome wins.</p>
      {GATES.map((g) => (
        <section key={g.id}>
          <h2 id={g.id.toLowerCase()}><span className={s.accent}>{g.id}</span> {g.name}</h2>
          <p>{g.guards} Raises <code>{g.rule}</code>, so it never moves without a call to the trusted contact.</p>
          <KV rows={[
            ['Buys', g.buys.join(' · ')],
            ['Run it', <Link key="w" href={g.where.href}>{g.where.label}</Link>],
            ['Notes it issued', <span key="n">{g.examples.map((name) => bestDecision(name)).filter((d) => d !== null).map((d, i) => (
              <span key={d!.evidence_sha256}>{i > 0 && ' · '}<Link href={`/evidence/${d!.evidence_sha256}`}>{NOTE[d!.evidence.decision.decision].kind} {noteSerial(d!.evidence_sha256)}</Link></span>
            ))}</span>],
          ]} />
        </section>
      ))}
    </>
  );
}

function Policy() {
  const groups: [string, string, 'block' | 'hold_callback' | 'hold_evidence'][] = [
    ['Blocks', 'Evidence shows the instruction is wrong. Final, whatever else is true.', 'block'],
    ['Holds for a callback', 'Something that controls where money or cargo goes changed. The trusted contact must confirm it.', 'hold_callback'],
    ['Holds for evidence', 'A check the release depends on is missing, unbound or disputed. A phone call can’t fix these.', 'hold_evidence'],
  ];
  return (
    <>
      <h1>The policy</h1>
      <p className={s.lead}><code>{POLICY_VERSION}</code> is fixed and versioned, and its name is in every evidence file. The same inputs always give the same decision.</p>
      <p>Any block wins. Otherwise any hold wins, naming what is missing. A confirmed callback answers every “holds for a callback” rule at once, but never a “holds for evidence” one.</p>
      {groups.map(([title, text, effect]) => (
        <section key={effect}>
          <h2 id={effect}>{title}</h2>
          <p>{text}</p>
          <ul className={s.rules}>
            {Object.entries(RULES).filter(([rule]) => EFFECTS[rule] === effect).map(([rule, meaning]) => (
              <li key={rule}><code>{rule}</code><span>{meaning}</span></li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function Telegraph() {
  return (
    <>
      <h1>What it buys on Telegraph</h1>
      <p className={s.lead}>Triad buys only the checks a change makes relevant, so cost follows risk. Nothing changed means nothing bought.</p>
      <h2 id="intents">Intents, by change</h2>
      <KV rows={[
        ['New payee or account holder', <><code>CORPORATE_REGISTRY_LOOKUP_GENERAL</code>, <code>SANCTIONS_SCREENING_MATCH_GENERAL</code>, <code>VENDOR_VERIFY_GENERAL</code></>],
        ['Sender outside the trusted domain', <><code>B2B_IDENTITY_ENRICHMENT_GENERAL</code>, <code>EMAIL_SECURITY_GENERAL</code></>],
        ['New bank letter or document', <><code>DOCUMENT_AUTHENTICITY_GENERAL</code>, as optional evidence</>],
        ['New consignee or pickup agent', 'Registry and sanctions on the new party'],
        ['Anything that moves money or cargo', <>Sanctions on the carrying vessel, and <code>VESSEL_TELEMETRY_VERIFY_GENERAL</code></>],
      ]} />
      <h2 id="corroboration">One answer is not evidence</h2>
      <ul>
        <li><b>Two sources for every required check.</b> The first through ranked routing, the second from the highest-ranked other Miner for that Intent. Agreement becomes evidence; disagreement holds the release under <code>R-SOURCES-DISAGREE</code>, and both answers are shown.</li>
        <li><b>Sanctions also use the official list.</b> Names and vessel IMO numbers are matched against OFAC’s SDN list. A match blocks whatever the Miners said, and the evidence file records which Miner missed it.</li>
        <li><b>An answer must name what it is about.</b> A registry answer without a legal name or identifier is unbound: recorded, but it can’t satisfy a check.</li>
        <li><b>Optional checks</b> (vessel position, documents, company domain, mail records) take one source and only add facts or warnings.</li>
      </ul>
      <h2 id="paying">Paying for it</h2>
      <p>Triad pays per answer, on either rail: Telegraph’s escrow on Ethereum Sepolia, with one EIP-191 authorization per call, or x402 on Solana devnet, with one USDC transfer per call. Every call has a per-call cap and every run a total cap. Each answer keeps its receipt and its signal hash, which links to Telegraph’s own record at <code>/engine/v1/signal/&lt;hash&gt;</code>.</p>
    </>
  );
}

function Evidence() {
  return (
    <>
      <h1>Release notes</h1>
      <p className={s.lead}>Every decision is issued as a note named for what it lets happen: a <b>release note</b> for CLEAR, a <b>hold note</b> for HOLD, a <b>stop note</b> for BLOCK. Under each note is one evidence file, and the note’s hash is what the release officer signs and the escrow stores.</p>
      <h2 id="serial">The serial</h2>
      <p>A note’s serial is the start of its evidence hash: <code>{noteSerial('0x7f83957f16dea1bb5b15c002f408ef5c4317a04bcaf1c126e1129c9174dea93d')}</code> is the note whose hash begins <code>0x7f83957f</code>. Nothing assigns it: change the file and the serial changes with it. The serial is for people to quote; the full hash on the note is what to verify.</p>
      <h2 id="inside">The evidence under it</h2>
      <ul>
        <li>The record and the instruction, and the changes found between them.</li>
        <li>Every purchase: the request, the delivered answer, its Telegraph receipt and signal hash, the price and the latency.</li>
        <li>The OFAC snapshot’s hash and retrieval time.</li>
        <li>The rules that fired, the decision, what it needs, and who to call.</li>
        <li>After a call: the outcome, when it was recorded, and who answered.</li>
      </ul>
      <h2 id="hash">The hash</h2>
      <p>The file is canonical JSON: keys sorted and no insignificant whitespace, so the same content always gives the same bytes. Its SHA-256 is the file’s identity. Change one character and it no longer matches. Recording a call produces a new file with a new hash.</p>
      <h2 id="signature">The signature</h2>
      <p>Triad’s issuer key signs every file’s hash with EIP-191, over the message <code>Triad evidence file\n&lt;hash&gt;</code>. The signature travels beside the file, never inside it, so the hash doesn’t change. The signer is <code>0xE107c20e529d13b8ac6E1Bad05224664dc912dCf</code>.</p>
      <h2 id="verify">Verify one</h2>
      <KV rows={[
        ['In the browser', <>Drop the file on <Link key="v" href="/evidence">/evidence</Link>. The hash is recomputed with Web Crypto and the signer recovered; the file is never uploaded.</>],
        ['From an agent', <>The MCP tool <code key="t">verify_evidence</code>.</>],
        ['From the command line', <code key="c">pnpm -s triad verify &lt;evidence.json&gt;</code>],
        ['Anywhere else', 'Any EIP-191 library recovers the signer from the hash and the signature.'],
      ]} />
    </>
  );
}

function Settlement() {
  const evm = releases().find((r) => r.rail === 'sepolia');
  const svm = releases().find((r) => r.rail === 'solana-devnet');
  return (
    <>
      <h1>Escrows on two chains</h1>
      <p className={s.lead}>Triad holds a trade payment in escrow and releases it only against a signed authorization that names the payee, the amount and the evidence hash. Anything else reverts.</p>
      <table className={s.table}>
        <thead><tr><th /><th>Solana devnet</th><th>Ethereum Sepolia</th></tr></thead>
        <tbody>
          <tr><th>Paying Telegraph</th><td>x402, a USDC transfer per call</td><td>Escrow rail, an EIP-191 authorization per call</td></tr>
          <tr><th>Holding the payment</th><td><code>triad_escrow</code> (Anchor)</td><td><code>ShipmentEscrow</code> (Foundry, OpenZeppelin 5.6.1)</td></tr>
          <tr><th>Releasing it</th><td>ed25519 authorization, checked through instruction introspection</td><td>EIP-712 authorization, recovered on-chain</td></tr>
          <tr><th>Selling checks to agents</th><td>x402, $0.05 a check</td><td>–</td></tr>
          <tr><th>First release</th><td>{svm ? ext(svm.explorer, <code>{svm.transaction.slice(0, 10)}…</code>) : '–'}</td><td>{evm ? ext(evm.explorer, <code>{evm.transaction.slice(0, 10)}…</code>) : '–'}</td></tr>
        </tbody>
      </table>
      <p>Both escrows pay exactly what was signed or revert, release a shipment once, and refund the buyer after the deadline. The signed message is pinned by test vectors shared across TypeScript, Solidity and Rust.</p>
      <h2 id="solana">Why Solana</h2>
      <p>Triad answers use case 4 of Telegraph’s Solana brief, <i>Verified Global Trade &amp; Autonomous Commerce</i>: a buyer-to-supplier workflow where independent intelligence finds a material problem, correctly holds or escalates the payment, and settles when the conditions are met. On Solana, Triad buys every check over x402, settles the trade from its own escrow, and sells its checks to other agents over x402.</p>
    </>
  );
}

function Benchmark() {
  const report = benchmarkReport();
  const triad = report?.summary.find((x) => x.contestant === 'triad');
  const baseline = report?.summary.find((x) => x.contestant === 'baseline');
  const roi = roiReport();
  const lookalikes = lookalikeResults();
  return (
    <>
      <h1>Benchmark and results</h1>
      <p className={s.lead}>Forty cases were frozen and hashed before any paid run: twenty legitimate changes and twenty attacks. Then they ran live through Telegraph.</p>
      {triad && baseline && (
        <KV rows={[
          ['Attacks released', <><b>Triad {triad.attacksReleased.length} of {triad.attacks}</b> · registry-and-sanctions screen {baseline.attacksReleased.length} of {baseline.attacks}</>],
          ['Legitimate changes as expected', <>Triad {triad.legitimateAsExpected} of {triad.legitimate}</>],
          ...(roi ? [['Intelligence bought', `${roi.spend.answers} answers for ${roi.spend.usdc.toFixed(2)} test USDC`] as [ReactNode, ReactNode],
            ['Paper losses avoided vs the screen', `${money(roi.lossAvoidedVsBaselineUsd)}, at metal prices of ${roi.pricesAsOf}`] as [ReactNode, ReactNode]] : []),
        ]} />
      )}
      <p>The screen used the same paid answers as Triad, so the difference is what Triad does with them: the sender check, the second source, OFAC’s own list, and the call.</p>
      {lookalikes && (
        <>
          <h2 id="independent">An attack set we didn’t write</h2>
          <p>dnstwist generated {lookalikes.permutations.toLocaleString('en-US')} look-alikes of real supplier domains. None cleared. With the contact’s name copied, every one was blocked; on the domain alone, {lookalikes.neutralName.total.BLOCK!.toLocaleString('en-US')} were blocked and the rest held for a call.</p>
        </>
      )}
      <p><Link href="/benchmark">Every case, answer and evidence file →</Link></p>
    </>
  );
}

function Ledger() {
  return (
    <>
      <h1>The public ledger</h1>
      <p className={s.lead}>Every decision the app makes appears on <Link href="/ledger">/ledger</Link>, so anyone can count what Triad does without trusting a dashboard.</p>
      <KV rows={[
        ['What it shows', 'The decision, the rules that fired, what was bought and what it cost, when, where it was made, and the evidence hash.'],
        ['What it never shows', 'Names, emails, phone numbers or account numbers.'],
        ['Full evidence', 'Public only when its owner presses Share, which gives it a permalink.'],
      ]} />
    </>
  );
}

function Limits() {
  return (
    <>
      <h1>Limits and FAQ</h1>
      <h2 id="limits">What it doesn’t do</h2>
      <ul>
        <li><b>It doesn’t prove a counterparty is honest.</b> It shows whether a changed instruction is backed by the record, independent sources and the trusted contact.</li>
        <li><b>Telegraph answers can be wrong.</b> That is why required checks need two sources and sanctions are anchored on the official list. Triad doesn’t re-verify sources beyond that.</li>
        <li><b>It can’t hear the call.</b> It tells you whom to call and on which number. The evidence file records the answer you entered and who answered.</li>
        <li><b>Testnets only:</b> Ethereum Sepolia and Solana devnet, test USDC. Attack-lab releases are scaled to 0.01 test USDC.</li>
      </ul>
      <h2 id="faq">Questions</h2>
      <dl className={s.faq}>
        <dt>Why not just screen the company?</dt>
        <dd>Because the company is real. In the benchmark a registry-and-sanctions screen on the same paid answers released 11 of 20 attacks.</dd>
        <dt>Why a phone call?</dt>
        <dd>A hijacked mailbox can confirm anything. A number you had before the email is the one channel the attacker doesn’t control.</dd>
        <dt>What if a source is down?</dt>
        <dd>The required check is missing, so the decision holds for evidence. Retry re-buys only that check.</dd>
        <dt>Does Triad keep my data?</dt>
        <dd>Only the redacted ledger entry, unless you press Share. The extension keeps your suppliers in your own browser.</dd>
      </dl>
    </>
  );
}

function SelfHosting() {
  return (
    <>
      <h1>Run it yourself</h1>
      <p className={s.lead}>Node 22 and pnpm 10. Every page works without keys; live runs need testnet keys and a Telegraph balance.</p>
      <Code>{`pnpm install
pnpm check                      # typecheck and test every package
pnpm web                        # sync the public record into the app and start it on :3000
(cd contracts/evm && forge test)
(cd programs/solana && anchor build && cargo test)`}</Code>
      <h2 id="keys">Keys and settings</h2>
      <KV rows={[
        [<code key="1">TRIAD_EVM_OPERATOR_KEY</code>, 'Pays Telegraph and funds escrows on Sepolia.'],
        [<code key="2">TRIAD_EVM_RELEASE_OFFICER_KEY</code>, 'Signs release authorizations.'],
        [<code key="3">TRIAD_EVM_ISSUER_KEY</code>, 'Signs evidence hashes.'],
        [<code key="4">TRIAD_SEAL_SECRET</code>, 'Seals issued results so a callback can’t be forged.'],
        [<code key="5">BLOB_READ_WRITE_TOKEN</code>, 'The ledger and share permalinks, on Vercel.'],
        [<code key="6">TRIAD_X402_PAY_TO</code>, 'Where agents’ x402 payments go.'],
        [<code key="7">TELEGRAPH_DNS=google</code>, 'If your resolver can’t reach Telegraph’s node.'],
      ]} />
      <p>Locally, <code>pnpm keys</code> writes owner-only key files to <code>.secrets/</code>, and <code>pnpm telegraph:deposit</code> funds Triad’s Telegraph escrow.</p>
      <h2 id="repo">Repository</h2>
      <Code>{`apps/web            the check, attack lab, ledger, evidence viewer, benchmark and these docs
apps/cli            triad decide | verify | fund | release
apps/mcp            the MCP server for agents
apps/extension      the Gmail and Outlook extension
packages/           core · intel · evidence · settle
contracts/evm       ShipmentEscrow (Foundry)
programs/solana     triad_escrow (Anchor)
benchmark/          triad-v1 frozen cases and results; the independent look-alike set`}</Code>
    </>
  );
}

export const CONTENT: Record<string, () => React.JSX.Element> = {
  '': Welcome, 'how-it-works': HowItWorks, check: Check, 'attack-lab': AttackLab, extension: Extension, agents: Agents, mcp: Mcp,
  gates: Gates, policy: Policy, telegraph: Telegraph, evidence: Evidence, settlement: Settlement, benchmark: Benchmark, ledger: Ledger, limits: Limits, 'self-hosting': SelfHosting,
};
