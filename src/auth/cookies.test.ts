import { describe, expect, it } from 'vitest';
import {
  AUTH_STORAGE_KEY,
  CHUNK_LIMIT,
  cookieAttributes,
  createCookieStorage,
  isAzatGamesHost,
  type CookieJar,
} from './cookies';

function memoryJar(): CookieJar & { writes: string[] } {
  const jar = new Map<string, string>();
  const writes: string[] = [];
  const doc = {
    writes,
    get cookie(): string {
      const parts: string[] = [];
      for (const name of jar.keys()) parts.push(name + '=' + (jar.get(name) || ''));
      return parts.join('; ');
    },
    set cookie(assignment: string) {
      writes.push(assignment);
      const bits = assignment.split(';');
      const first = bits[0];
      const eq = first.indexOf('=');
      const name = first.slice(0, eq).trim();
      const value = first.slice(eq + 1);
      let maxAge: string | null = null;
      for (let i = 1; i < bits.length; i += 1) {
        const part = bits[i].trim();
        const lower = part.toLowerCase();
        if (lower.indexOf('max-age=') === 0) maxAge = part.slice('max-age='.length);
      }
      if (maxAge === '0') jar.delete(name);
      else jar.set(name, value);
    },
  };
  return doc;
}

describe('cookie storage', () => {
  it('round-trips a chunked value, including a split escape', () => {
    const doc = memoryJar();
    const storage = createCookieStorage(doc, { hostname: 'cryptogram.azat.games', protocol: 'https:' });
    const value = 'caf\u00e9-' + 'a'.repeat(CHUNK_LIMIT);
    expect(encodeURIComponent(value).length).toBeGreaterThan(CHUNK_LIMIT);
    storage.setItem(AUTH_STORAGE_KEY, value);
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBe(value);
    expect(doc.cookie.indexOf(AUTH_STORAGE_KEY + '.0=')).toBeGreaterThan(-1);
    expect(doc.cookie.indexOf(AUTH_STORAGE_KEY + '.1=')).toBeGreaterThan(-1);
    expect(doc.cookie.indexOf(AUTH_STORAGE_KEY + '=')).toBe(-1);
  });

  it('prefers a stale single cookie over chunks until setItem clears it', () => {
    const doc = memoryJar();
    const storage = createCookieStorage(doc, { hostname: 'localhost', protocol: 'http:' });
    doc.cookie = AUTH_STORAGE_KEY + '=' + encodeURIComponent('stale') + '; Path=/; Max-Age=34560000; SameSite=Lax';
    doc.cookie = AUTH_STORAGE_KEY + '.0=' + encodeURIComponent('chunks') + '; Path=/; Max-Age=34560000; SameSite=Lax';
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBe('stale');
    const replacement = 'n'.repeat(CHUNK_LIMIT + 5);
    storage.setItem(AUTH_STORAGE_KEY, replacement);
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBe(replacement);
    expect(doc.cookie.indexOf(AUTH_STORAGE_KEY + '=')).toBe(-1);
  });

  it('clears orphan chunks when a later value fits in one cookie', () => {
    const doc = memoryJar();
    const storage = createCookieStorage(doc, { hostname: 'localhost', protocol: 'http:' });
    storage.setItem(AUTH_STORAGE_KEY, 'q'.repeat(CHUNK_LIMIT + 20));
    expect(doc.cookie.indexOf(AUTH_STORAGE_KEY + '.0=')).toBeGreaterThan(-1);
    storage.setItem(AUTH_STORAGE_KEY, 'short');
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBe('short');
    expect(doc.cookie.indexOf(AUTH_STORAGE_KEY + '.0=')).toBe(-1);
    expect(doc.cookie.indexOf(AUTH_STORAGE_KEY + '.1=')).toBe(-1);
    storage.removeItem(AUTH_STORAGE_KEY);
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it('adds the parent domain only on azat.games hosts, and Secure only on https', () => {
    expect(isAzatGamesHost('azat.games')).toBe(true);
    expect(isAzatGamesHost('cryptogram.azat.games')).toBe(true);
    expect(isAzatGamesHost('login.azat.games')).toBe(true);
    expect(isAzatGamesHost('localhost')).toBe(false);
    expect(isAzatGamesHost('notazat.games')).toBe(false);
    expect(isAzatGamesHost('azat.games.evil.com')).toBe(false);
    expect(isAzatGamesHost('foo..azat.games')).toBe(false);

    const onHub = cookieAttributes({ hostname: 'cryptogram.azat.games', protocol: 'https:' }, '34560000');
    expect(onHub).toBe('Path=/; Max-Age=34560000; SameSite=Lax; Secure; Domain=.azat.games');
    const onApex = cookieAttributes({ hostname: 'azat.games', protocol: 'https:' }, '34560000');
    expect(onApex.indexOf('Domain=.azat.games')).toBeGreaterThan(-1);
    const local = cookieAttributes({ hostname: 'localhost', protocol: 'http:' }, '34560000');
    expect(local).toBe('Path=/; Max-Age=34560000; SameSite=Lax');
    expect(local.indexOf('Secure')).toBe(-1);
    expect(local.indexOf('Domain=')).toBe(-1);
  });
});
