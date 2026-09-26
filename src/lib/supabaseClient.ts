import { createClient } from '@supabase/supabase-js';
import { createAzatCookieStorage } from '../auth/cookies';

export function createCryptogramClient(url: string, anonKey: string) {
  return createClient(url, anonKey, {
    db: { schema: 'cryptogram' },
    auth: {
      storageKey: 'sb-azat-auth-token',
      storage: createAzatCookieStorage(),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
      lock: async (_name, _timeout, fn) => {
        void _name;
        void _timeout;
        return fn();
      },
    },
  });
}

export type CryptogramClient = ReturnType<typeof createCryptogramClient>;
