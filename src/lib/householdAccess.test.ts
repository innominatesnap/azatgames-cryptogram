import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...filesUnder(path));
      continue;
    }
    if (/\.(ts|tsx|js|jsx)$/.test(name) && !name.endsWith('.test.ts')) out.push(path);
  }
  return out;
}

describe('household invite code', () => {
  it('is not read by client code', () => {
    const roots = [join(repoRoot, 'src')];
    const functionsDir = join(repoRoot, 'supabase', 'functions');
    if (existsSync(functionsDir)) roots.push(functionsDir);

    const patterns: { label: string; pattern: RegExp }[] = [
      { label: 'households table', pattern: /['"]households['"]/ },
      { label: 'embedded households', pattern: /households\s*\(/ },
      { label: 'invite_code', pattern: /invite_code/ },
      { label: 'inviteCode', pattern: /inviteCode/ },
      { label: 'household_invite_code', pattern: /household_invite_code/ },
    ];

    const hits: string[] = [];
    for (const root of roots) {
      for (const file of filesUnder(root)) {
        const text = readFileSync(file, 'utf8');
        for (const check of patterns) {
          if (check.pattern.test(text)) hits.push(`${file} matches ${check.label}`);
        }
      }
    }
    expect(hits).toEqual([]);
    expect(existsSync(functionsDir)).toBe(false);
  });

  it('keeps migration files distinct by md5', () => {
    const dir = join(repoRoot, 'supabase', 'migrations');
    const hashes = new Map<string, string>();
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.sql')) continue;
      const digest = createHash('md5').update(readFileSync(join(dir, name))).digest('hex');
      const prior = [...hashes.entries()].find(([, value]) => value === digest);
      expect(prior, `${name} duplicates ${prior?.[0] ?? ''}`).toBeUndefined();
      hashes.set(name, digest);
    }
    expect(hashes.has('20260926190000_cryptogram_invite_code_host_only.sql')).toBe(true);
    expect(hashes.size).toBe(4);
  });
});
