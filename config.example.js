// Copia questo file in config.js e inserisci le credenziali pubbliche di Supabase.
// Non committare mai la versione con le chiavi reali.
window.OTTERCARE_CONFIG = {
  supabaseUrl: "https://your-project.supabase.co",
  supabaseAnonKey: "SUPABASE_ANON_KEY",
  vapidPublicKey: "VAPID_PUBLIC_KEY", // Genera con: npx web-push generate-vapid-keys
  reminderFunction: "otter-reminder"    // Nome Edge Function opzionale per invio push
};
