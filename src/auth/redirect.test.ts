import { describe, expect, it } from 'vitest';
import { cooldownActive, decideAuth, hubLoginUrl, isReturnUrlAllowed, playReturnUrl, REDIRECT_COOLDOWN_MS } from './redirect';

describe('hub redirect allowlist', () => {
  it('allows https subdomains of azat.games and rejects the rest', () => {
    expect(isReturnUrlAllowed('https://cryptogram.azat.games/solve')).toBe(true);
    expect(isReturnUrlAllowed('https://login.azat.games/login')).toBe(true);
    expect(isReturnUrlAllowed('https://a.b.azat.games/path?q=1')).toBe(true);
    expect(isReturnUrlAllowed('https://azat.games/')).toBe(false);
    expect(isReturnUrlAllowed('http://cryptogram.azat.games/')).toBe(false);
    expect(isReturnUrlAllowed('https://user:pass@cryptogram.azat.games/')).toBe(false);
    expect(isReturnUrlAllowed('https://cryptogram.azat.games.evil.com/')).toBe(false);
    expect(isReturnUrlAllowed('https://notazat.games/')).toBe(false);
    expect(isReturnUrlAllowed('https://evil.com/')).toBe(false);
    expect(isReturnUrlAllowed('https://foo..azat.games/')).toBe(false);
    expect(isReturnUrlAllowed('not a url')).toBe(false);
  });

  it('blocks a second redirect inside the cooldown window', () => {
    const now = 1_000_000;
    expect(cooldownActive(null, now)).toBe(false);
    expect(cooldownActive(now - 5_000, now)).toBe(true);
    expect(cooldownActive(now - REDIRECT_COOLDOWN_MS, now)).toBe(false);
    expect(cooldownActive(now - REDIRECT_COOLDOWN_MS + 1, now)).toBe(true);
  });

  it('does not treat a session timeout as signed out', () => {
    const decision = decideAuth({
      configured: true,
      outcome: 'timeout',
      returnUrl: 'https://cryptogram.azat.games/',
      now: 50_000,
      lastRedirectAt: null,
    });
    expect(decision).toEqual({ action: 'hold', reason: 'timeout' });
  });

  it('sends sign-in back to origin /play and keeps deep links under /play', () => {
    expect(playReturnUrl('https://cryptogram.azat.games/')).toBe('https://cryptogram.azat.games/play');
    expect(playReturnUrl('https://cryptogram.azat.games/today?x=1')).toBe('https://cryptogram.azat.games/play');
    expect(playReturnUrl('https://cryptogram.azat.games/play/solve?from=letter')).toBe(
      'https://cryptogram.azat.games/play/solve?from=letter',
    );
    const login = hubLoginUrl('https://cryptogram.azat.games/');
    expect(login.indexOf('https://login.azat.games/login?redirect_to=')).toBe(0);
    expect(decodeURIComponent(login.split('redirect_to=')[1])).toBe('https://cryptogram.azat.games/play');
  });

  it('redirects only when configured, signed out, allowlisted, and cooled down', () => {
    const base = {
      configured: true,
      outcome: 'none' as const,
      returnUrl: 'https://cryptogram.azat.games/today',
      now: 80_000,
      lastRedirectAt: null,
    };
    const go = decideAuth(base);
    expect(go.action).toBe('redirect');
    if (go.action === 'redirect') {
      expect(go.href.indexOf('https://login.azat.games/login?redirect_to=')).toBe(0);
      expect(decodeURIComponent(go.href.split('redirect_to=')[1])).toBe('https://cryptogram.azat.games/play');
    }
    expect(decideAuth({ ...base, configured: false }).action).toBe('stub');
    expect(decideAuth({ ...base, outcome: 'session' }).action).toBe('ready');
    expect(decideAuth({ ...base, returnUrl: 'http://localhost:5173/' })).toEqual({
      action: 'hold',
      reason: 'return-url',
    });
    expect(decideAuth({ ...base, lastRedirectAt: base.now - 1000 })).toEqual({
      action: 'hold',
      reason: 'cooldown',
    });
  });
});
