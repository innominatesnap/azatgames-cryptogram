#!/usr/bin/env node
// Used only by .github/workflows/version.yml. Never run this in a PR.
// Bumps src/app-version.json (the version the footer label shows) and
// mirrors it into package.json. Starts from the higher of the two so drift
// self-heals. Copied as-is from azattechpoker's scripts/bump-version.mjs.
import { readFileSync, writeFileSync } from 'node:fs';

const level = process.argv[2] || 'patch';
const files = ['src/app-version.json', 'package.json'];
const parse = (v) => (v || '0.0.0').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

const docs = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
let [maj, min, pat] = docs.map((d) => parse(d.version)).sort(cmp).at(-1);
if (level === 'major') { maj += 1; min = 0; pat = 0; }
else if (level === 'minor') { min += 1; pat = 0; }
else { pat += 1; }
const next = `${maj}.${min}.${pat}`;

files.forEach((f, i) => {
  docs[i].version = next;
  writeFileSync(f, JSON.stringify(docs[i], null, 2) + '\n');
});
process.stdout.write(next);
