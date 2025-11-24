const runtimeConfig = (globalThis as unknown as {
  OTTERCARE_CONFIG?: {
    supabaseUrl?: string;
    supabaseAnonKey?: string;
    vapidPublicKey?: string;
    reminderFunction?: string;
  };
}).OTTERCARE_CONFIG ?? null;

type MaybeProcess = { env?: Record<string, string | undefined> } | undefined;
const maybeProcess: MaybeProcess = typeof globalThis === 'object' && globalThis !== null && 'process' in globalThis
  ? (globalThis as { process?: MaybeProcess }).process
  : undefined;

const envSupabaseUrl = maybeProcess?.env?.SUPABASE_URL ?? '';
const envSupabaseAnon = maybeProcess?.env?.SUPABASE_ANON_KEY ?? '';
const envVapidKey = maybeProcess?.env?.VAPID_PUBLIC_KEY ?? '';
const envReminderFunction = maybeProcess?.env?.SUPABASE_REMINDER_FUNCTION ?? '';

export const SUPABASE_URL = runtimeConfig?.supabaseUrl || envSupabaseUrl || '';
export const SUPABASE_ANON_KEY = runtimeConfig?.supabaseAnonKey || envSupabaseAnon || '';
export const VAPID_PUBLIC_KEY = runtimeConfig?.vapidPublicKey || envVapidKey || '';
export const REMINDER_FUNCTION_NAME = runtimeConfig?.reminderFunction || envReminderFunction || '';

export function isCloudSyncConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function isPushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC_KEY);
}
