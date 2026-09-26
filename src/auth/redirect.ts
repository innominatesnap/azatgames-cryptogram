import { stripTrailingDots } from './cookies';

export const HUB_LOGIN_URL = 'https://login.azat.games/login';
export const REDIRECT_COOLDOWN_MS = 20000;
export const REDIRECT_STAMP_KEY = 'cryptogram-hub-redirect-at';

export type SessionOutcome = 'session' | 'none' | 'timeout';

export type AuthDecision =
  | { action: 'stub' }
  | { action: 'ready' }
  | { action: 'redirect'; href: string }
  | { action: 'hold'; reason: 'timeout' | 'cooldown' | 'return-url' };

export function isReturnUrlAllowed(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  const host = stripTrailingDots(url.hostname.toLowerCase());
  if (!host || host.indexOf('..') !== -1) return false;
  if (host === 'azat.games') return false;
  if (!host.endsWith('.azat.games')) return false;
  return true;
}

export function playReturnUrl(pageHref: string): string {
  let url: URL;
  try {
    url = new URL(pageHref);
  } catch {
    return pageHref;
  }
  const path = url.pathname;
  const onPlay = path === '/play' || path.indexOf('/play/') === 0;
  if (!onPlay) {
    url.pathname = '/play';
    url.search = '';
    url.hash = '';
  }
  return url.origin + url.pathname + url.search + url.hash;
}

export function hubLoginUrl(returnTo: string): string {
  return HUB_LOGIN_URL + '?redirect_to=' + encodeURIComponent(playReturnUrl(returnTo));
}

export function readRedirectStamp(storage: { getItem(key: string): string | null }): number | null {
  const raw = storage.getItem(REDIRECT_STAMP_KEY);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return value;
}

export function cooldownActive(lastRedirectAt: number | null, now: number): boolean {
  if (lastRedirectAt === null) return false;
  return now - lastRedirectAt < REDIRECT_COOLDOWN_MS;
}

export function decideAuth(input: {
  configured: boolean;
  outcome: SessionOutcome;
  returnUrl: string;
  now: number;
  lastRedirectAt: number | null;
}): AuthDecision {
  if (!input.configured) return { action: 'stub' };
  if (input.outcome === 'timeout') return { action: 'hold', reason: 'timeout' };
  if (input.outcome === 'session') return { action: 'ready' };
  const returnUrl = playReturnUrl(input.returnUrl);
  if (!isReturnUrlAllowed(returnUrl)) return { action: 'hold', reason: 'return-url' };
  if (cooldownActive(input.lastRedirectAt, input.now)) return { action: 'hold', reason: 'cooldown' };
  return { action: 'redirect', href: hubLoginUrl(returnUrl) };
}
