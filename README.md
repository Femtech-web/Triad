<div align="center">

# Triad

**The company is real. The instruction isn't.**

### A release gate for physical commodity trades: a supplier payment or a cargo release moves only when the record, independent checks bought through Telegraph, and the previously trusted contact agree.

[**Live app**](https://triad-five-steel.vercel.app) · [Check a payment](https://triad-five-steel.vercel.app/check) · [Judges, start here](#judges-start-here) · [Benchmark](benchmark/triad-v1) · [Design](docs/design.md) · [Evidence on record](docs/results)

![Tests](https://img.shields.io/badge/tests-45%20passing-2e9e6b)
![Benchmark](https://img.shields.io/badge/attacks%20released-0%2F20%20vs%20baseline%2011%2F20-c0392b)
![Chains](https://img.shields.io/badge/release-Ethereum%20Sepolia%20·%20Solana%20devnet-6b4fbb)
![Telegraph](https://img.shields.io/badge/Telegraph-7%20Intents%20·%20escrow%20and%20x402-555)

**Telegraph Hackathon Season II:** Apps & Agents · Mission 08

</div>

## Judges, start here

Everything below is free, and needs no wallet or login. Networks: Ethereum Sepolia and Solana devnet, test USDC.

| What | Run it | Check it | Inspect the request and payment | Break it | Reproduce it |
| --- | --- | --- | --- | --- | --- |
| **Payment check** | [`/check`](https://triad-five-steel.vercel.app/check): pick the example **Real mailbox, new account**, then **Check it**. Answers stream in as each paid check lands. You get HOLD; record "They didn't send it" and it becomes BLOCK | **Download evidence**, then drop the file on [`/evidence`](https://triad-five-steel.vercel.app/evidence): the hash and Triad's signature are re-checked in your browser | Every answer's signal hash links to Telegraph's own record of it (`/engine/v1/signal/<hash>`); the payer's ledger is linked on [`/ledger`](https://triad-five-steel.vercel.app/ledger) | Example **Look-alike domain**: BLOCK from the email alone, nothing bought | `pnpm check` |
| **Attack lab** | [`/console`](https://triad-five-steel.vercel.app/console): choose any of the 40 cases, then **Replay recorded run** (free) or **Run it live** | The evidence file under the decision | Receipts and signals per answer | Apply the **Attacker's moves**, or put your own Sepolia address in the payout and try to get paid | `pnpm -s triad decide benchmark/scenarios/pickup-swap-sanctioned.json` |
| **Benchmark** | [`/benchmark`](https://triad-five-steel.vercel.app/benchmark) | Each Triad verdict links to its evidence file | Each x402 payment's Solana transaction is in the file | [12,585 independent look-alikes](benchmark/independent/lookalikes/README.md), none cleared | `pnpm bench grade`, `pnpm bench:roi`, `pnpm bench:lookalikes` |
| **Agents** | `POST https://triad-five-steel.vercel.app/api/v1/check`: 5 free a day, then $0.05 over x402; or the [MCP server](apps/mcp) | The MCP tool `verify_evidence` | The `PAYMENT-REQUIRED` challenge, then the settlement in `PAYMENT-RESPONSE`; the [first sale on Solana devnet](https://explorer.solana.com/tx/mgsyaJcHqfVdhUu9bDBqmQdcBCJKSdAvTxTQkF8TSdrrGGXXCpYohHRC2BbMn4oVXxtHcrUnCdy7jBUhyS3wp6a?cluster=devnet) | Send a look-alike sender | `pnpm --filter @triad/mcp start`; buy one with `apps/mcp/src/try-paid.ts` |
| **Release on-chain** | An attack-lab CLEAR, then **Fund the escrow and release** (0.01 test USDC) | [Sepolia release](https://sepolia.etherscan.io/tx/0xd46048560cd6c9c2ca909c30258a5486144830ac354344f6180defcfbb93ce58), [Solana release](https://explorer.solana.com/tx/4DXdA22k8fzK8QCYMRa7UZooy86catQAoRDUBnFjeABF1MKoswHd2vVqjJXsiYonp2tnHKQcNf1cqvGFQxfEWJnV?cluster=devnet) | The signed authorization names the evidence hash; the escrow stores it | Change any signed field and the escrow reverts | `(cd contracts/evm && forge test)`, `(cd programs/solana && anchor build && cargo test)` |

## The problem

Payment-redirection fraud rarely fakes the supplier. It fakes the change: new bank details on an invoice, a new pickup agent at the discharge port, a substitute vessel. The change arrives from a look-alike domain, or from the supplier's genuine mailbox after it has been compromised.

Registry and sanctions screening pass these attacks by design, because the company is real. On 24 November, Telegraph's ranked sanctions answer said "no match" for PAO Sovcomflot, which is entry 34741 on OFAC's SDN list. A desk that trusted that one answer would have handed a copper cargo to a sanctioned shipping company.

## What Triad does

Every change to where money or cargo goes is unverified until three independent witnesses agree:

1. **The record.** What the desk already trusted for this shipment: payee and account, consignee, pickup agent, vessel, documents, and the contacts allowed to change them. Each instruction is compared with it field by field, and its sender with the trusted domain.
2. **The network.** Checks bought through Telegraph for exactly what changed (registry, sanctions, tax number, company domain, mail records, documents, vessel), so cost follows risk. Required checks get two independent Miners; sanctions are also matched against OFAC's own list; an answer that doesn't name the entity it is about can't satisfy a check.
3. **The person.** A callback to the contact the record already trusted, by phone where possible, never through the mailbox the change came from. A confirmation only answers "is this genuine?"; it never stands in for a missing check.

A fixed, versioned policy (`triad-release-v1`, 23 named rules) turns that into one of three decisions:

| Decision | Meaning |
| --- | --- |
| `BLOCK` | Evidence shows the instruction is wrong: a look-alike sender, a sanctions match, an inactive company, a forged document, a denied callback. Final. |
| `HOLD` | Nothing proves it wrong, but it can't move yet. It names what is missing: the **callback**, **evidence**, or both. |
| `CLEAR` | Nothing that controls where money or cargo goes has changed, or the trusted contact confirmed the change and every required check passed. |

Every decision ships with an **evidence file**: canonical JSON holding the record, the instruction, every purchase with its Telegraph receipt and signal hash, the OFAC snapshot hash, and the rules that fired. Its SHA-256 is what the release officer signs and the escrow stores, so the money can only move against the file.

## Money moves only against evidence

Triad holds the payment in an escrow on either chain and releases it only against a signed authorization that names the payee, the amount and the evidence hash.

| | Ethereum Sepolia | Solana devnet |
| --- | --- | --- |
| Paying Telegraph | Escrow deposit, EIP-191 authorization per call | x402 `exact`, a USDC transfer per call |
| Holding the payment | [`ShipmentEscrow`](contracts/evm/src/ShipmentEscrow.sol) (Foundry, OpenZeppelin 5.6.1), [0x3130…8d7eb](https://sepolia.etherscan.io/address/0x313060d737a2ba1f2eb5e62278a61286bff8d7eb), source [verified on Sourcify](https://repo.sourcify.dev/11155111/0x313060d737a2ba1F2eB5e62278A61286bFf8D7Eb) | [`triad_escrow`](programs/solana/programs/triad-escrow/src/lib.rs) (Anchor), program [`7hRAkLUZ…xz567`](https://explorer.solana.com/address/7hRAkLUZ2EMuFpsc3mtKfKnfxUJvcbgJqhWDShtxz567?cluster=devnet) |
| Releasing it | EIP-712 authorization recovered on-chain | ed25519 authorization checked through the Ed25519 program and instruction introspection |

Both escrows pay exactly what was signed or revert, release a shipment once, and refund the buyer after the deadline. The signed message is pinned by cross-language test vectors in TypeScript, Solidity and Rust.

**On record:**
- **Sepolia release:** the [release of shipment `shp-cu-0002`](https://sepolia.etherscan.io/tx/0xd46048560cd6c9c2ca909c30258a5486144830ac354344f6180defcfbb93ce58) paid 1 test USDC against evidence [`0x75ec263e…f00f09`](docs/results/decisions/2026-11-25T0507Z-release-on-schedule-sepolia.json).
- **Solana release:** the [release of shipment `shp-cu-0003`](https://explorer.solana.com/tx/4DXdA22k8fzK8QCYMRa7UZooy86catQAoRDUBnFjeABF1MKoswHd2vVqjJXsiYonp2tnHKQcNf1cqvGFQxfEWJnV?cluster=devnet) paid 1 devnet USDC against evidence [`0xd4585c2f…33e`](docs/results/decisions/2026-11-25T080415Z-release-on-schedule-solana.json). The escrow account now reads `Released` and stores that hash.
- **The Sovcomflot block:** [`0x7f83957f…dea93d`](docs/results/decisions/2026-11-24T0625Z-pickup-swap-sanctioned.json), 6 paid checks, records which source missed the match.

**Signed evidence.** Triad's issuer key `0xE107c20e529d13b8ac6E1Bad05224664dc912dCf` ([`deployments/issuer.json`](deployments/issuer.json)) signs every evidence file's hash (EIP-191, message `Triad evidence file\n<hash>`). The signature travels beside the file, never inside it, so the hash doesn't change. The evidence viewer, the MCP tool and any EIP-191 library recover the signer offline.

## The benchmark

We wrote both the cases and Triad's rules, so a perfect score on our own cases proves little by itself. The evidence that matters comes from elsewhere: a baseline that used the same paid answers, the errors Telegraph's own Miners made during the run, and an attack set generated by an independent tool.

**Forty frozen cases.** They were [frozen and hashed](benchmark/triad-v1/manifest.json) on 25 November, before any paid run (`sha256 24209f06…3f8f`).
- **Twenty legitimate changes.**
- **Twenty attacks:** look-alike domains, a display-name spoof, a Reply-To diversion, hijacked genuine mailboxes, an "affiliate" payee, a forged bank letter, a steered callback, and sanctioned agents, consignees and tankers.
- **Who is real:** the sellers are real companies with their real LEIs; people, mailboxes and accounts are synthetic.

Every contestant sees the same case, and none is told which are attacks:
- **Triad.**
- **Registry and sanctions:** what a typical integration does with the same paid answers. It trusts the first answer and never looks at the sender.
- **A frontier model** (Gemini 4 Hydrogen) as release officer, given the same record and instruction in plain words.

| Contestant | Attacks released | Legitimate handled as expected | Legitimate blocked |
| --- | --- | --- | --- |
| Registry and sanctions | **11 of 20** | 16 of 20 | 2 |
| **Triad** | **0 of 20** | 19 of 20 | 0 |
| Frontier model | running on a free quota of 20 requests a day | | |

**What the baseline missed.** Ten of its eleven releases came from the supplier's own hijacked domain or from look-alikes. Registry and sanctions checks pass those by design.

**What the network got wrong, live.** Telegraph's top-ranked sanctions Miner made two errors:
- It matched Boliden AB, a real Swedish miner, to a Russian company called "…Bolid". The baseline blocked two genuine payments on it. Triad's second Miner and OFAC's own list both said no match, so Triad held the payment for review instead. That is Triad's one legitimate case not cleared.
- PAO Sovcomflot, OFAC SDN entry 34741, got past both Miners Triad asked: each said "no match". Triad blocked it on OFAC's own list.

**An attack set we didn't write.** [dnstwist](https://github.com/elceef/dnstwist), an open-source typosquatting tool used by security teams, generated 12,585 look-alikes of the five sellers' real domains. They were frozen and hashed before Triad saw them.
- **Copying the trusted contact's name:** all were blocked.
- **The domain alone:** 98.1% were blocked; the other 242 were held for the callback.
- **None could clear.** See the [details and known limits](benchmark/independent/lookalikes/README.md).

**Intelligence P&L**, the measure Mission 08 asks for. The cargo is valued on paper at [dated reference prices](benchmark/triad-v1/prices.json), and the spend is testnet USDC:

| | Spent on intelligence | Attacks paid out (paper) | Genuine payments blocked | Genuine payments held |
| --- | --- | --- | --- | --- |
| Registry and sanctions | the same answers | **$210.3M** (11) | $5.3M (2) | none |
| **Triad** | **2.08 test USDC**, 208 answers over x402 on Solana devnet | **$0** | none | $1.8M (1, for review) |

Each test USDC of intelligence avoided about $101M of paper losses that the baseline would have paid. The median decision spent 0.007 USDC of checks per $1M of cargo and took 30 seconds.

Every verdict, answer and evidence file is in [`benchmark/triad-v1`](benchmark/triad-v1), with the findings in its [README](benchmark/triad-v1/README.md) and the P&L in [`roi.json`](benchmark/triad-v1/roi.json). Reproduce the P&L with `pnpm bench:roi` and the look-alike test with `pnpm bench:lookalikes`.

## Try it

Live at **https://triad-five-steel.vercel.app**, on testnets.

**[Check a payment change](https://triad-five-steel.vercel.app/check).** The everyday product: enter who you pay (as you had it before the email), paste the email you received, and say what it asks to change. Triad reacts as you type, showing which rules the email alone triggers and exactly which checks it would buy. Then it runs them and answers in plain words, with what to do next: don't pay and why, call this contact on the number you already had, or pay as agreed. Record the call's outcome and the decision updates on the same paid answers. A block from the email alone costs nothing; nothing is ever paid out from a check. Four examples load in one click.

**[The attack lab](https://triad-five-steel.vercel.app/console)** is for trying to beat it:

- **Open a case.** Choose any of the forty, or a showcase run, and rewrite the email or the change it asks for. The "attacker's moves" apply the benchmark's tricks in one click.
- **Run it live** to buy the checks through Telegraph, or **replay** a recorded run for free.
- **Answer the call.** When Triad holds for a callback, you are the person on the trusted line. Confirm or deny, and watch the decision change.
- **Release it.** When the decision is `CLEAR`, the lab funds a fresh escrow on Sepolia with 0.01 test USDC and releases it against that evidence file. Put your own Sepolia address in the payout and, if you get it past Triad, the escrow pays you.

**Verify any evidence file** in your browser: the viewer recomputes the SHA-256 from the canonical bytes with Web Crypto, and a dropped-in file is never uploaded.


**For agents.** `POST /api/v1/check` takes the same fields as the page and returns the verdict, the plain-language next steps, and the signed evidence file. Each address gets 5 free checks a day. After that, a check costs **$0.05 in devnet USDC over x402 on Solana**, settled through the public x402 facilitator only after a decision was made.
```sh
curl -s https://triad-five-steel.vercel.app/api/v1/check -H 'content-type: application/json' -d '{
  "supplier": {"legalName": "GLENCORE INTERNATIONAL AG", "country": "CH", "domain": "glencore.com"},
  "account":  {"holder": "GLENCORE INTERNATIONAL AG", "number": "CH9300762011623852957"},
  "contact":  {"name": "Glencore Treasury Desk", "email": "treasury.desk@glencore.com", "phone": "+41410001005"},
  "email":    {"fromName": "Glencore Treasury Desk", "from": "treasury.desk@glencor.com", "message": "Our bank account has changed."},
  "change":   {"kind": "payout", "holder": "GLENCORE INTERNATIONAL AG", "number": "CH5604835012345678009"}
}' | jq '{decision, headline, nextSteps}'
```
The [MCP server](apps/mcp) (`pnpm --filter @triad/mcp start`) gives an agent four tools: `check_payment_change`, `record_callback_answer`, `share_decision` and `verify_evidence`. With `TRIAD_PAYER_KEYFILE` set to a devnet keypair, it pays the x402 price itself once the free allowance is used.

**From your inbox.** The [browser extension](apps/extension), for Chrome and Firefox, reads the open email in Gmail or Outlook on the web, only when you click its icon. It matches the email to a supplier you saved, a list that stays in your browser, and opens the check filled in. The email travels in the URL fragment, which never reaches a server until you press "Check it".

**Every decision, in public.** [`/ledger`](https://triad-five-steel.vercel.app/ledger) lists every decision the app makes: the verdict, the rules that fired, what was bought, when, and the hash. It never shows names, emails, phone numbers or accounts. A full evidence file becomes public only when its owner presses **Share**, which gives it a permalink.

From the command line:

```sh
pnpm install
pnpm -s triad decide benchmark/scenarios/pickup-swap-sanctioned.json          # plan: the checks and their cost
pnpm -s triad decide benchmark/scenarios/pickup-swap-sanctioned.json --send   # buy them and decide
pnpm -s triad verify docs/results/decisions/2026-11-24T0625Z-pickup-swap-sanctioned.json
pnpm -s triad release <evidence.json> [--send]                               # pay a CLEAR decision on Sepolia
```

## Commercial summary

- **Who is it for?**
  - Physical commodity desks, and the treasury and operations teams who pay suppliers and release cargo on emailed instructions.
  - The banks that finance those trades.
  - Agents that run payables.
- **What does it improve?** "An email asked us to change something" becomes a decision with evidence:
  - the sender is compared with the record;
  - checks are bought only for what changed, two sources for anything that matters plus OFAC's own list;
  - a call goes to the contact you already knew;
  - only the signed evidence hash can release escrowed money.
- **What does it do today?** It runs live on testnets:
  - the web check, the attack lab, an agent API that sells checks over x402, an MCP server and a browser extension for Gmail and Outlook;
  - a public ledger of every decision;
  - releases on Ethereum Sepolia and Solana devnet.

  In the frozen benchmark it released 0 of 20 attacks, where a registry-and-sanctions screen released 11.
- **Why would someone adopt it?**
  - **Cost:** a check costs a few cents of intelligence, and the median paid decision spent 0.007 USDC per $1M of cargo.
  - **Defensible decisions:** each decision comes with an evidence file that an auditor, insurer or bank can verify without trusting Triad.
  - **Low friction:** it only slows down the changes that need slowing.
- **How can someone try it?**
  - In a browser, at [https://triad-five-steel.vercel.app/check](https://triad-five-steel.vercel.app/check).
  - From an email, with the [extension](apps/extension).
  - From an agent, through `POST /api/v1/check` or the [MCP server](apps/mcp).

### Status and updates

- **21 Nov:** claimed Mission 08 on [bounties#196](https://github.com/telegraphprotocol/bounties/issues/196) and posted the first progress update.
- **24 Nov:** the first live decision blocked PAO Sovcomflot, a sanctioned pickup agent that the ranked sanctions answer had missed. Progress posted on #196.
- **25 Nov:**
  - escrows deployed and released on both chains;
  - the 40-case benchmark graded;
  - the app published, with the intelligence P&L and the independent look-alike set.
- **25 Nov, later:**
  - the public ledger, share permalinks and signed evidence went live;
  - the first check sold to an agent over x402 for 0.05 devnet USDC, settled through the public x402 facilitator ([transaction](https://explorer.solana.com/tx/mgsyaJcHqfVdhUu9bDBqmQdcBCJKSdAvTxTQkF8TSdrrGGXXCpYohHRC2BbMn4oVXxtHcrUnCdy7jBUhyS3wp6a?cluster=devnet), [record](docs/results/x402-sales/2026-11-25T1253Z.json)). It was our own test wallet buying.
- **Adoption:** no independent use is confirmed yet. The [public ledger](https://triad-five-steel.vercel.app/ledger) counts every decision the app makes.

## How it works

```
instruction ──► change detection ──► plan: only what changed ──► Telegraph (2 Miners per required check) ─┐
   record ──────┘   sender vs trusted domain                     OFAC SDN snapshot for sanctions ─────────┤
                                                                                                          ▼
                    callback to the record's contact ◄── HOLD ◄── policy triad-release-v1 ──► BLOCK
                                    │                                     │
                                    └──── confirmed ─────────────────► CLEAR ──► evidence file ──► signed release ──► escrow
```

- **`packages/core`**: the domain model, look-alike and homoglyph domain comparison, change detection, the check plan and the policy. Pure and deterministic, so the console runs it in the browser for the pre-flight.
- **`packages/intel`**: buys checks on either rail with per-call and per-run caps, reads answers strictly, binds each to the entity asked about, corroborates required checks across Miners, and anchors sanctions on OFAC's list.
- **`packages/evidence`**: canonical JSON, the SHA-256 (Node and Web Crypto), verification, and the callback re-decision.
- **`packages/settle`**: release authorizations and escrow adapters for both chains.

The full design, including what Triad buys for each change, is in [docs/design.md](docs/design.md).

## Checked and attacked

- **Policy (16 tests):** look-alike and homoglyph domains, display-name spoofs, Reply-To diversions, payees that aren't the seller, substitute and sanctioned vessels, missing or wrong-entity evidence never clearing even after a confirmed callback, a confirmation through the sending mailbox not counting, and no out-of-band channel.
- **Purchases (8):** nothing signed for a wrong destination, network, resource or over-cap quote; receipts must match the signed payer and amount; answers that name no company are unbound; disagreeing sources hold; OFAC catches what a ranked answer missed, by alias and by IMO.
- **Evidence (4):** key-order independence, tamper detection, receipts required, Web Crypto and Node agree, and the callback re-decision (confirm clears, deny blocks, a block takes no callback).
- **Escrows (7 Foundry, 7 LiteSVM, 3 vectors):** the signed payee paid once, any change to a signed authorization refused, expired authorizations, funding once per shipment, refunds only by the buyer after the deadline and never after release, fuzzed payees, an ed25519 instruction that borrows its message from elsewhere, and the same signed message across all three languages.
- **Live:** the Sovcomflot block, a Sepolia release, and the console's live runs, callbacks and releases, all against Telegraph's testnet node.

## Limits

- **It does not prove a counterparty is honest.** It shows whether a changed instruction is backed by the record, independent sources and the trusted contact.
- **Telegraph answers can be wrong,** which is why required checks need two sources and sanctions are anchored on the official list. Triad doesn't re-verify sources beyond that.
- **The callback is recorded by you.** Triad tells you whom to call and on which number, but it can't hear the call; the evidence file records who answered and that the answer was entered in the app.
- **Testnets only:** Sepolia and Solana devnet, test USDC. Console runs are scaled to 0.01 test USDC.

## Run it from source

Node 22 and pnpm 10.

```sh
pnpm install
pnpm check                      # typecheck and test every package
pnpm web                        # sync the public record into the app and start it on :3000
(cd contracts/evm && forge test)
(cd programs/solana && anchor build && cargo test)
```

Live runs need testnet keys (`pnpm keys` writes owner-only files to `.secrets/`) and a Telegraph escrow balance (`pnpm telegraph:deposit --from .secrets/evm-operator.json --usdc 1 --send`). The web app reads its keys from `TRIAD_EVM_OPERATOR_KEY` and `TRIAD_EVM_RELEASE_OFFICER_KEY` when deployed, or from `.secrets/` locally. Without them it still serves every page and replays recorded runs. If your resolver can't reach Telegraph's node, set `TELEGRAPH_DNS=google`.

## Repository

```
apps/web            the payment check, attack lab, callback, release, evidence viewer and benchmark (Next.js)
apps/cli            triad decide | verify | fund | release
apps/mcp            the MCP server for agents
apps/extension      the Gmail and Outlook browser extension
packages/           core · intel · evidence · settle
contracts/evm       ShipmentEscrow (Foundry)
programs/solana     triad_escrow (Anchor)
benchmark/          triad-v1: frozen cases, manifest, results; showcase scenarios
docs/               design, readiness findings, decisions and releases on record
scripts/            keys, deploy, ops, bench, web
```
