# Triad benchmark v1

Forty cases, frozen and hashed on 25 November 2026 at 05:38 UTC before any paid run ([manifest](manifest.json), `scenarios.jsonl` sha256 `24209f06…3f8f`). Twenty are legitimate changes and twenty are attacks. The sellers are real companies with their real LEIs; the people, mailboxes, phone numbers and accounts are synthetic. Every contestant sees the same case, and none is told which cases are attacks.

**Scoring:** an attack counts as released if a contestant would pay or release it (Triad `CLEAR`, a baseline or model `RELEASE`). Legitimate changes are scored against their expected decision.

## Results (Triad and the baseline, run 25 November 2026)

| Contestant | Attacks released | Attacks stopped | Legitimate as expected | Legitimate blocked |
| --- | --- | --- | --- | --- |
| **Triad** | **0 of 20** | 20 of 20 | 19 of 20 | 0 |
| Registry and sanctions baseline | **11 of 20** | 9 of 20 | 16 of 20 | 2 |
| Frontier model (Gemini 4 Hydrogen) | running: free-tier quota of 20 requests a day | | | |

- **What was bought:** Triad bought 208 answers through Telegraph for 2.08 test USDC, all paid per call over x402 on Solana devnet. The median decision that bought checks took 30 seconds; the slowest took 45 seconds.
- **Where the evidence is:** every Triad verdict has its evidence file in [`evidence/`](evidence), with a receipt and signal hash for each paid answer.
- **Where the scores are:** the per-case journal is [`results.jsonl`](results.jsonl), and the graded tables are [`report.md`](report.md) and [`report.json`](report.json).

The baseline is what a typical integration does with the same paid answers: screen the parties through the registry and the sanctions list, trust the first (ranked) answer, and pay if both pass. It never looks at who sent the instruction.

## What the run showed

- **Attacks on the instruction pass a registry-and-sanctions screen.** The company is real, so its screens pass. The baseline released three of the four look-alike domains, the display-name spoof, the Reply-To diversion, three of the four compromised mailboxes, an "affiliate" payee, the forged bank letter and the steered callback. Triad blocked the senders from the email alone and held every changed payment for a callback to the number on record.
- **A ranked sanctions answer flagged a real company.** For Boliden AB (LEI 21380059QU7IM1ONDJ56), Telegraph's ranked sanctions Miner (ChainSight) returned a match. The entity it matched was a different company, "Zakrytoe Aktsionernoe Obshchestvo Nauchno Vnedrencheskoe Predpriyatie Bolid". The baseline trusted it and blocked two genuine Boliden payments. Its "stops" of three Boliden attacks came from the same wrong match, as did the unrelated-domain attack, which is also against Boliden.
- **How Triad handled the false match.** The second Miner (TxLens) and OFAC's own list both said "no match", so Triad held the payment for review (`R-SOURCES-DISAGREE`) instead of blocking it. This is Triad's one legitimate case not cleared: the confirmed Boliden bank change, held because the sanctions sources disagreed.
- **The same Miner fails in both directions.** On 24 November the same ranked sanctions Miner said "no match" for PAO Sovcomflot, which is OFAC SDN entry 34741 ([decision](../../docs/results/decisions/2026-11-24T0625Z-pickup-swap-sanctioned.json)). One routed answer is not evidence for a decision that moves money.
- **The baseline caught the sanctioned agents by accident.** It stopped Sovcomflot, NITC and IRISL only because a registry Miner reported them "not active", not through any sanctions match. Triad blocked all three on OFAC's list.

## Infrastructure failures are not scored

A rate limit or an outage is not an answer. The runner records a case only when every required check got at least one delivered Telegraph answer; otherwise it stops, to resume later. One early attempt hit the Solana RPC's rate limit and bought nothing; it was discarded before grading, and the case was re-run.

## Reproduce

```sh
pnpm -s bench triad --rail solana --send   # or --rail sepolia; resumable, journaled
pnpm -s bench frontier --send              # needs FRONTIER_API_KEY and FRONTIER_MODEL
pnpm -s bench grade
```
