import { advanceTick, ensurePersistentStorage, loadState, saveState } from './state.js';
import { UIManager } from './ui/UIManager.js';
import { calculateOfflineProgress as calculateCoreOfflineProgress, getGameStateInstance, syncManagerWithLegacyCoreStats, syncWithSupabase as syncCoreState } from './bootstrap.js';
import { audioManager } from './core/audio.js';
const uiManager = new UIManager();
function setupServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        return;
    }
    const nav = navigator;
    if (nav.webdriver === true) {
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
function promptForUpdate(worker) {
    uiManager.prepareUpdatePrompt(() => {
        worker.postMessage({ type: 'SKIP_WAITING' });
    }, () => {
        // Nessuna azione aggiuntiva per ora
    });
}
function bootstrap() {
    loadState();
    void ensurePersistentStorage();
    const gameState = getGameStateInstance();
    window.addEventListener('pebble-gift-found', event => {
        const customEvent = event;
        const item = customEvent.detail?.item ?? 'dono misterioso';
        uiManager.showGiftModal(item);
    });
    const offlineProgress = calculateCoreOfflineProgress();
    if (offlineProgress) {
        const hoursText = offlineProgress.hoursAway.toFixed(2);
        console.info(`[Pebble] Sei stato via per ${hoursText} ore.`);
        if (offlineProgress.gift) {
            uiManager.showGiftModal(offlineProgress.gift);
        }
    }
    void syncCoreState();
    // Diagnostic: log resolved config values to help debug cloud sync setup
    // Diagnostic: try to read runtime config with a dynamic import
    void import('./config.js').then(cfg => {
        try {
            const supabaseUrl = typeof cfg.getSupabaseUrl === 'function' ? cfg.getSupabaseUrl() : '';
            const anon = typeof cfg.getSupabaseAnonKey === 'function' ? cfg.getSupabaseAnonKey() : '';
            const anonPreview = anon ? `${anon.slice(0, 6)}…${anon.slice(-6)}` : '(vuota)';
            console.info('[Pebble] runtime config:', { supabaseUrl: supabaseUrl || '(vuota)', supabaseAnonKey: anonPreview });
        }
        catch (err) {
            console.info('[Pebble] runtime config: unable to read config module', err);
        }
    }).catch(err => {
        console.info('[Pebble] runtime config: import error', err);
    });
    uiManager.init();
    setupServiceWorker();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            audioManager.suspend();
        }
        else {
            void audioManager.resume();
        }
    });
    window.addEventListener('pagehide', () => {
        audioManager.suspend();
    });
    window.setInterval(() => {
        advanceTick();
        syncManagerWithLegacyCoreStats();
    }, 5000);
    window.setInterval(() => saveState(), 60000);
    window.addEventListener('beforeunload', () => saveState());
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        bootstrap();
    });
}
else {
    bootstrap();
}
