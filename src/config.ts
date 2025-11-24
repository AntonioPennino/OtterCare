const runtimeConfig = (globalThis as unknown as { OTTERCARE_CONFIG?: { supabaseUrl?: string; supabaseAnonKey?: string } }).OTTERCARE_CONFIG ?? null;

type MaybeProcess = { env?: Record<string, string | undefined> } | undefined;
const maybeProcess: MaybeProcess = typeof globalThis === 'object' && globalThis !== null && 'process' in globalThis
  ? (globalThis as { process?: MaybeProcess }).process
  : undefined;

const envSupabaseUrl = maybeProcess?.env?.SUPABASE_URL ?? '';
const envSupabaseAnon = maybeProcess?.env?.SUPABASE_ANON_KEY ?? '';

export const SUPABASE_URL = runtimeConfig?.supabaseUrl || envSupabaseUrl || '';
export const SUPABASE_ANON_KEY = runtimeConfig?.supabaseAnonKey || envSupabaseAnon || '';

export function isCloudSyncConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
