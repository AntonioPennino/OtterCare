import { $ } from './utils.js';
import { applyTheme } from './theme.js';
import { InventoryEventDetail, PlayerIdChangeDetail, Mood } from '../core/types.js';
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
import { mountStonePolishingActivity, StonePolishingActivity } from '../features/stonePolishing.js';

export class UIManager {
    private hud: HUD;
    private inventoryView: InventoryView;
    private otterRenderer: OtterRenderer;
    private modalManager: ModalManager;
    private notificationUI: NotificationUI;
    private deferredInstallPrompt: any = null;
    private updateConfirm: (() => void) | null = null;
    private updateDismiss: (() => void) | null = null;

    constructor() {
        this.hud = new HUD();
        this.inventoryView = new InventoryView();
        this.otterRenderer = new OtterRenderer();
        this.modalManager = new ModalManager(this.inventoryView);
        this.notificationUI = new NotificationUI();
    }

    public init(): void {
        this.initScrollObserver(); // New scroll-based navigation
        this.initBlink();
        this.initAnalyticsToggle();
        // this.initThemeControls(); // Theme controls temporarily hidden in new UI
        this.initNotificationControls();
        this.initCloudSyncControls();
        this.initInstallPrompt();
        this.initNamePrompt();
        this.initTutorial();
        this.initUpdateBanner();
        this.initKitchenScene();
        this.initHygieneScene();
        this.initGamesScene();
        this.initShop();

        // Listen for inventory changes from GameState
        window.addEventListener('pebble-inventory-changed', event => {
            const detail = (event as CustomEvent<InventoryEventDetail>).detail;
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

    public prepareUpdatePrompt(onConfirm: () => void, onDismiss: () => void): void {
        this.updateConfirm = onConfirm;
        this.updateDismiss = onDismiss;
        const banner = $('updateBanner');
        if (!banner) return;
        banner.classList.remove('hidden');
        this.notificationUI.showAlert('Nuova versione disponibile! Premi Aggiorna per ricaricare.', 'info');
    }

    public showGiftModal(item: string): void {
        const gameState = getGameStateInstance();
        this.modalManager.showGiftModal(item, gameState.getInventory());
    }

    private render(): void {
        const gameState = getGameStateInstance();
        const settingsState = getSettingsStateInstance();

        const coreStats = gameState.getStats();
        const equipped = gameState.getEquipped();
        const settings = settingsState.getSettings();

        const pseudoState: any = {
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
        let mood: Mood = 'neutral';
        if (coreStats.happiness > 80 && coreStats.hunger > 80 && coreStats.energy > 80) {
            mood = 'happy';
        } else if (coreStats.happiness < 30 || coreStats.hunger < 30) {
            mood = 'sad';
        } else if (coreStats.energy < 30) {
            mood = 'sleepy';
        }

        this.otterRenderer.sync(mood, equipped);
        this.inventoryView.render(gameState.getInventory());

        // Apply theme
        applyTheme(settings.theme);
    }

    // --- Initialization Methods ---

    private initScrollObserver(): void {
        const container = document.getElementById('worldContainer');
        const scenes = document.querySelectorAll('.scene');

        if (!container) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
                    const sceneId = entry.target.getAttribute('data-scene');
                    if (sceneId) {
                        this.handleSceneChange(sceneId);
                    }
                }
            });
        }, {
            root: container,
            threshold: 0.6
        });

        scenes.forEach(scene => observer.observe(scene));
    }

    private handleSceneChange(sceneId: string): void {
        recordEvent(`nav:${sceneId}`);

        // Ambient Audio Logic
        const ambientByScene: Record<string, { track: string; volume: number }> = {
            den: { track: 'ambient-fireplace', volume: 0.38 },
            kitchen: { track: 'ambient-river', volume: 0.55 },
            hygiene: { track: 'ambient-river', volume: 0.6 },
            games: { track: 'ambient-birds', volume: 0.45 },
            shop: { track: 'ambient-fireplace', volume: 0.35 }
        };

        const ambientTarget = ambientByScene[sceneId];
        if (ambientTarget && audioManager.hasAsset(ambientTarget.track)) {
            void audioManager.playAmbient(ambientTarget.track, ambientTarget.volume);
        } else {
            void audioManager.stopAmbient();
        }
    }

    private initKitchenScene(): void {
        const foodItems = document.querySelectorAll<HTMLElement>('.draggable-item[data-food]');

        foodItems.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer?.setData('text/plain', item.dataset.food || '');
                item.classList.add('dragging');
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
            });

            // Touch support for drag
            item.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.handleTouchDrag(item, e.touches[0], 'kitchen');
            });
        });

        const dropZone = document.querySelector('.kitchen-otter');
        if (dropZone) {
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault(); // Allow drop
            });

            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                const dragEvent = e as DragEvent;
                const foodKey = dragEvent.dataTransfer?.getData('text/plain');
                if (foodKey) {
                    this.feedWithSnack(foodKey);
                }
            });
        }
    }

    private handleTouchDrag(source: HTMLElement, touch: Touch, scene: 'kitchen' | 'hygiene'): void {
        const ghost = source.cloneNode(true) as HTMLElement;
        ghost.style.position = 'fixed';
        ghost.style.zIndex = '1000';
        ghost.style.opacity = '0.8';
        ghost.style.pointerEvents = 'none';
        document.body.appendChild(ghost);

        const updateGhost = (x: number, y: number) => {
            ghost.style.left = `${x - ghost.offsetWidth / 2}px`;
            ghost.style.top = `${y - ghost.offsetHeight / 2}px`;
        };
        updateGhost(touch.clientX, touch.clientY);

        const moveHandler = (e: TouchEvent) => {
            updateGhost(e.touches[0].clientX, e.touches[0].clientY);
        };

        const endHandler = (e: TouchEvent) => {
            ghost.remove();
            document.removeEventListener('touchmove', moveHandler);
            document.removeEventListener('touchend', endHandler);

            // Check drop
            const changedTouch = e.changedTouches[0];
            const elementUnder = document.elementFromPoint(changedTouch.clientX, changedTouch.clientY);

            if (scene === 'kitchen') {
                if (elementUnder && elementUnder.closest('.kitchen-otter')) {
                    this.feedWithSnack(source.dataset.food || null);
                }
            } else if (scene === 'hygiene') {
                // Hygiene logic is continuous rubbing, handled separately
            }
        };

        document.addEventListener('touchmove', moveHandler, { passive: false });
        document.addEventListener('touchend', endHandler);
    }

    private initHygieneScene(): void {
        const sponge = document.getElementById('sponge');
        const otterContainer = document.querySelector('.hygiene-otter');
        const bubblesContainer = document.querySelector('.hygiene-otter'); // Use otter container for bubbles for now

        if (!sponge || !otterContainer) return;

        // Touch logic for rubbing
        sponge.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];

            const ghost = sponge.cloneNode(true) as HTMLElement;
            ghost.style.position = 'fixed';
            ghost.style.zIndex = '1000';
            document.body.appendChild(ghost);

            let lastX = touch.clientX;
            let lastY = touch.clientY;
            let rubProgress = 0;

            const updateGhost = (x: number, y: number) => {
                ghost.style.left = `${x - ghost.offsetWidth / 2}px`;
                ghost.style.top = `${y - ghost.offsetHeight / 2}px`;
            };
            updateGhost(touch.clientX, touch.clientY);

            const moveHandler = (ev: TouchEvent) => {
                const t = ev.touches[0];
                updateGhost(t.clientX, t.clientY);

                // Check collision with otter
                const otterRect = otterContainer.getBoundingClientRect();
                const ghostRect = ghost.getBoundingClientRect();

                const overlap = !(ghostRect.right < otterRect.left ||
                    ghostRect.left > otterRect.right ||
                    ghostRect.bottom < otterRect.top ||
                    ghostRect.top > otterRect.bottom);

                if (overlap) {
                    const delta = Math.hypot(t.clientX - lastX, t.clientY - lastY);
                    if (delta > 5) {
                        rubProgress += delta;
                        if (rubProgress > 500) { // Threshold
                            getGameServiceInstance().bathe();
                            this.otterRenderer.triggerAnimation('bathe', getGameStateInstance().getEquipped(), () => { });
                            this.notificationUI.showAlert('Che bel bagnetto!', 'info');
                            rubProgress = 0;
                            if (navigator.vibrate) navigator.vibrate(50); // Haptic
                        }
                    }
                }
                lastX = t.clientX;
                lastY = t.clientY;
            };

            const endHandler = () => {
                ghost.remove();
                document.removeEventListener('touchmove', moveHandler);
                document.removeEventListener('touchend', endHandler);
            };

            document.addEventListener('touchmove', moveHandler, { passive: false });
            document.addEventListener('touchend', endHandler);
        });
    }

    private initGamesScene(): void {
        const playBtn = document.getElementById('playBtn');
        playBtn?.addEventListener('click', () => {
            openMiniGame();
        });

        // Stone Polishing
        const stoneBtn = document.getElementById('stonePolishingStartBtn');
        stoneBtn?.addEventListener('click', () => {
            this.notificationUI.showAlert('Rituale del sasso in arrivo...', 'info');
        });
    }

    private feedWithSnack(snack: string | null): void {
        const { hunger } = getGameStateInstance().getStats();
        if (hunger >= 100) {
            this.notificationUI.showAlert('La lontra è piena!', 'warning');
            return;
        }

        getGameServiceInstance().feed();
        const equipped = getGameStateInstance().getEquipped();
        this.otterRenderer.triggerAnimation('feed', equipped, () => { });

        if (navigator.vibrate) navigator.vibrate(20); // Haptic feedback

        if (snack) {
            recordEvent(`cibo:${snack}`);
        }
    }

    private initShop(): void {
        // Shop logic...
    }

    private initBlink(): void {
        window.setInterval(() => {
            const img = $('otterImage');
            if (!img || isMiniGameRunning()) {
                return;
            }
            img.classList.add('blink');
            window.setTimeout(() => img.classList.remove('blink'), 180);
        }, 4000 + Math.random() * 2000);
    }

    private initAnalyticsToggle(): void {
        const toggle = $('analyticsOptInToggle') as HTMLInputElement | null;
        if (!toggle) return;
        toggle.addEventListener('change', () => {
            getSettingsStateInstance().updateSettings({ analyticsOptIn: toggle.checked });
        });
    }

    private initNotificationControls(): void {
        const enableBtn = $('notificationEnableBtn') as HTMLButtonElement | null;
        const disableBtn = $('notificationDisableBtn') as HTMLButtonElement | null;

        enableBtn?.addEventListener('click', async () => {
            if (!enableBtn) return;
            enableBtn.disabled = true;
            const granted = await enableNotifications();
            enableBtn.disabled = false;
            if (granted) {
                this.notificationUI.showAlert('Promemoria attivati.', 'info');
            } else {
                this.notificationUI.showAlert('Permesso negato.', 'warning');
            }
            this.notificationUI.refresh(getSettingsStateInstance().getSettings() as any);
        });

        disableBtn?.addEventListener('click', async () => {
            if (!disableBtn) return;
            disableBtn.disabled = true;
            await disableNotifications();
            disableBtn.disabled = false;
            this.notificationUI.showAlert('Promemoria disattivati.', 'info');
            this.notificationUI.refresh(getSettingsStateInstance().getSettings() as any);
        });
    }

    private initCloudSyncControls(): void {
        // Simplified for now
    }

    private initInstallPrompt(): void {
        // Simplified for now
    }

    private initNamePrompt(): void {
        const form = $('nameForm') as HTMLFormElement | null;
        const input = $('petNameInput') as HTMLInputElement | null;
        if (!form || !input) return;

        form.addEventListener('submit', event => {
            event.preventDefault();
            const rawValue = input.value ?? '';
            getGameStateInstance().setPetName(rawValue);
            recordEvent('nome:impostato');
        });
    }

    private initTutorial(): void {
        const overlay = $('tutorialOverlay');
        const startBtn = $('tutorialStart');
        if (!overlay || !startBtn) return;

        const closeOverlay = () => {
            overlay.classList.add('hidden');
        };

        if (getSettingsStateInstance().getSettings().tutorialSeen) {
            closeOverlay();
        }

        startBtn.addEventListener('click', () => {
            getSettingsStateInstance().updateSettings({ tutorialSeen: true });
            closeOverlay();
        });
    }

    private initUpdateBanner(): void {
        const banner = $('updateBanner');
        const accept = $('updateReload');
        const dismiss = $('updateDismiss');
        if (!banner || !accept || !dismiss) return;

        accept.addEventListener('click', () => {
            this.updateConfirm?.();
        });

        dismiss.addEventListener('click', () => {
            banner.classList.add('hidden');
            this.updateDismiss?.();
        });
    }
}
