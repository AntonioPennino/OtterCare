const runtimeConfig = globalThis.OTTERCARE_CONFIG ?? null;
const maybeProcess = typeof globalThis === 'object' && globalThis !== null && 'process' in globalThis
    ? globalThis.process
    : undefined;
const envSupabaseUrl = maybeProcess?.env?.SUPABASE_URL ?? '';
const envSupabaseAnon = maybeProcess?.env?.SUPABASE_ANON_KEY ?? '';
export const SUPABASE_URL = runtimeConfig?.supabaseUrl || envSupabaseUrl || '';
export const SUPABASE_ANON_KEY = runtimeConfig?.supabaseAnonKey || envSupabaseAnon || '';
export function isCloudSyncConfigured() {
    return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
