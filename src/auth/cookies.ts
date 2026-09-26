export const AUTH_STORAGE_KEY = 'sb-azat-auth-token';
export const COOKIE_MAX_AGE_SECONDS = '34560000';
export const CHUNK_LIMIT = 3000;

export type CookieJar = {
  cookie: string;
};

export type CookieLocation = {
  hostname: string;
  protocol: string;
};

export function stripTrailingDots(host: string): string {
  let end = host.length;
  while (end > 0 && host.charAt(end - 1) === '.') end -= 1;
  return host.slice(0, end);
}

export function isAzatGamesHost(hostname: string): boolean {
  const host = stripTrailingDots(hostname.toLowerCase());
  if (!host || host.indexOf('..') !== -1) return false;
  if (host === 'azat.games') return true;
  return host.endsWith('.azat.games');
}

export function cookieAttributes(location: CookieLocation, maxAge: string): string {
  const parts = ['Path=/', 'Max-Age=' + maxAge, 'SameSite=Lax'];
  if (location.protocol === 'https:') parts.push('Secure');
  if (isAzatGamesHost(location.hostname)) parts.push('Domain=.azat.games');
  return parts.join('; ');
}

export function readCookieMap(cookieHeader: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!cookieHeader) return map;
  const parts = cookieHeader.split('; ');
  for (const part of parts) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    map.set(part.slice(0, eq), part.slice(eq + 1));
  }
  return map;
}

function isChunkName(key: string, name: string): boolean {
  const prefix = key + '.';
  if (name.indexOf(prefix) !== 0) return false;
  const rest = name.slice(prefix.length);
  if (!rest) return false;
  for (let i = 0; i < rest.length; i += 1) {
    const ch = rest.charAt(i);
    if (ch < '0' || ch > '9') return false;
  }
  return true;
}

function writeCookie(doc: CookieJar, location: CookieLocation, name: string, value: string, remove: boolean): void {
  const maxAge = remove ? '0' : COOKIE_MAX_AGE_SECONDS;
  doc.cookie = name + '=' + value + '; ' + cookieAttributes(location, maxAge);
}

function clearKey(doc: CookieJar, location: CookieLocation, key: string): void {
  const map = readCookieMap(doc.cookie);
  const names: string[] = [];
  for (const name of map.keys()) {
    if (name === key || isChunkName(key, name)) names.push(name);
  }
  for (const name of names) writeCookie(doc, location, name, '', true);
}

export type CookieStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function createCookieStorage(doc: CookieJar, location: CookieLocation): CookieStorage {
  return {
    getItem(key: string): string | null {
      const map = readCookieMap(doc.cookie);
      if (map.has(key)) return decodeURIComponent(map.get(key) || '');
      let encoded = '';
      let found = false;
      for (let index = 0; ; index += 1) {
        const chunkKey = key + '.' + String(index);
        if (!map.has(chunkKey)) break;
        encoded += map.get(chunkKey) || '';
        found = true;
      }
      if (!found) return null;
      return decodeURIComponent(encoded);
    },
    setItem(key: string, value: string): void {
      clearKey(doc, location, key);
      const encoded = encodeURIComponent(value);
      if (encoded.length > CHUNK_LIMIT) {
        let index = 0;
        for (let start = 0; start < encoded.length; start += CHUNK_LIMIT) {
          writeCookie(doc, location, key + '.' + String(index), encoded.slice(start, start + CHUNK_LIMIT), false);
          index += 1;
        }
        return;
      }
      writeCookie(doc, location, key, encoded, false);
    },
    removeItem(key: string): void {
      clearKey(doc, location, key);
    },
  };
}

export function createAzatCookieStorage(): CookieStorage {
  return createCookieStorage(document, window.location);
}
