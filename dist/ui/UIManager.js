import { $ } from './utils.js';
import { applyTheme } from './theme.js';
import { HUD } from './components/HUD.js';
import { InventoryView } from './components/InventoryView.js';
import { OtterRenderer } from './components/OtterRenderer.js';
import { ModalManager } from './components/ModalManager.js';
import { NotificationUI } from './components/NotificationUI.js';
import { initMiniGame, openMiniGame, isMiniGameRunning } from '../features/minigame.js';
import { audioManager, resumeAudioContext } from '../core/audio.js';
import { recordEvent } from '../core/analytics.js';
import { getGameStateInstance, getSettingsStateInstance, getGameServiceInstance } from '../bootstrap.js';
import { enableNotifications, disableNotifications } from '../core/services/notifications.js';
import { mountStonePolishingActivity } from '../features/stonePolishing.js';
export class UIManager {
    constructor() {
        this.touchDrag = null;
        this.currentFood = null;
        this.suppressNextClick = false;
        this.updateConfirm = null;
        this.updateDismiss = null;
        this.deferredInstallPrompt = null;
        this.stonePolishingActivity = null;
        this.hud = new HUD();
        this.inventoryView = new InventoryView();
        this.otterRenderer = new OtterRenderer();
        this.modalManager = new ModalManager(this.inventoryView);
        this.notificationUI = new NotificationUI();
    }
    init() {
        this.initNavigation();
        this.initBlink();
        this.initAnalyticsToggle();
        this.initThemeControls();
        this.initNotificationControls();
        this.initBackupControls();
        this.initCloudSyncControls();
        this.initInstallPrompt();
        this.initNamePrompt();
        this.initTutorial();
        this.initUpdateBanner();
        this.initKitchenScene();
        this.initSleep();
        this.initActionButtons();
        this.initShop();
        // Listen for inventory changes from GameState
        window.addEventListener('pebble-inventory-changed', event => {
            const detail = event.detail;
            if (detail) {
                this.inventoryView.render(detail.inventory);
            }
        });
        // MiniGame initialization
        const overlayEl = $('overlay');
        const areaEl = $('fishArea');
        const scoreEl = $('miniScore');
        const closeButtonEl = $('closeMini');
        if (overlayEl && areaEl && scoreEl && closeButtonEl) {
            initMiniGame({
                overlay: overlayEl,
                area: areaEl,
                score: scoreEl,
                closeButton: closeButtonEl
            }, {
                onFinish: result => {
                    this.notificationUI.showAlert(`Mini-gioco terminato! Hai catturato ${result} pesci.`, 'info');
                }
            });
            const playBtn = $('playBtn');
            playBtn?.addEventListener('click', () => {
                openMiniGame();
            });
        }
        // Initial render subscription
        const gameState = getGameStateInstance();
        const settingsState = getSettingsStateInstance();
        gameState.subscribe(() => this.render());
        settingsState.subscribe(() => this.render());
        this.render();
        // Resume audio context on first click
        document.addEventListener('click', () => {
            void resumeAudioContext();
        }, { once: true });
    }
    prepareUpdatePrompt(onConfirm, onDismiss) {
        this.updateConfirm = onConfirm;
        this.updateDismiss = onDismiss;
        const banner = $('updateBanner');
        if (!banner) {
            return;
        }
        banner.classList.remove('hidden');
        this.notificationUI.showAlert('Nuova versione disponibile! Premi Aggiorna per ricaricare.', 'info');
    }
    showGiftModal(item) {
        const gameState = getGameStateInstance();
        this.modalManager.showGiftModal(item, gameState.getInventory());
    }
    render() {
        const gameState = getGameStateInstance();
        const settingsState = getSettingsStateInstance();
        const coreStats = gameState.getStats();
        const equipped = gameState.getEquipped();
        const settings = settingsState.getSettings();
        const pseudoState = {
            ...coreStats,
            ...equipped,
            petName: gameState.getPetName(),
            petNameConfirmed: !!gameState.getPetName(),
            theme: settings.theme,
            notifications: settings.notifications,
            tutorialSeen: settings.tutorialSeen,
            installPromptDismissed: settings.installPromptDismissed,
            analyticsOptIn: settings.analyticsOptIn,
            analytics: settings.analytics,
            stats: gameState.getMetrics()
        };
        this.hud.update(pseudoState, coreStats);
        this.modalManager.updateOverlays(pseudoState);
        this.notificationUI.refresh(pseudoState);
        // Sync otter appearance
        let mood = 'neutral';
        if (coreStats.happiness > 80 && coreStats.hunger > 80 && coreStats.energy > 80) {
            mood = 'happy';
        }
        else if (coreStats.happiness < 30 || coreStats.hunger < 30) {
            mood = 'sad';
        }
        else if (coreStats.energy < 30) {
            mood = 'sleepy';
        }
        this.otterRenderer.sync(mood, equipped);
        this.inventoryView.render(gameState.getInventory());
        // Apply theme
        applyTheme(settings.theme);
    }
    // --- Initialization Methods ---
    initSleep() {
        const sleepBtn = $('sleepBtn');
        sleepBtn?.addEventListener('click', () => {
            const { energy } = getGameStateInstance().getStats();
            if (energy >= 100) {
                this.notificationUI.showAlert('La lontra non è stanca!', 'warning');
                return;
            }
            getGameServiceInstance().sleep();
            this.otterRenderer.triggerAnimation('sleep', getGameStateInstance().getEquipped(), () => {
                // Animation complete
            });
            this.notificationUI.showAlert('Zzz... la lontra riposa.', 'info');
        });
    }
    initActionButtons() {
        const hatToggle = $('hatToggle');
        const scarfToggle = $('scarfToggle');
        const glassesToggle = $('glassesToggle');
        const updateToggles = () => {
            const equipped = getGameStateInstance().getEquipped();
            if (hatToggle)
                hatToggle.setAttribute('aria-pressed', String(equipped.hat));
            if (scarfToggle)
                scarfToggle.setAttribute('aria-pressed', String(equipped.scarf));
            if (glassesToggle)
                glassesToggle.setAttribute('aria-pressed', String(equipped.sunglasses));
        };
        hatToggle?.addEventListener('click', () => {
            const current = getGameStateInstance().getEquipped();
            getGameStateInstance().setEquipped({ hat: !current.hat });
        });
        scarfToggle?.addEventListener('click', () => {
            const current = getGameStateInstance().getEquipped();
            getGameStateInstance().setEquipped({ scarf: !current.scarf });
        });
        glassesToggle?.addEventListener('click', () => {
            const current = getGameStateInstance().getEquipped();
            getGameStateInstance().setEquipped({ sunglasses: !current.sunglasses });
        });
        getGameStateInstance().subscribe(updateToggles);
        updateToggles();
    }
    initKitchenScene() {
        const foodButtons = document.querySelectorAll('.food-item');
        const dropTargets = document.querySelectorAll('.otter-container, .otter-img');
        const quickFeedBtn = $('quickFeedBtn');
        const setActiveFood = (button) => {
            foodButtons.forEach(btn => btn.classList.remove('selected', 'dragging'));
            if (button) {
                button.classList.add('selected');
            }
        };
        const toggleDropHover = (active) => {
            dropTargets.forEach(t => t.classList.toggle('drop-hover', active));
        };
        const resetDragState = () => {
            foodButtons.forEach(btn => btn.classList.remove('dragging', 'selected'));
            toggleDropHover(false);
            this.currentFood = null;
            this.touchDrag = null;
        };
        const isTouchPointer = (e) => e.pointerType === 'touch' || e.pointerType === 'pen';
        const isPointInsideDropTargets = (x, y) => {
            return Array.from(dropTargets).some(target => {
                const rect = target.getBoundingClientRect();
                return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
            });
        };
        const finishTouchDrag = (event, shouldDrop) => {
            if (!this.touchDrag)
                return;
            const { button, foodKey } = this.touchDrag;
            button.classList.remove('dragging');
            try {
                button.releasePointerCapture(event.pointerId);
            }
            catch { /* ignore */ }
            if (shouldDrop) {
                this.feedWithSnack(foodKey);
                this.suppressNextClick = true;
                setTimeout(() => { this.suppressNextClick = false; }, 50);
            }
            this.touchDrag = null;
            resetDragState();
        };
        // Bind events
        dropTargets.forEach(target => {
            target.addEventListener('dragenter', e => { e.preventDefault(); toggleDropHover(true); });
            target.addEventListener('dragover', e => { e.preventDefault(); toggleDropHover(true); });
            target.addEventListener('dragleave', () => toggleDropHover(false));
            target.addEventListener('drop', e => {
                e.preventDefault();
                const transferred = e.dataTransfer?.getData('text/plain') || this.currentFood;
                this.feedWithSnack(transferred ?? null);
                resetDragState();
            });
        });
        foodButtons.forEach(button => {
            button.addEventListener('pointerdown', event => {
                if (!isTouchPointer(event))
                    return;
                this.touchDrag = { button, pointerId: event.pointerId, foodKey: button.dataset.food ?? null };
                this.currentFood = this.touchDrag.foodKey;
                setActiveFood(button);
                button.classList.add('dragging');
                try {
                    button.setPointerCapture(event.pointerId);
                }
                catch { /* ignore */ }
                toggleDropHover(isPointInsideDropTargets(event.clientX, event.clientY));
                event.preventDefault();
            });
            button.addEventListener('pointermove', event => {
                if (!this.touchDrag || this.touchDrag.pointerId !== event.pointerId)
                    return;
                toggleDropHover(isPointInsideDropTargets(event.clientX, event.clientY));
            });
            button.addEventListener('pointerup', event => {
                if (!this.touchDrag || this.touchDrag.pointerId !== event.pointerId)
                    return;
                finishTouchDrag(event, isPointInsideDropTargets(event.clientX, event.clientY));
            });
            button.addEventListener('pointercancel', event => {
                if (!this.touchDrag || this.touchDrag.pointerId !== event.pointerId)
                    return;
                finishTouchDrag(event, false);
            });
            button.addEventListener('dragstart', event => {
                const foodKey = button.dataset.food ?? null;
                this.currentFood = foodKey;
                setActiveFood(button);
                button.classList.add('dragging');
                if (event.dataTransfer && foodKey) {
                    event.dataTransfer.setData('text/plain', foodKey);
                    event.dataTransfer.effectAllowed = 'move';
                }
            });
            button.addEventListener('dragend', () => resetDragState());
            button.addEventListener('click', () => {
                if (this.suppressNextClick) {
                    this.suppressNextClick = false;
                    return;
                }
                setActiveFood(button);
                this.currentFood = button.dataset.food ?? null;
                setActiveFood(button);
                this.currentFood = button.dataset.food ?? null;
                this.feedWithSnack(button.dataset.food ?? null);
            });
        });
        quickFeedBtn?.addEventListener('click', () => {
            this.currentFood = null;
            setActiveFood(null);
            this.feedWithSnack(null);
        });
    }
    feedWithSnack(snack) {
        const { hunger } = getGameStateInstance().getStats();
        if (hunger >= 100) {
            this.notificationUI.showAlert('La lontra è piena! Non ha fame adesso.', 'warning');
            return;
        }
        getGameServiceInstance().feed();
        const equipped = getGameStateInstance().getEquipped();
        this.otterRenderer.triggerAnimation('feed', equipped, () => {
            // Animation complete
        });
        if (snack) {
            recordEvent(`cibo:${snack}`);
        }
    }
    initShop() {
        const buttons = document.querySelectorAll('.buy-btn');
        buttons.forEach(button => {
            button.addEventListener('click', () => {
                const price = Number(button.dataset.price ?? '0');
                const item = button.dataset.item ?? 'item';
                if (getGameServiceInstance().spendCoins(price)) {
                    // Logic for unlocking items?
                    // In the old code, it set 'owned' to true.
                    // Now we should add to inventory if it's not there?
                    // Or set equipped?
                    // The old code had setHatOwned(true).
                    // Let's assume buying adds to inventory.
                    const inventory = getGameStateInstance().getInventory();
                    if (!inventory.includes(item)) {
                        getGameStateInstance().setInventory([...inventory, item]);
                    }
                    // Also reward purchase
                    getGameServiceInstance().rewardItemPurchase(item);
                    this.notificationUI.showAlert('Acquisto completato! Trovi il nuovo oggetto sulla lontra.', 'info');
                }
                else {
                    window.alert('Monete insufficienti. Gioca per guadagnarne di più!');
                }
            });
        });
    }
    initNavigation() {
        const navButtons = Array.from(document.querySelectorAll('.nav-item, .desktop-nav-item'));
        const scenes = {
            den: $('denPage'),
            kitchen: $('kitchenPage'),
            hygiene: $('hygienePage'),
            games: $('gamesPage'),
            shop: $('shopPage')
        };
        const ambientByScene = {
            den: { track: 'ambient-fireplace', volume: 0.38 },
            kitchen: { track: 'ambient-river', volume: 0.55 },
            hygiene: { track: 'ambient-river', volume: 0.6 },
            games: { track: 'ambient-birds', volume: 0.45 },
            shop: { track: 'ambient-fireplace', volume: 0.35 }
        };
        const isSceneKey = (value) => Object.prototype.hasOwnProperty.call(scenes, value);
        const showScene = (scene) => {
            navButtons.forEach(btn => {
                const isActive = btn.dataset.page === scene;
                btn.classList.toggle('active', isActive);
                btn.setAttribute('aria-pressed', String(isActive));
            });
            Object.entries(scenes).forEach(([key, element]) => {
                if (!element)
                    return;
                const isVisible = key === scene;
                element.classList.toggle('hidden', !isVisible);
                element.classList.toggle('active', isVisible);
                element.setAttribute('aria-hidden', String(!isVisible));
            });
            this.render();
            recordEvent(`nav:${scene}`);
            const ambientTarget = ambientByScene[scene];
            if (ambientTarget && audioManager.hasAsset(ambientTarget.track)) {
                void audioManager.playAmbient(ambientTarget.track, ambientTarget.volume);
            }
            else {
                void audioManager.stopAmbient();
            }
            if (scene !== 'den') {
                this.modalManager.setDenJournalVisibility(false);
            }
        };
        navButtons.forEach(button => {
            button.addEventListener('click', () => {
                const target = button.dataset.page ?? 'den';
                if (target === 'stats') {
                    showScene('den');
                    this.modalManager.setDenJournalVisibility(true);
                    window.location.hash = '#stats';
                    return;
                }
                if (!isSceneKey(target)) {
                    showScene('den');
                    window.location.hash = '';
                    return;
                }
                showScene(target);
                window.location.hash = target === 'den' ? '' : `#${target}`;
            });
        });
        const applyHash = () => {
            const hash = window.location.hash.replace('#', '');
            if (hash === '' || hash === 'home' || hash === 'den') {
                showScene('den');
                return;
            }
            if (hash === 'stats') {
                showScene('den');
                this.modalManager.setDenJournalVisibility(true);
                return;
            }
            if (hash === 'play') {
                showScene('games');
                window.setTimeout(() => $('playBtn')?.click(), 300);
                return;
            }
            if (isSceneKey(hash)) {
                showScene(hash);
                return;
            }
            showScene('den');
        };
        window.addEventListener('hashchange', applyHash);
        applyHash();
    }
    initBlink() {
        window.setInterval(() => {
            const img = $('otterImage');
            if (!img || isMiniGameRunning()) {
                return;
            }
            img.classList.add('blink');
            window.setTimeout(() => img.classList.remove('blink'), 180);
        }, 4000 + Math.random() * 2000);
    }
    initAnalyticsToggle() {
        const toggle = $('analyticsOptInToggle');
        if (!toggle)
            return;
        toggle.addEventListener('change', () => {
            getSettingsStateInstance().updateSettings({ analyticsOptIn: toggle.checked });
            const message = toggle.checked
                ? 'Statistiche locali attivate. I dati restano sul tuo dispositivo.'
                : 'Statistiche locali disattivate.';
            this.notificationUI.showAlert(message, 'info');
        });
    }
    initThemeControls() {
        const lightBtn = $('themeLightBtn');
        const comfortBtn = $('themeComfortBtn');
        lightBtn?.addEventListener('click', () => {
            getSettingsStateInstance().updateSettings({ theme: 'light' });
            recordEvent('tema:light');
        });
        comfortBtn?.addEventListener('click', () => {
            getSettingsStateInstance().updateSettings({ theme: 'comfort' });
            recordEvent('tema:comfort');
        });
    }
    initNotificationControls() {
        const enableBtn = $('notificationEnableBtn');
        const disableBtn = $('notificationDisableBtn');
        enableBtn?.addEventListener('click', async () => {
            if (!enableBtn)
                return;
            enableBtn.disabled = true;
            const granted = await enableNotifications();
            enableBtn.disabled = false;
            if (granted) {
                this.notificationUI.showAlert('Promemoria attivati. Ti avviseremo quando la lontra avrà bisogno di aiuto.', 'info');
            }
            else {
                this.notificationUI.showAlert('Permesso negato o non disponibile. Controlla le impostazioni del browser.', 'warning');
            }
            this.notificationUI.refresh(getSettingsStateInstance().getSettings());
        });
        disableBtn?.addEventListener('click', async () => {
            if (!disableBtn)
                return;
            disableBtn.disabled = true;
            await disableNotifications();
            disableBtn.disabled = false;
            this.notificationUI.showAlert('Promemoria disattivati.', 'info');
            this.notificationUI.refresh(getSettingsStateInstance().getSettings());
        });
    }
    initBackupControls() {
        // Backup logic needs to be updated to serialize both GameState and SettingsState.
        // For now, let's skip or simplify.
        // TODO: Implement new backup logic.
    }
    initCloudSyncControls() {
        const codeLabel = $('cloudRecoveryCode');
        const copyBtn = $('cloudCopyCodeBtn');
        const form = $('cloudRecoveryForm');
        const input = $('cloudRecoveryInput');
        const status = $('cloudRecoveryStatus');
        if (!codeLabel || !form || !input || !status)
            return;
        const manager = getGameStateInstance();
        const updateCodeLabel = () => {
            codeLabel.textContent = manager.getPlayerId();
        };
        const setStatus = (message, variant = 'info') => {
            status.textContent = message;
            status.classList.toggle('warning-text', variant === 'warning');
        };
        updateCodeLabel();
        copyBtn?.addEventListener('click', async () => {
            const clipboard = navigator.clipboard;
            if (!clipboard || typeof clipboard.writeText !== 'function') {
                setStatus('Copia manualmente il codice mostrato qui sopra.', 'warning');
                this.notificationUI.showAlert('Il tuo browser non consente la copia automatica. Seleziona e copia il codice.', 'warning');
                return;
            }
            try {
                await clipboard.writeText(manager.getPlayerId());
                this.notificationUI.showAlert('Codice Pebble copiato negli appunti. Conservalo in un luogo sicuro.', 'info');
                setStatus('Codice copiato. Salvalo per futuri ripristini.');
            }
            catch (error) {
                console.warn('Impossibile copiare il codice Supabase negli appunti', error);
                setStatus('Non riesco a copiare automaticamente: seleziona e copia manualmente.', 'warning');
                this.notificationUI.showAlert('Copia manualmente il codice mostrato nelle impostazioni.', 'warning');
            }
        });
        window.addEventListener('pebble-player-id-changed', event => {
            const detail = event.detail;
            if (detail?.playerId) {
                codeLabel.textContent = detail.playerId;
                setStatus('Codice aggiornato per questo dispositivo.');
            }
        });
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const raw = input.value.trim();
            if (!raw) {
                setStatus('Inserisci un codice valido per collegare il salvataggio.', 'warning');
                return;
            }
            setStatus('Collegamento in corso…');
            const result = await manager.recoverFromCloudCode(raw);
            if (result.ok) {
                if (result.alreadyLinked) {
                    setStatus('Questo codice è già collegato a Pebble su questo dispositivo.');
                }
                else {
                    setStatus('Salvataggio Supabase recuperato con successo!');
                    this.notificationUI.showAlert('Salvataggio cloud sincronizzato. Benvenuto di nuovo!', 'info');
                }
                input.value = '';
                return;
            }
            switch (result.reason) {
                case 'not_found':
                    setStatus('Codice non trovato. Verifica di averlo scritto correttamente.', 'warning');
                    this.notificationUI.showAlert('Nessun salvataggio corrisponde a quel codice.', 'warning');
                    break;
                case 'disabled':
                    setStatus('Sincronizzazione cloud non configurata: controlla le variabili Supabase.', 'warning');
                    this.notificationUI.showAlert('Configura Supabase per usare il recupero cloud.', 'warning');
                    break;
                case 'invalid':
                    setStatus('Il codice contiene caratteri non validi.', 'warning');
                    break;
                default:
                    setStatus('Impossibile collegare il codice per un errore temporaneo.', 'warning');
                    this.notificationUI.showAlert('Errore nel collegamento al cloud, riprova più tardi.', 'warning');
                    break;
            }
        });
    }
    initInstallPrompt() {
        const installButton = $('installConfirm');
        const dismissButton = $('installDismiss');
        dismissButton?.addEventListener('click', () => {
            this.hideInstallBanner();
            getSettingsStateInstance().updateSettings({ installPromptDismissed: true });
            recordEvent('pwa:promptDismissed');
        });
        installButton?.addEventListener('click', async () => {
            if (!this.deferredInstallPrompt) {
                this.notificationUI.showAlert('Installazione non disponibile. Usa il menu del browser per aggiungere Pebble.', 'warning');
                return;
            }
            try {
                await this.deferredInstallPrompt.prompt();
                const outcome = await this.deferredInstallPrompt.userChoice;
                recordEvent(`pwa:${outcome.outcome}`);
                if (outcome.outcome === 'accepted') {
                    this.notificationUI.showAlert('Pebble è stata aggiunta alla tua schermata Home! 🦦', 'info');
                }
            }
            finally {
                this.deferredInstallPrompt = null;
                this.hideInstallBanner();
                getSettingsStateInstance().updateSettings({ installPromptDismissed: true });
            }
        });
        window.addEventListener('beforeinstallprompt', event => {
            event.preventDefault();
            this.deferredInstallPrompt = event;
            if (getSettingsStateInstance().getSettings().installPromptDismissed) {
                return;
            }
            this.showInstallBanner();
            recordEvent('pwa:promptShown');
        });
        window.addEventListener('appinstalled', () => {
            this.deferredInstallPrompt = null;
            this.hideInstallBanner();
            getSettingsStateInstance().updateSettings({ installPromptDismissed: true });
            recordEvent('pwa:installed');
            this.notificationUI.showAlert('Installazione completata! Trovi Pebble tra le tue app.', 'info');
        });
    }
    showInstallBanner() {
        const banner = $('installBanner');
        if (banner) {
            banner.classList.remove('hidden');
        }
    }
    hideInstallBanner() {
        const banner = $('installBanner');
        if (banner) {
            banner.classList.add('hidden');
        }
    }
    initNamePrompt() {
        const form = $('nameForm');
        const input = $('petNameInput');
        if (!form || !input)
            return;
        form.addEventListener('submit', event => {
            event.preventDefault();
            const rawValue = input.value ?? '';
            getGameStateInstance().setPetName(rawValue);
            recordEvent('nome:impostato');
        });
    }
    initTutorial() {
        const overlay = $('tutorialOverlay');
        const startBtn = $('tutorialStart');
        const analyticsToggle = $('analyticsOptInTutorial');
        if (!overlay || !startBtn || !analyticsToggle)
            return;
        const closeOverlay = () => {
            overlay.classList.add('hidden');
            overlay.setAttribute('aria-hidden', 'true');
            window.setTimeout(() => {
                const target = $('feedBtn');
                target?.focus();
            }, 0);
        };
        if (getSettingsStateInstance().getSettings().tutorialSeen) {
            closeOverlay();
        }
        const handleStart = () => {
            getSettingsStateInstance().updateSettings({ tutorialSeen: true, analyticsOptIn: analyticsToggle.checked });
            closeOverlay();
            recordEvent('tutorial:completato');
            this.notificationUI.showAlert('Benvenuto in Pebble! Prenditi cura della tua lontra 🦦', 'info');
            startBtn.removeEventListener('click', handleStart);
        };
        startBtn.addEventListener('click', handleStart);
    }
    initUpdateBanner() {
        const banner = $('updateBanner');
        const accept = $('updateReload');
        const dismiss = $('updateDismiss');
        if (!banner || !accept || !dismiss)
            return;
        accept.addEventListener('click', () => {
            this.updateConfirm?.();
        });
        dismiss.addEventListener('click', () => {
            banner.classList.add('hidden');
            this.updateDismiss?.();
        });
    }
    initStonePolishing() {
        const wrapper = $('stonePolishingWrapper');
        if (!wrapper)
            return;
        mountStonePolishingActivity(wrapper, {
            baseImage: 'assets/stone-base.png', // Placeholder or actual asset path
            onComplete: () => {
                this.notificationUI.showAlert('Hai lucidato una pietra! La lontra è felice.', 'info');
                const stats = getGameStateInstance().getStats();
                getGameStateInstance().setStats({ happiness: Math.min(100, stats.happiness + 5) });
            }
        });
    }
}
