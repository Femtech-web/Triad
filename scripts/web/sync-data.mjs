#!/usr/bin/env node
// Copies the public record the web app shows (evidence files, releases, deployments, the benchmark, the showcase
// scenarios and the OFAC snapshot) into apps/web/data,
// so the deployed app reads exactly what the repository holds. Run before building the app.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const out = resolve(root, 'apps/web/data');
rmSync(out, { recursive: true, force: true });
const copy = (from, to) => { if (existsSync(resolve(root, from))) { mkdirSync(resolve(out, to, '..'), { recursive: true }); cpSync(resolve(root, from), resolve(out, to), { recursive: true }); } };
copy('docs/results/decisions', 'decisions');
copy('docs/results/releases', 'releases');
copy('deployments', 'deployments');
copy('benchmark/triad-v1/scenarios.jsonl', 'benchmark/scenarios.jsonl');
copy('benchmark/triad-v1/manifest.json', 'benchmark/manifest.json');
copy('benchmark/triad-v1/report.json', 'benchmark/report.json');
copy('benchmark/triad-v1/evidence', 'benchmark/evidence');
copy('benchmark/scenarios', 'showcase');
// The console screens against this snapshot; its hash goes into every evidence file it issues.
copy('.cache/ofac', 'ofac');
const count = (dir) => (existsSync(resolve(out, dir)) ? readdirSync(resolve(out, dir)).length : 0);
console.log(`apps/web/data: ${count('decisions')} decisions, ${count('releases')} releases, ${count('benchmark/evidence')} benchmark evidence files`);
