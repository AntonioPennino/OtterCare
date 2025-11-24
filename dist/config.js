const runtimeConfig = globalThis.OTTERCARE_CONFIG ?? null;
const maybeProcess = typeof globalThis === 'object' && globalThis !== null && 'process' in globalThis
    ? globalThis.process
    : undefined;
const envSupabaseUrl = maybeProcess?.env?.SUPABASE_URL ?? '';
const envSupabaseAnon = maybeProcess?.env?.SUPABASE_ANON_KEY ?? '';
const envVapidKey = maybeProcess?.env?.VAPID_PUBLIC_KEY ?? '';
const envReminderFunction = maybeProcess?.env?.SUPABASE_REMINDER_FUNCTION ?? '';
export const SUPABASE_URL = runtimeConfig?.supabaseUrl || envSupabaseUrl || '';
export const SUPABASE_ANON_KEY = runtimeConfig?.supabaseAnonKey || envSupabaseAnon || '';
export const VAPID_PUBLIC_KEY = runtimeConfig?.vapidPublicKey || envVapidKey || '';
export const REMINDER_FUNCTION_NAME = runtimeConfig?.reminderFunction || envReminderFunction || '';
export function isCloudSyncConfigured() {
    return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
export function isPushConfigured() {
    return Boolean(VAPID_PUBLIC_KEY);
}
