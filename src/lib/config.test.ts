import { describe, expect, it } from 'vitest';
import { readSupabaseConfig } from './config';

describe('supabase config', () => {
  it('stays in stub mode when either value is missing or still a placeholder', () => {
    expect(readSupabaseConfig({}).configured).toBe(false);
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co' }).configured).toBe(false);
    expect(readSupabaseConfig({
      VITE_SUPABASE_URL: 'https://YOUR_PROJECT_REF.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'your-anon-key',
    }).configured).toBe(false);
  });

  it('is configured only when both real values are present', () => {
    const config = readSupabaseConfig({
      VITE_SUPABASE_URL: 'https://kfbgjpqgywenkfkfcoqf.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'eyJexample',
    });
    expect(config.configured).toBe(true);
    expect(config.url).toBe('https://kfbgjpqgywenkfkfcoqf.supabase.co');
  });
});
