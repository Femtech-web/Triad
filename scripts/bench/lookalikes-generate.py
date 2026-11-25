"""Independent attack set: every look-alike domain dnstwist generates for the benchmark's seller domains.

dnstwist is an open-source typosquatting generator used by security teams; Triad's authors wrote none of its rules.
The output is frozen and hashed here, before Triad decides any of it. Run with the pinned dnstwist (see manifest):
    .cache/venv/bin/python scripts/bench/lookalikes-generate.py
"""
import hashlib, json, pathlib, datetime
import dnstwist

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'benchmark/independent/lookalikes'
sellers = sorted({json.loads(l)['shipment']['seller']['domain'] for l in (ROOT / 'benchmark/triad-v1/scenarios.jsonl').read_text().splitlines() if l})

rows = []
for seller in sellers:
    fuzzer = dnstwist.Fuzzer(seller)
    fuzzer.generate()
    for d in fuzzer.domains:
        if d['fuzzer'] == '*original':
            continue
        unicode_domain = d['domain']
        try:
            ascii_domain = unicode_domain.encode('idna').decode('ascii')
        except UnicodeError:
            ascii_domain = None
        rows.append({'seller': seller, 'fuzzer': d['fuzzer'], 'domain': unicode_domain, 'ascii': ascii_domain})

rows.sort(key=lambda r: (r['seller'], r['fuzzer'], r['domain']))
text = ''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows)
(OUT / 'permutations.jsonl').write_text(text)
manifest = {
    'generator': 'dnstwist', 'version': dnstwist.__version__, 'sellers': sellers, 'permutations': len(rows),
    'permutationsSha256': hashlib.sha256(text.encode()).hexdigest(),
    'generatedAt': datetime.datetime.now(datetime.UTC).isoformat(timespec='seconds').replace('+00:00', 'Z'),
}
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(manifest, indent=2))
