function getRuntimeConfig() {
    const globalConfig = globalThis.PEBBLE_CONFIG;
    return globalConfig ?? null;
}
const maybeProcess = typeof globalThis === 'object' && globalThis !== null && 'process' in globalThis
    ? globalThis.process
    : undefined;
const envSupabaseUrl = maybeProcess?.env?.SUPABASE_URL ?? '';
const envSupabaseAnon = maybeProcess?.env?.SUPABASE_ANON_KEY ?? '';
const envVapidKey = maybeProcess?.env?.VAPID_PUBLIC_KEY ?? '';
const envReminderFunction = maybeProcess?.env?.SUPABASE_REMINDER_FUNCTION ?? '';
function resolveConfigValue(runtimeValue, envValue) {
    const normalizedRuntime = typeof runtimeValue === 'string' ? runtimeValue.trim() : '';
    if (normalizedRuntime) {
        return normalizedRuntime;
    }
    const normalizedEnv = envValue.trim();
    return normalizedEnv;
}
export function getSupabaseUrl() {
    return resolveConfigValue(getRuntimeConfig()?.supabaseUrl, envSupabaseUrl);
}
export function getSupabaseAnonKey() {
    return resolveConfigValue(getRuntimeConfig()?.supabaseAnonKey, envSupabaseAnon);
}
export function getVapidPublicKey() {
    return resolveConfigValue(getRuntimeConfig()?.vapidPublicKey, envVapidKey);
}
export function getReminderFunctionName() {
    return resolveConfigValue(getRuntimeConfig()?.reminderFunction, envReminderFunction);
}
export function isCloudSyncConfigured() {
    return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}
export function isPushConfigured() {
    return Boolean(getVapidPublicKey());
}
