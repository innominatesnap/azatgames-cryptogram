import { describe, expect, it } from 'vitest';
import { hardReset, readSession, signOutLocal } from './session';

describe('session gate', () => {
  it('returns timeout without calling the result signed out', async () => {
    const outcome = await readSession(
      () => new Promise(() => undefined),
      20,
    );
    expect(outcome).toBe('timeout');
  });

  it('reads a session or a real signed-out result', async () => {
    await expect(readSession(async () => ({ data: { session: { user: 'a' } } }), 50)).resolves.toBe('session');
    await expect(readSession(async () => ({ data: { session: null } }), 50)).resolves.toBe('none');
    await expect(readSession(async () => {
      throw new Error('network');
    }, 50)).rejects.toThrow('network');
  });

  it('clears the cookie before a best-effort sign-out that may time out', async () => {
    const order: string[] = [];
    await signOutLocal({
      clearAuth() {
        order.push('clear');
      },
      signOut() {
        order.push('signout');
        return new Promise(() => undefined);
      },
      timeoutMs: 20,
    });
    expect(order).toEqual(['clear', 'signout']);
  });

  it('hard reset clears auth and both storages, then reloads', () => {
    const order: string[] = [];
    hardReset({
      clearAuth() {
        order.push('auth');
      },
      local: { clear() { order.push('local'); } },
      session: { clear() { order.push('session'); } },
      reload() {
        order.push('reload');
      },
    });
    expect(order).toEqual(['auth', 'local', 'session', 'reload']);
  });
});
