# Triad: design

Triad stops payment-redirection and cargo-release fraud in physical commodity trades. A supplier payment or a cargo release moves only when three independent witnesses agree:

1. **The record.** What the desk already trusted for this shipment: counterparties, payee and account, consignee, pickup party, vessel, ports, documents and the contacts allowed to change them.
2. **The network.** Independent checks bought through Telegraph about exactly what changed, each with a receipt.
3. **The person.** A callback to the contact the record already trusted, never to the one named in the new instruction.

The money then moves on-chain, on Ethereum Sepolia or Solana devnet. The escrow releases only against a signed authorization that names the evidence file.

## Why this problem

Business email compromise and payment-redirection fraud are the costliest fraud category in trade. The attack is rarely a fake company. It is a real counterparty whose instruction changes: new bank details on an invoice, a new pickup agent, a changed consignee. The change often comes from a lookalike domain, and sometimes from the genuine, compromised mailbox.

Registry and sanctions screening pass these attacks by design, because the company is real. Triad's claim is narrower and testable: **the company is real; the instruction isn't.** It treats every change to where money or cargo goes as unverified until all three witnesses agree. And no automated result alone, however clean, releases a changed payment instruction.

## The release decision

The decision engine (`packages/core`) is deterministic and has no I/O. Given the trusted record, the incoming instruction and the evidence, it returns one of:

| Decision | Meaning |
| --- | --- |
| `BLOCK` | Evidence shows the instruction is wrong: sanctions match, dissolved or unknown entity, invalid VAT, a sender domain that imitates the trusted one, a document judged forged, a vessel where the documents say it can't be |
| `HOLD` | Nothing proves it wrong, but it can't be released yet. It names what is needed: a **callback**, because money or cargo would go somewhere new or the sender isn't trusted, and/or **evidence**, because a required check is missing, unbound or disputed |
| `CLEAR` | Nothing that controls where money or cargo goes has changed, or the trusted contact confirmed the change and every required check passed |

Every decision records its **facts** (what a source established), **warnings** (what looks wrong) and **unknowns** (what could not be established) separately. Rules:

- **Missing evidence never produces `CLEAR`.** A provider outage, timeout, refusal or unreadable answer is an unknown, not a pass.
- **Wrong-entity answers are rejected.** Each answer must be about the entity Triad asked about: the name, registration identifier, VAT number or vessel identifier must match. An answer about someone else is a warning, never evidence.
- **A changed payee or account always needs the callback,** even when every check passes. A compromised genuine mailbox passes every automated check.
- **The callback goes to the trusted record's contact, out of band.** A phone number on the record beats any mailbox, because the whole mail domain may be compromised. Email is used only when it isn't the mailbox the instruction came from, and the new instruction's contact details are never used.
- **A confirmed callback resolves only "is this instruction genuine?"** It never stands in for a missing, unbound or disputed check.
- **Each rule is a named, versioned policy** (`policy: triad-release-v1`). Its rule identifiers appear in the decision and in the evidence file.

## What Triad buys, and when

Triad buys only the checks that the change makes relevant, so cost follows risk.

| Change | Intents bought (live schemas, captured 23 Nov 2026) |
| --- | --- |
| New beneficiary or payee entity | `CORPORATE_REGISTRY_LOOKUP_GENERAL` (company, jurisdiction: legal name, registration id, active), `SANCTIONS_SCREENING_MATCH_GENERAL` (name: matched, lists), `VENDOR_VERIFY_GENERAL` (vendor, VAT: valid, registered name) |
| Sender domain differs from the record | `B2B_IDENTITY_ENRICHMENT_GENERAL` (company: real web domain), `EMAIL_SECURITY_GENERAL` (domain, record type: MX/TXT lookup) |
| New bank letter or document | `DOCUMENT_AUTHENTICITY_GENERAL` (document: verdict, evidence), treated as optional evidence |
| Changed consignee or pickup party | Registry and sanctions on the new party |
| Any change to where money or cargo goes | `SANCTIONS_SCREENING_MATCH_GENERAL` on the carrying vessel, and `VESSEL_TELEMETRY_VERIFY_GENERAL` (vessel: position, speed, observed at) |

Every purchase records its request, delivered answer, field statuses, signal hash, receipt, price and latency.

## Corroboration

One routed answer is not evidence for a check the release depends on. On 24 Nov, Telegraph's ranked sanctions answer cleared PAO Sovcomflot, which is OFAC SDN entry 34741 ([readiness](results/readiness-2026-11-23/README.md)). The ranked registry answer said "active" without naming the company. So:

- **Required checks get two independent sources.** The first comes through ranked routing. The second is the highest-ranked other Miner for that Intent, asked by routing ID. Answers that agree become evidence; answers that disagree hold the release (`R-SOURCES-DISAGREE`) and both are shown.
- **Sanctions also use the official list.** Triad matches names and vessel IMO numbers against OFAC's SDN list, keeping the snapshot's hash and retrieval time. A match on the official list blocks, whatever the Miners said, and the evidence file records which Miner missed it.
- **An answer must name what it is about.** A registry answer without a legal name or identifier is `unbound`. It is recorded, but it can't satisfy a required check.
- **Optional checks** (vessel position, document authenticity, company domain, mail records) take one source and only add facts or warnings.

## Two chains, both ways

Triad supports Ethereum Sepolia and Solana devnet for **both** paying Telegraph and releasing the trade payment. A shipment chooses its rail, and the evidence file records it.

| | Ethereum Sepolia | Solana devnet |
| --- | --- | --- |
| Paying for checks | Telegraph escrow: deposit once, sign an EIP-191 authorization per call | x402 `exact`: a USDC `TransferChecked` per call, fee paid by Telegraph's facilitator (`@x402/svm`) |
| Holding the payment | `ShipmentEscrow` contract (Foundry), test USDC | `triad_escrow` program (Anchor), devnet USDC in a program-owned vault |
| Releasing it | EIP-712 `ReleaseAuthorization` verified on-chain | ed25519 authorization verified on-chain through the Ed25519 program and instruction introspection |

Both escrows enforce the same rules on-chain:
- **Exact payee.** The release pays exactly the payee and amount the authorization names.
- **Fresh authorization.** It is signed by the shipment's release officer, unexpired, and single-use (nonce).
- **Committed evidence.** It commits to the evidence file's hash.
- **Refund instead of release.** A held or blocked shipment can be refunded to the buyer after its deadline. It is never released without an authorization.

## The evidence file

Each decision produces an evidence file (`packages/evidence`):
- **Contents:** canonical JSON of the record, the instruction, every purchase with its receipt and signal hash, the decision with its rules, and the callback outcome.
- **Commitment:** the file is hashed, and the hash is what the release authorization signs and the escrow stores.
- **Checking it:** anyone can recompute the hash, check each receipt and signal hash against Telegraph, and match the on-chain release to the file. `triad verify <file>` does this without our servers.

## Proof

A frozen benchmark (`benchmark/`) is committed and hashed before any paid run. It has three contestants:

1. **Registry-and-sanctions baseline:** the common automated check, with the same purchases.
2. **A frontier model** given the same case file and asked whether to release.
3. **Triad.**

There are 40 scenarios (`benchmark/triad-v1`, frozen and hashed on 25 Nov before any paid run). The sellers are real companies with their real LEIs; people, mailboxes and accounts are synthetic. 20 are legitimate: settlement as agreed, bank, pickup-agent and consignee changes confirmed by the trusted contact, revised invoices, and bank changes still awaiting their callback (expected `HOLD`, not `BLOCK`). 20 are attacks:
- **Senders:** look-alike domains (a dropped letter, a changed ending, a homoglyph, the brand inside another domain), a display-name spoof from free mail, a Reply-To diversion, an unrelated domain.
- **Compromised genuine mailbox:** a bank change, an "affiliate" payee that isn't the seller, a forged bank letter, and a callback steered back through the same mailbox.
- **Cargo:** release to a sanctioned pickup agent or consignee (Sovcomflot, NITC, IRISL), and a substitute sanctioned tanker.

Metrics: attacks released (any contestant `CLEAR`/`RELEASE` on an attack), legitimate changes handled as expected, Triad's paid answers and test USDC spent, and latency.

Injected failures (a provider down, a wrong-entity answer, a payment failure) must never produce `CLEAR`.

## Architecture

```
apps/web            Next.js: the attack console, the callback step, on-chain release, the evidence viewer, the benchmark
apps/cli            triad decide | verify | fund | release
packages/core       domain model, change detection, release policy (pure, deterministic, runs in the browser too)
packages/intel      Telegraph purchases: plan, pay (escrow or x402), validate, bind to entity, OFAC SDN anchor
packages/settle     release on Sepolia (viem, EIP-712) and Solana (@solana/kit, ed25519)
packages/evidence   evidence file: canonical JSON, hash (Node and Web Crypto), verify, callback re-decision
contracts/evm       ShipmentEscrow (Foundry)
programs/solana     triad_escrow (Anchor)
benchmark           frozen scenarios, contestants, results
scripts/<group>     keys, deploy, ops, bench, web
```

The dependency direction is one-way: `core` depends on nothing; `intel`, `settle` and `evidence` depend on `core`; the apps compose them.

The web app keeps no database. The repository is the public record: evidence files, releases and the benchmark are synced into the app at build time, and the console's server is stateless. A live run returns its evidence file with an HMAC seal; the callback and release routes accept only evidence this server sealed (or that the repository records), so a caller can't bring its own answers. Every console run is a fresh shipment, scaled to 0.01 test USDC, so its escrow can be funded and released once.

## What Triad does not claim

- **It does not prove a counterparty is honest.** It shows whether a changed instruction is backed by the record, independent sources and the trusted contact.
- **Telegraph answers can be wrong.** Triad checks that each answer is about the right entity and treats disagreement as a warning. It does not re-verify sources itself.
- **Everything is on testnets,** with test USDC. Positions, trades and counterparties in the scenarios are synthetic unless stated, and the evidence file says which.
