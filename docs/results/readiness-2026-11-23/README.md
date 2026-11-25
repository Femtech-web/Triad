# Readiness: the Intents Triad buys (23–24 Nov 2026)

Before writing Triad's purchase layer, we bought one real answer from each Intent it uses. Each was bought through Telegraph's ranked routing with no Miner named, and paid from the Sepolia escrow at 0.01 test USDC each. Raw answers, receipts and signal hashes are in [`paid-probes.jsonl`](paid-probes.jsonl). The live Intent definitions are in `intent-*.json`, and the ranking at capture time is in [`leaderboard.json`](leaderboard.json).

| Intent | Asked | Answered by | What came back | Usable as evidence? |
| --- | --- | --- | --- | --- |
| `CORPORATE_REGISTRY_LOOKUP_GENERAL` | Glencore International AG, Switzerland | LiveCert | `active: true`; legal name, registration id and jurisdiction `missing` | Not alone: it doesn't say which entity is active |
| `SANCTIONS_SCREENING_MATCH_GENERAL` | Glencore International AG | ChainSight | `matched: false`, lists `OFAC SDN` | Correct (not on the SDN list) |
| `SANCTIONS_SCREENING_MATCH_GENERAL` | PAO Sovcomflot | ChainSight | `matched: false` | **Wrong.** OFAC SDN entry 34741 is JOINT STOCK COMPANY SOVCOMFLOT (RUSSIA-EO14024, UKRAINE-EO13662) |
| `VENDOR_VERIFY_GENERAL` | Aurubis AG, DE118585036 | ChainSight | `vendor: "AG"`, `valid` missing | No |
| `B2B_IDENTITY_ENRICHMENT_GENERAL` | Glencore International AG | PREFLIGHT | `domain: glencore.com`, headquarters Baar | Yes |
| `EMAIL_SECURITY_GENERAL` | glencore.com, MX | TxLens | `lookup_ok: true` | Yes |
| `DOCUMENT_AUTHENTICITY_GENERAL` | A short bank confirmation letter (text) | PREFLIGHT | `Inconclusive`, with evidence (IBAN format valid, issuer unverifiable) | Yes, as optional evidence |
| `VESSEL_TELEMETRY_VERIFY_GENERAL` | IMO9811000 | PREFLIGHT | Every position field `missing` | No |

The official SDN list was checked from OFAC's `sdn.csv`, downloaded 24 Nov 2026 06:16 UTC (SHA-256 `89b2a6d6d825d3a0a5033c9d523ef8a5e05a0b766ccff1ad934aea7436da49b9`). The same file lists Sovcomflot's tankers by IMO number, for example NS ANTARCTIC (IMO 9413559).

## What this changes in Triad's design

1. **One routed answer is not evidence for a critical check.** For sanctions and the registry, Triad needs corroboration: a second Telegraph source that agrees, plus OFAC's official list for sanctions. When sources disagree, the release is held, with both answers shown.
2. **An answer must name what it is about.** A registry answer saying `active: true` without a legal name or identifier cannot be bound to the entity asked about. It is recorded as unconfirmed, and it never satisfies a required check alone.
3. **A missing field is not a pass.** VAT validity and vessel position came back `missing`. They become unknowns, as the policy already requires.
4. **Vessels are screened too.** Sanctioned tankers are listed by IMO, so the carrying vessel is part of the sanctions check.

Network note: on 24 Nov the local resolver returned unreachable addresses for `devnode.telegraphprotocol.com`. The probes used public DNS (`TELEGRAPH_DNS=google`). Answers, payments and TLS are unchanged. [`paid-probes-dns-failure.jsonl`](paid-probes-dns-failure.jsonl) keeps the failed first attempt, which was never charged.
