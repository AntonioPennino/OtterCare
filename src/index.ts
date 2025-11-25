import { advanceTick, ensurePersistentStorage, loadState, saveState } from './state.js';
import { initUI, prepareUpdatePrompt } from './ui.js';

function setupServiceWorker(): void {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  let refreshing = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) {
      return;
    }
    refreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('sw.js').then(registration => {
    registration.update().catch(() => {
      // ignora errori di rete temporanei
    });

    if (registration.waiting) {
      promptForUpdate(registration.waiting);
    }

    registration.addEventListener('updatefound', () => {
      const installer = registration.installing;
      if (!installer) {
        return;
      }
      installer.addEventListener('statechange', () => {
        if (installer.state === 'installed' && navigator.serviceWorker.controller) {
          promptForUpdate(installer);
        }
      });
    });

    window.setInterval(() => {
      registration.update().catch(() => undefined);
    }, 60 * 60 * 1000);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        registration.update().catch(() => undefined);
      }
    });
  }).catch(error => {
    console.warn('Impossibile registrare il Service Worker', error);
  });
}

function promptForUpdate(worker: ServiceWorker): void {
  prepareUpdatePrompt(() => {
    worker.postMessage({ type: 'SKIP_WAITING' });
  }, () => {
    // Nessuna azione aggiuntiva per ora
  });
}

function bootstrap(): void {
  loadState();
  void ensurePersistentStorage();
  // Diagnostic: log resolved config values to help debug cloud sync setup
  // Diagnostic: try to read runtime config with a dynamic import
  void import('./config.js').then(cfg => {
    try {
      const supabaseUrl = typeof cfg.getSupabaseUrl === 'function' ? cfg.getSupabaseUrl() : '';
      const anon = typeof cfg.getSupabaseAnonKey === 'function' ? cfg.getSupabaseAnonKey() : '';
      const anonPreview = anon ? `${anon.slice(0, 6)}…${anon.slice(-6)}` : '(vuota)';
      console.info('[Pebble] runtime config:', { supabaseUrl: supabaseUrl || '(vuota)', supabaseAnonKey: anonPreview });
    } catch (err) {
      console.info('[Pebble] runtime config: unable to read config module', err);
    }
  }).catch(err => {
    console.info('[Pebble] runtime config: import error', err);
  });
  initUI();
  setupServiceWorker();

  window.setInterval(() => advanceTick(), 5000);
  window.setInterval(() => saveState(), 60000);
  window.addEventListener('beforeunload', () => saveState());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    bootstrap();
  });
} else {
  bootstrap();
}
