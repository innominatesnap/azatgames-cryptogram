import { AUTH_STORAGE_KEY, createAzatCookieStorage } from '../auth/cookies';
import { decideAuth, readRedirectStamp, REDIRECT_STAMP_KEY } from '../auth/redirect';
import { readSession, signOutLocal } from '../auth/session';
import { readSupabaseConfig } from '../lib/config';
import { createCryptogramClient } from '../lib/supabaseClient';
import { createLiveBundle, createPracticeBundle, type PuzzleBundle } from './bundle';

export const STUB_NOTICE = 'Stub mode. Supabase is not configured, so this round uses a local sample quote.';

type Store = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

let redirectStarted = false;

export type BootResult = {
  bundle: PuzzleBundle;
  notice: string | null;
  signedIn: boolean;
};

export async function runBoot(storage: Store): Promise<BootResult> {
  const practice = createPracticeBundle(storage);
  const config = readSupabaseConfig(import.meta.env);
  if (!config.configured) {
    return { bundle: practice, notice: STUB_NOTICE, signedIn: false };
  }
  const client = createCryptogramClient(config.url, config.anonKey);
  let outcome: 'session' | 'none' | 'timeout';
  try {
    outcome = await readSession(async () => {
      const result = await client.auth.getSession();
      if (result.error) throw result.error;
      return { data: { session: result.data.session } };
    });
  } catch {
    return {
      bundle: practice,
      notice: 'Sign-in check failed. A failed check is not treated as signed out. Practice quote is on this device only.',
      signedIn: false,
    };
  }
  const decision = decideAuth({
    configured: true,
    outcome: outcome,
    returnUrl: window.location.href,
    now: Date.now(),
    lastRedirectAt: readRedirectStamp(window.sessionStorage),
  });
  if (decision.action === 'redirect') {
    if (!redirectStarted) {
      redirectStarted = true;
      window.sessionStorage.setItem(REDIRECT_STAMP_KEY, String(Date.now()));
      window.location.assign(decision.href);
    }
    return { bundle: practice, notice: 'Sending you to Azat sign-in.', signedIn: false };
  }
  if (decision.action === 'hold' && decision.reason === 'timeout') {
    return {
      bundle: practice,
      notice: 'Sign-in is taking a while. A slow check is not treated as signed out.',
      signedIn: false,
    };
  }
  if (decision.action === 'hold' && decision.reason === 'cooldown') {
    return {
      bundle: practice,
      notice: 'Sign-in redirect is paused for a few seconds so it does not loop.',
      signedIn: false,
    };
  }
  if (decision.action !== 'ready') {
    return {
      bundle: practice,
      notice: 'Open cryptogram.azat.games to use Azat sign-in. You can practice here on a sample quote.',
      signedIn: false,
    };
  }
  const sessionResult = await client.auth.getSession();
  const userId = sessionResult.data.session && sessionResult.data.session.user.id;
  if (!userId) {
    return {
      bundle: practice,
      notice: 'Azat sign-in did not return a player. Practice quote is on this device only.',
      signedIn: false,
    };
  }
  void client.rpc('acknowledge_age').then(() => undefined, () => undefined);
  try {
    const bundle = await createLiveBundle(client, userId, storage);
    return { bundle: bundle, notice: null, signedIn: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load today.';
    return {
      bundle: practice,
      notice: 'Could not load today\'s quote. ' + message + ' Practice quote is on this device only.',
      signedIn: true,
    };
  }
}

export async function signOutAndReload(): Promise<void> {
  const config = readSupabaseConfig(import.meta.env);
  const cookies = createAzatCookieStorage();
  const client = config.configured ? createCryptogramClient(config.url, config.anonKey) : null;
  await signOutLocal({
    clearAuth() {
      cookies.removeItem(AUTH_STORAGE_KEY);
    },
    signOut() {
      if (!client) return Promise.resolve();
      return client.auth.signOut({ scope: 'local' });
    },
  });
  window.location.reload();
}
