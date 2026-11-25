# Independent attack set: 12,585 look-alike domains from dnstwist

The frozen benchmark's attacks were written by the same team that wrote Triad's rules. This set wasn't. [dnstwist](https://github.com/elceef/dnstwist) is an open-source typosquatting generator that security teams use to find the domains phishers register. Version `20250130` generated every look-alike it knows for the five real seller domains in the benchmark: `antofagasta.co.uk`, `aurubis.com`, `boliden.com`, `fcx.com` and `glencore.com`.

The output was frozen and hashed before Triad decided any of it ([manifest](manifest.json), `permutations.jsonl` sha256 `503d627b…a9e2`). It covers 12,585 domains: homoglyphs (including internationalised names), insertions, omissions, transpositions, bit flips, hyphenation, TLD and subdomain tricks.

## What each domain sent

Each domain sent the benchmark's genuine bank-change instruction (a new payout account) from `treasury.desk@<look-alike>`, twice:

1. **Copying the trusted contact's display name**, as a real attacker would.
2. **Under a neutral name** ("Accounts Receivable"), which tests the domain check alone.

Nothing was bought. These are the decisions the email alone produces under policy `triad-release-v1`.

## Results

| Sender | BLOCK | HOLD for callback | CLEAR |
| --- | --- | --- | --- |
| Copied display name | **12,585 (100%)** | 0 | **0** |
| Neutral display name | **12,343 (98.1%)** | 242 (1.9%) | **0** |

- **No look-alike could clear.** A domain Triad doesn't recognise as an imitation is still outside the trusted domain, so the change waits for a callback to the number on record.
- **Copying the contact's name always blocks.** A display name that copies a trusted contact from an outside address is blocked (`R-DISPLAY-NAME-SPOOF`), whatever the domain.
- **The domain check alone blocks 98.1%:** by edit distance after folding common visual confusions (`rn`→`m`, `0`→`o`, `1`→`l`), by brand-inside-another-domain, and by treating any internationalised (punycode) sender as an imitation.

## What the domain check alone didn't recognise (242, all held for the callback)

- **Subdomain splits (21):** `ant.ofagasta.co.uk`, `anto.fagasta.co.uk`. The registrable domain becomes a different word.
- **Two-character transpositions (20):** `aruubis.com`, `aurbuis.com`.
- **Look-alikes of the three-letter `fcx.com` (about 80):** `fax.com`, `fcx1.com`, `fc.com`. On a three-letter name, one changed character is as likely to be a different company as an imitation, so the check stays silent rather than block real companies.
- **Multi-character visual swaps (118):** `aurudlis.com`, `auruclis.com`.

These are known limits of the domain check, reported as they are rather than tuned against this set after seeing it. They don't release money: the change still needs the trusted contact to confirm by phone.

## Reproduce

```sh
python3 -m venv .cache/venv && .cache/venv/bin/pip install dnstwist==20250130
.cache/venv/bin/python scripts/bench/lookalikes-generate.py   # regenerates the set; its sha256 must come out as 503d627b…a9e2
node --import tsx scripts/bench/lookalikes.ts                # decides every domain, writes results.json
```
