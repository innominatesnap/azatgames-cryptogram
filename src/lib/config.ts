export type SupabaseConfig = {
  url: string;
  anonKey: string;
  configured: boolean;
};

function clean(value: string | undefined): string {
  return (value || '').trim();
}

export function isPlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.indexOf('your_project') !== -1
    || lower.indexOf('your-project') !== -1
    || lower.indexOf('your-anon-key') !== -1
    || lower.indexOf('your_anon_key') !== -1
  );
}

export function readSupabaseConfig(env: {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}): SupabaseConfig {
  const url = clean(env.VITE_SUPABASE_URL);
  const anonKey = clean(env.VITE_SUPABASE_ANON_KEY);
  const configured = url.length > 0 && anonKey.length > 0 && !isPlaceholder(url) && !isPlaceholder(anonKey);
  return { url: url, anonKey: anonKey, configured: configured };
}
