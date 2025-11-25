type PebbleRuntimeConfig = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  vapidPublicKey?: string;
  reminderFunction?: string;
} | null;

function getRuntimeConfig(): PebbleRuntimeConfig {
  const globalConfig = (globalThis as unknown as {
    PEBBLE_CONFIG?: {
      supabaseUrl?: string;
      supabaseAnonKey?: string;
      vapidPublicKey?: string;
      reminderFunction?: string;
    };
  }).PEBBLE_CONFIG;
  return globalConfig ?? null;
}

type MaybeProcess = { env?: Record<string, string | undefined> } | undefined;
const maybeProcess: MaybeProcess = typeof globalThis === 'object' && globalThis !== null && 'process' in globalThis
  ? (globalThis as { process?: MaybeProcess }).process
  : undefined;

const envSupabaseUrl = maybeProcess?.env?.SUPABASE_URL ?? '';
const envSupabaseAnon = maybeProcess?.env?.SUPABASE_ANON_KEY ?? '';
const envVapidKey = maybeProcess?.env?.VAPID_PUBLIC_KEY ?? '';
const envReminderFunction = maybeProcess?.env?.SUPABASE_REMINDER_FUNCTION ?? '';

function resolveConfigValue(runtimeValue: string | undefined, envValue: string): string {
  const normalizedRuntime = typeof runtimeValue === 'string' ? runtimeValue.trim() : '';
  if (normalizedRuntime) {
    return normalizedRuntime;
  }
  const normalizedEnv = envValue.trim();
  return normalizedEnv;
}

export function getSupabaseUrl(): string {
  return resolveConfigValue(getRuntimeConfig()?.supabaseUrl, envSupabaseUrl);
}

export function getSupabaseAnonKey(): string {
  return resolveConfigValue(getRuntimeConfig()?.supabaseAnonKey, envSupabaseAnon);
}

export function getVapidPublicKey(): string {
  return resolveConfigValue(getRuntimeConfig()?.vapidPublicKey, envVapidKey);
}

export function getReminderFunctionName(): string {
  return resolveConfigValue(getRuntimeConfig()?.reminderFunction, envReminderFunction);
}

export function isCloudSyncConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

export function isPushConfigured(): boolean {
  return Boolean(getVapidPublicKey());
}
