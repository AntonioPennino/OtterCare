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
        this.initDenScene();
        this.initKitchenScene();
        this.initHygieneScene();
        this.initGamesScene();
        this.initMerchant();
        this.initDailyBonus();
        this.initJournal(); // New Journal Init

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
            // Exit Zen Mode on click if active? Or maybe a specific gesture?
            // For now, let's keep Zen Mode strict until toggled off in journal, 
            // BUT we need a way to open the journal if in Zen Mode?
            // Actually, Zen Mode hides the trigger too. 
            // Let's make tapping the screen in Zen Mode briefly show the UI.
            if (document.body.classList.contains('zen-mode')) {
                this.tempShowUI();
            }
        }, { capture: true }); // Capture to handle before other clicks if needed
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
        if (gameState.getIsSleeping()) {
            mood = 'sleepy'; // Force sleepy if sleeping
        } else if (coreStats.happiness > 80 && coreStats.hunger > 80 && coreStats.energy > 80) {
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

    private initDenScene(): void {
        const lantern = document.getElementById('denLantern');
        if (!lantern) return;

        // Force initial audio context resume on user interaction to ensure audio starts
        document.body.addEventListener('click', () => {
            if (audioManager['context']?.state === 'suspended') {
                void audioManager.resume();
            }
        }, { once: true });

        // Sync initial state from GameState
        let isNight = getGameStateInstance().getIsSleeping();
        if (isNight) {
            document.body.classList.add('night-mode');
            // If night, play fireplace ambient if in den, or quiet? 
            // handleSceneChange will handle it on scroll, but initial state?
            // Let's rely on handleSceneChange triggering on init via intersection observer.
        }

        lantern.addEventListener('click', () => {
            isNight = !isNight;

            if (isNight) {
                // Goodnight
                getGameServiceInstance().sleep();
                // Trigger sleep animation
                this.otterRenderer.triggerAnimation('sleep', getGameStateInstance().getEquipped(), () => { });
                document.body.classList.add('night-mode');
                this.notificationUI.showAlert('Buonanotte, Pebble...', 'info');
                if (navigator.vibrate) navigator.vibrate(50);
            } else {
                // Good morning
                getGameServiceInstance().wakeUp();
                document.body.classList.remove('night-mode');

                // Just let the mood sync handle the visual state (happy/neutral)
                // removing explicit 'feed' animation which looked like eating.

                this.notificationUI.showAlert('Buongiorno!', 'info');
                if (navigator.vibrate) navigator.vibrate([20, 50, 20]);

                // Play happy sound with variance
                void audioManager.playSFX('happy', true);
            }
        });
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

    private handleTouchDrag(source: HTMLElement, touch: Touch, scene: 'kitchen' | 'hygiene' | 'stone', onDrop?: (elementUnder: Element | null) => void): void {
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
            e.preventDefault(); // Prevent scrolling while dragging
            updateGhost(e.touches[0].clientX, e.touches[0].clientY);
        };

        const endHandler = (e: TouchEvent) => {
            ghost.remove();
            document.removeEventListener('touchmove', moveHandler);
            document.removeEventListener('touchend', endHandler);

            // Check drop
            const changedTouch = e.changedTouches[0];
            const elementUnder = document.elementFromPoint(changedTouch.clientX, changedTouch.clientY);

            if (onDrop) {
                onDrop(elementUnder);
                return;
            }

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
                            void audioManager.playSFX('splash', true);
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

        // Stone Polishing (Now Stone Stacking)
        const stoneBtn = document.getElementById('stonePolishingStartBtn');
        stoneBtn?.addEventListener('click', () => {
            const overlay = $('stoneStackingOverlay');
            if (overlay) overlay.classList.remove('hidden');
        });

        this.initStoneStacking();

        // The Current (Water Flow)
        const currentBtn = document.createElement('div');
        currentBtn.className = 'draggable-item';
        currentBtn.textContent = '🌊';
        currentBtn.id = 'currentRitualStartBtn';
        // Append to context panel if not exists, or just use existing logic if I can find where to put it.
        // For now, let's assume I need to add it to the HTML manually or just append it here if the container exists.
        // Actually, let's just bind to an ID that I will add to index.html later or now.
        // Let's assume the user wants me to add the button to index.html as well.
        // For now, I'll just add the listener and assume the button exists or I'll add it in a separate step.

        // Let's add the button to the DOM dynamically for now to save a step, or better, just bind it.
        // I will add the button to index.html in the next step.
        const currentStartBtn = document.getElementById('currentRitualStartBtn');
        currentStartBtn?.addEventListener('click', () => {
            const overlay = $('currentRitualOverlay');
            if (overlay) {
                overlay.classList.remove('hidden');
                this.startCurrentAnimation();
            }
        });

        this.initCurrentRitual();

        // Firefly Connection (Constellations)
        const fireflyStartBtn = document.getElementById('fireflyRitualStartBtn');
        fireflyStartBtn?.addEventListener('click', () => {
            const overlay = $('fireflyRitualOverlay');
            if (overlay) {
                overlay.classList.remove('hidden');
                this.startFireflyLevel();
            }
        });

        this.initFireflyRitual();
    }

    private currentAnimationId: number | null = null;

    private initCurrentRitual(): void {
        const overlay = $('currentRitualOverlay');
        const closeBtn = $('closeCurrentRitual');

        if (!overlay || !closeBtn) return;

        // Clone to remove old listeners
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode?.replaceChild(newCloseBtn, closeBtn);

        newCloseBtn.addEventListener('click', () => {
            overlay.classList.add('hidden');
            if (this.currentAnimationId) {
                cancelAnimationFrame(this.currentAnimationId);
                this.currentAnimationId = null;
            }
        });
    }

    private startCurrentAnimation(): void {
        const canvas = $('currentCanvas');
        if (!canvas) return;

        canvas.innerHTML = ''; // Clear
        const particles: { x: number, y: number, speed: number, size: number, element: HTMLElement }[] = [];

        // Create particles
        for (let i = 0; i < 50; i++) {
            const p = document.createElement('div');
            p.classList.add('flow-particle');
            const size = Math.random() * 20 + 10;
            p.style.width = `${size}px`;
            p.style.height = `${size}px`;
            canvas.appendChild(p);

            particles.push({
                x: Math.random() * canvas.offsetWidth,
                y: Math.random() * canvas.offsetHeight,
                speed: Math.random() * 2 + 1,
                size: size,
                element: p
            });
        }

        let mouseX = -1000;
        let mouseY = -1000;
        let lastCalmRequest = 0;

        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            mouseX = e.clientX - rect.left;
            mouseY = e.clientY - rect.top;
        });

        canvas.addEventListener('touchmove', (e) => {
            const rect = canvas.getBoundingClientRect();
            mouseX = e.touches[0].clientX - rect.left;
            mouseY = e.touches[0].clientY - rect.top;
        }, { passive: true });

        const animate = () => {
            particles.forEach(p => {
                p.y += p.speed;

                // Interaction: Repel from mouse/touch
                const dx = p.x - mouseX;
                const dy = p.y - mouseY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 100) {
                    const angle = Math.atan2(dy, dx);
                    p.x += Math.cos(angle) * 5;
                    p.y += Math.sin(angle) * 5;

                    // Chance to find glass
                    const rewardResult = getGameServiceInstance().rewardTheCurrent();
                    if (rewardResult) {
                        if (Math.random() < 0.1) this.notificationUI.showAlert('+1 Glass', 'info');
                    } else if (getGameServiceInstance().getDailyUsage('current') >= 10) {
                        // Notification for Calm River (debounced)
                        const now = Date.now();
                        if (now - lastCalmRequest > 5000) {
                            this.notificationUI.showAlert('La corrente si è calmata...', 'warning');
                            lastCalmRequest = now;
                        }
                    }
                }

                // Reset if out of bounds
                if (p.y > canvas.offsetHeight + 50) {
                    p.y = -50;
                    p.x = Math.random() * canvas.offsetWidth;
                }
                if (p.x > canvas.offsetWidth + 50) p.x = -50;
                if (p.x < -50) p.x = canvas.offsetWidth + 50;

                p.element.style.transform = `translate(${p.x}px, ${p.y}px)`;
            });

            this.currentAnimationId = requestAnimationFrame(animate);
        };

        animate();
    }

    private initStoneStacking(): void {
        const overlay = $('stoneStackingOverlay');
        const closeBtn = $('closeStoneStacking');
        const dropZone = $('stoneDropZone');
        const sourceStones = document.querySelectorAll('.draggable-stone');

        if (!overlay || !closeBtn || !dropZone) return;

        // Remove existing listeners to avoid duplicates
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode?.replaceChild(newCloseBtn, closeBtn);

        newCloseBtn.addEventListener('click', () => {
            // Check for reward before closing
            const relativeHeight = stackHeight - 40;
            const reward = getGameServiceInstance().rewardStoneStacking(relativeHeight);
            if (reward > 0) {
                this.notificationUI.showAlert(`Hai trovato ${reward} river glass!`, 'info');
            } else if (relativeHeight > 100 && getGameServiceInstance().getDailyUsage('stones') >= 25) {
                this.notificationUI.showAlert('Hai trovato l\'equilibrio (ma niente cristalli).', 'info');
            }

            overlay.classList.add('hidden');
            resetStack();
        });

        let stackHeight = 40; // Base stone height
        let balanceScore = 0; // 0 = perfect balance. +/- means tipping left/right.
        const BALANCE_THRESHOLD = 150;

        const resetStack = () => {
            dropZone.innerHTML = '<div class="base-stone"></div>';
            stackHeight = 40;
            balanceScore = 0;
        };

        const placeStone = (size: string) => {
            const newStone = document.createElement('div');
            newStone.classList.add('stone', 'stacked-stone');

            // Asset based on size? Ideally yes, but we only have 'rock.png' icon or emoji.
            // Let's stick to emoji or if we had assets we'd use them.
            // The task was replacing Menu Emojis. The stones themselves are still styled <div>s with emojis in previous code.
            // Let's keep emoji for the stone *visual* inside the div for now, or use the rock.png?
            // "rock.png" is a singular icon. Let's use the rock.png as background?
            // User put `rock.png` in menu. Let's try to use `rock.png` here for consistency if easy.
            // Actually, let's stick to the emoji 🪨 or an image tag if we want.
            // For now, keeping logic focused on physics.
            newStone.textContent = '';
            const img = document.createElement('img');
            img.src = 'src/assets/menu-icons/rock.png';
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'contain';
            newStone.appendChild(img);

            let weight = 1;
            let width = 60;
            let height = 40;

            // Size logic
            if (size === 'large') {
                width = 100; height = 60; weight = 3;
            } else if (size === 'medium') {
                width = 80; height = 50; weight = 2;
            } else {
                width = 60; height = 40; weight = 1;
            }

            newStone.style.width = `${width}px`;
            newStone.style.height = `${height}px`;
            newStone.style.display = 'flex';
            newStone.style.alignItems = 'center';
            newStone.style.justifyContent = 'center';

            // Physics / Offset
            // Make offset a bit more random/dangerous
            const offset = (Math.random() - 0.5) * 50; // Range -25 to +25

            // Calculate new balance
            // Instability increases as we go higher (lever arm effect?)
            // Simplified: Add (offset * weight).
            balanceScore += offset * weight;

            // Visual positioning
            newStone.style.bottom = `${stackHeight}px`;
            newStone.style.left = `calc(50% + ${offset}px)`;

            // Rotation reflects current instability
            const lean = balanceScore / 10; // Simple fallback
            newStone.style.transform = `translateX(-50%) rotate(${lean}deg)`;

            dropZone.appendChild(newStone);

            // Check collapse
            if (Math.abs(balanceScore) > BALANCE_THRESHOLD) {
                // COLLAPSE!
                if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
                void audioManager.playSFX('splash', true); // Or 'thud'
                this.notificationUI.showAlert('Crollato!', 'error');

                // Visual collapse effect (simple timeout reset)
                setTimeout(() => {
                    resetStack();
                }, 800);
                return;
            }

            stackHeight += height * 0.8; // Overlap slightly

            if (navigator.vibrate) navigator.vibrate(20);

            if (stackHeight > 300) {
                // High stack!
                // Maybe check balance for bonus?
                if (Math.abs(balanceScore) < 50) {
                    this.notificationUI.showAlert('Equilibrio Zen!', 'success');
                }
            }
        };

        sourceStones.forEach(stone => {
            // Desktop Drag
            stone.addEventListener('dragstart', (e) => {
                const dragEvent = e as DragEvent;
                dragEvent.dataTransfer?.setData('text/plain', (stone as HTMLElement).dataset.size || 'medium');
                dragEvent.dataTransfer?.setData('source', 'stone');
            });

            // Mobile Touch
            stone.addEventListener('touchstart', (e) => {
                const touchEvent = e as TouchEvent;
                touchEvent.preventDefault();
                const size = (stone as HTMLElement).dataset.size || 'medium';
                this.handleTouchDrag(stone as HTMLElement, touchEvent.touches[0], 'stone', (elementUnder) => {
                    if (elementUnder && (elementUnder === dropZone || dropZone.contains(elementUnder))) {
                        placeStone(size);
                    }
                });
            });
        });

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            const size = e.dataTransfer?.getData('text/plain');
            const source = e.dataTransfer?.getData('source');

            if (source !== 'stone' || !size) return;
            placeStone(size);
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

        if (navigator.vibrate) navigator.vibrate(20);
        void audioManager.playSFX('feed', true); // Crunch sound

        if (snack) {
            recordEvent(`cibo:${snack}`);
        }
    }

    private initMerchant(): void {
        const shopTrigger = $('shopTrigger');
        const shopOverlay = $('shopOverlay');
        const closeShopBtn = $('closeShopBtn');
        const shopItems = document.querySelectorAll('.shop-item');
        const seaGlassDisplay = $('seaGlassCount');

        const updateDisplay = () => {
            if (seaGlassDisplay) {
                seaGlassDisplay.textContent = String(getGameStateInstance().getStats().seaGlass);
            }
        };

        // Initial update
        updateDisplay();
        getGameStateInstance().subscribe(updateDisplay);

        // Open Shop
        shopTrigger?.addEventListener('click', () => {
            shopOverlay?.classList.remove('hidden');
        });

        // Close Shop
        closeShopBtn?.addEventListener('click', () => {
            shopOverlay?.classList.add('hidden');
        });

        // Purchase Logic
        shopItems.forEach(item => {
            item.addEventListener('click', () => {
                const cost = Number((item as HTMLElement).dataset.cost);
                const itemKey = (item as HTMLElement).dataset.item;

                if (!cost || !itemKey) return;

                if (getGameServiceInstance().spendCoins(cost)) {
                    getGameServiceInstance().rewardItemPurchase(itemKey);
                    this.notificationUI.showAlert(`Hai ottenuto: ${itemKey}!`, 'info');

                    // Visual feedback
                    item.classList.add('purchased');
                    (item as HTMLElement).style.opacity = '0.5';
                    (item as HTMLElement).style.pointerEvents = 'none'; // Disable further clicks
                } else {
                    this.notificationUI.showAlert('Non hai abbastanza Vetri di Mare.', 'warning');
                }
            });
        });
    }

    private fireflyAnimationId: number | null = null;
    private stars: { x: number, y: number, connected: boolean, id: number }[] = [];
    private connections: { from: number, to: number }[] = [];

    private initFireflyRitual(): void {
        const overlay = $('fireflyRitualOverlay');
        const closeBtn = $('closeFireflyRitual');

        if (!overlay || !closeBtn) return;

        // Clone to remove old listeners
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode?.replaceChild(newCloseBtn, closeBtn);

        newCloseBtn.addEventListener('click', () => {
            overlay.classList.add('hidden');
            // Reset logic if needed
        });
    }

    private startFireflyLevel(): void {
        const canvas = $('fireflyCanvas') as HTMLCanvasElement;
        if (!canvas) return;

        // Resize canvas
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Generate Stars Helper
        const generateStars = () => {
            this.stars = [];
            this.connections = [];
            for (let i = 0; i < 8; i++) {
                this.stars.push({
                    x: Math.random() * (canvas.width - 100) + 50,
                    y: Math.random() * (canvas.height - 100) + 50,
                    connected: false,
                    id: i
                });
            }
        };

        generateStars();

        let isDragging = false;
        let startStar: number | null = null;
        let currentMouse = { x: 0, y: 0 };

        const getStarAt = (x: number, y: number) => {
            return this.stars.find(s => Math.hypot(s.x - x, s.y - y) < 30);
        };

        const startHandler = (x: number, y: number) => {
            const star = getStarAt(x, y);
            if (star) {
                isDragging = true;
                startStar = star.id;
                currentMouse = { x, y };
            }
        };

        const moveHandler = (x: number, y: number) => {
            if (isDragging) {
                currentMouse = { x, y };
                draw();
            }
        };

        const endHandler = (x: number, y: number) => {
            if (isDragging && startStar !== null) {
                const targetStar = getStarAt(x, y);
                if (targetStar && targetStar.id !== startStar) {
                    // Connect!
                    const alreadyConnected = this.connections.some(c =>
                        (c.from === startStar && c.to === targetStar.id) ||
                        (c.from === targetStar.id && c.to === startStar)
                    );

                    if (!alreadyConnected) {
                        this.connections.push({ from: startStar, to: targetStar.id });
                        if (navigator.vibrate) navigator.vibrate(10);

                        // Reward!
                        if (getGameServiceInstance().rewardFireflyConnection()) {
                            // Small reward
                        }

                        // Check Completion (All stars used in at least one connection)
                        const connectedSet = new Set<number>();
                        this.connections.forEach(c => {
                            connectedSet.add(c.from);
                            connectedSet.add(c.to);
                        });

                        if (connectedSet.size === this.stars.length) {
                            // WIN!
                            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
                            void audioManager.playSFX('happy', true);
                            this.notificationUI.showAlert('Costellazione completata!', 'success');

                            // Visual fanfare?
                            ctx!.fillStyle = 'rgba(255, 255, 255, 0.8)';
                            ctx!.fillRect(0, 0, canvas.width, canvas.height);

                            // Reset level after brief pause
                            setTimeout(() => {
                                generateStars(); // Re-generate
                                draw();
                            }, 1500);
                        }
                    }
                }
                draw();
            }
        };

        const draw = () => {
            if (!ctx) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw connections
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 2;
            this.connections.forEach(c => {
                const s1 = this.stars.find(s => s.id === c.from);
                const s2 = this.stars.find(s => s.id === c.to);
                if (s1 && s2) {
                    ctx.beginPath();
                    ctx.moveTo(s1.x, s1.y);
                    ctx.lineTo(s2.x, s2.y);
                    ctx.stroke();
                }
            });

            // Draw drag line
            if (isDragging) {
                const s = this.stars.find(star => star.id === startStar);
                if (s) {
                    ctx.beginPath();
                    ctx.moveTo(s.x, s.y);
                    ctx.lineTo(currentMouse.x, currentMouse.y);
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                    ctx.stroke();
                }
            }

            // Draw stars
            this.stars.forEach(star => {
                ctx.fillStyle = 'white';
                ctx.beginPath();
                ctx.arc(star.x, star.y, 4, 0, Math.PI * 2);
                ctx.fill();
                // Glow
                ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.beginPath();
                ctx.arc(star.x, star.y, 10, 0, Math.PI * 2);
                ctx.fill();
            });
        };

        canvas.addEventListener('mousedown', (e) => startHandler(e.offsetX, e.offsetY));
        canvas.addEventListener('mousemove', (e) => moveHandler(e.offsetX, e.offsetY));
        canvas.addEventListener('mouseup', (e) => {
            endHandler(e.offsetX, e.offsetY);
            isDragging = false;
            draw();
        });

        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            startHandler(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            moveHandler(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
        }, { passive: false });

        canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const t = e.changedTouches[0];
            endHandler(t.clientX - rect.left, t.clientY - rect.top);
            isDragging = false;
            draw();
        }); // Missing bracket fix? No, endHandler call matches logic

        draw();
    }

    private initDailyBonus(): void {
        const overlay = $('dailyBonusOverlay');
        const closeBtn = $('closeDailyBonusBtn');
        const claimBtn = $('claimDailyBonusBtn') as HTMLButtonElement;
        const grid = $('dailyGrid');

        if (!overlay || !closeBtn || !claimBtn || !grid) return;

        // Open/Close logic
        closeBtn.addEventListener('click', () => {
            overlay.classList.add('hidden');
        });

        const gameState = getGameStateInstance();

        // Render UI
        const renderBonusUI = () => {
            grid.innerHTML = '';

            // Assume 1-7 Day Cycle for Visuals
            const currentStreak = gameState.getDailyStreak();
            const status = gameState.getDailyBonusStatus();

            // Cycle visual logic
            // If checking future days, we want to show 1..7.
            // If streak is 0, we show 1..7.
            // If streak is 7 and claimed, we show 1..7 all claimed.
            // If streak is 7 and NOT claimed, we show 1..7 with 7 active.

            // Calculate "Visual Cycle" base (0, 7, 14...)
            // If (streak % 7 == 0) and !canClaim: we finished a cycle. Show the FINISHED cycle (streak-7 to streak).
            // Else show the CURRENT cycle (containing next claim).

            let cycleBase = Math.floor(currentStreak / 7) * 7;
            if (currentStreak > 0 && currentStreak % 7 === 0 && !status.canClaim) {
                cycleBase = currentStreak - 7;
            }

            for (let i = 1; i <= 7; i++) {
                const dayNum = cycleBase + i;
                const reward = gameState.getDailyRewardPreview(dayNum);

                const el = document.createElement('div');
                el.className = 'daily-day';

                // Determine State
                // Claimed: dayNum <= currentStreak
                // Active: dayNum == currentStreak + 1 (AND canClaim) -> Actually status.currentDay handles this logic?
                // Let's rely on comparisons with currentStreak.

                let isClaimed = dayNum <= currentStreak;
                let isActive = false;
                let isLocked = dayNum > currentStreak;

                if (status.canClaim && dayNum === status.currentDay) {
                    isClaimed = false;
                    isActive = true;
                    isLocked = false;
                }

                if (isClaimed) el.classList.add('claimed');
                if (isActive) el.classList.add('active');
                if (isLocked && !isActive) el.classList.add('locked');

                // Content
                let icon = reward.type === 'seaGlass' ? '💎' : '🎁';
                if (reward.type === 'item') icon = '🎒'; // Specific icon?

                el.innerHTML = `
                    <div class="day-box-label">Giorno ${i}</div>
                    <div class="day-box-reward">${icon}</div>
                    <div style="font-size: 0.8rem; font-weight:bold;">${typeof reward.value === 'number' ? reward.value : ''}</div>
                `;

                grid.appendChild(el);
            }

            if (status.canClaim) {
                claimBtn.disabled = false;
                claimBtn.textContent = 'Riscatta';
            } else {
                claimBtn.disabled = true;
                claimBtn.textContent = 'Torna Domani';
            }
        };

        // Claim Action
        claimBtn.addEventListener('click', () => {
            const result = gameState.claimDailyBonus();
            if (result) {
                if (result.type === 'seaGlass') {
                    this.notificationUI.showAlert(`Bonus riscosso: ${result.value} Sea Glass!`, 'info');
                } else {
                    this.notificationUI.showAlert(`Bonus riscosso: ${result.value}!`, 'info');
                }
                void audioManager.playSFX('happy', true);
                if (navigator.vibrate) navigator.vibrate(100);

                renderBonusUI(); // Re-render to show checkmark

                // Close after delay
                setTimeout(() => {
                    overlay.classList.add('hidden');
                }, 1500);
            }
        });

        // Initialize
        renderBonusUI();

        // Auto-show if available
        // Auto-show if available (once per calendar day, persistent)
        const today = new Date().toDateString();
        const lastAutoShow = localStorage.getItem('pebble_daily_bonus_last_shown');

        if (gameState.getDailyBonusStatus().canClaim && lastAutoShow !== today) {
            // Tiny delay to ensure load
            setTimeout(() => {
                overlay.classList.remove('hidden');
                void audioManager.playSFX('pop', true);
                localStorage.setItem('pebble_daily_bonus_last_shown', today);
            }, 1000);
        }
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

    private initJournal(): void {
        const trigger = $('journalTrigger');
        const overlay = $('journalOverlay');
        const closeBtn = $('journalCloseBtn');

        if (!trigger || !overlay || !closeBtn) return;

        trigger.addEventListener('click', () => {
            overlay.classList.remove('hidden');
            this.updateJournalStats();
        });

        closeBtn.addEventListener('click', () => {
            overlay.classList.add('hidden');
        });

        // Page Navigation
        document.querySelectorAll('.next-page-btn, .prev-page-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetPage = (e.target as HTMLElement).dataset.target;
                if (targetPage) {
                    document.querySelectorAll('.journal-page').forEach(page => page.classList.add('hidden'));
                    document.querySelector(`.journal-page[data-page="${targetPage}"]`)?.classList.remove('hidden');
                }
            });
        });

        // Zen Mode Toggle
        const zenToggle = $('zenModeToggle') as HTMLInputElement;
        if (zenToggle) {
            zenToggle.addEventListener('change', () => {
                if (zenToggle.checked) {
                    document.body.classList.add('zen-mode');
                    overlay.classList.add('hidden'); // Close journal to enjoy Zen
                    this.notificationUI.showAlert('Zen Mode attiva. Tocca lo schermo per mostrare i controlli.', 'info');
                } else {
                    document.body.classList.remove('zen-mode');
                }
            });
        }

        // Player Name Input
        const playerNameInput = $('playerNameInput') as HTMLInputElement;
        if (playerNameInput) {
            // Load initial value
            playerNameInput.value = getGameStateInstance().getPlayerName();

            playerNameInput.addEventListener('change', (e) => {
                const name = (e.target as HTMLInputElement).value;
                getGameStateInstance().setPlayerName(name);
            });
        }

        // Backup Logic
        const idDisplay = $('playerIdDisplay') as HTMLInputElement;
        const copyBtn = $('copyIdBtn');
        const restoreBtn = $('restoreSaveBtn');

        if (idDisplay) idDisplay.value = getGameStateInstance().getPlayerId();

        if (copyBtn && idDisplay) {
            copyBtn.addEventListener('click', () => {
                idDisplay.select();
                navigator.clipboard.writeText(idDisplay.value);
                this.notificationUI.showAlert('ID copiato negli appunti!', 'success');
            });
        }

        if (restoreBtn) {
            restoreBtn.addEventListener('click', async () => {
                const code = prompt('Inserisci il codice di recupero (ID):\nATTENZIONE: Questo sovrascriverà i dati attuali!');
                if (code) {
                    const result = await getGameStateInstance().recoverFromCloudCode(code);
                    if (result.ok) {
                        alert('Salvataggio recuperato con successo! Il gioco verrà ricaricato.');
                        window.location.reload();
                    } else {
                        const msg = result.reason === 'not_found' ? 'Codice non trovato' : 'Errore nel recupero';
                        this.notificationUI.showAlert(msg, 'error');
                    }
                }
            });
        }
    }

    private updateJournalStats(): void {
        const stats = getGameStateInstance().getStats();
        const petName = getGameStateInstance().getPetName();

        const happyEl = $('journalHappy');
        const hungerEl = $('journalHunger');
        const nameEl = $('journalPetName');
        const daysEl = $('daysCount');

        if (happyEl) happyEl.textContent = stats.happiness > 70 ? 'Molto Felice' : stats.happiness > 30 ? 'Serena' : 'Triste';
        if (hungerEl) hungerEl.textContent = stats.hunger > 70 ? 'Piena' : stats.hunger > 30 ? 'Soddisfatta' : 'Affamata';
        if (nameEl) nameEl.textContent = petName || 'Pebble';
        if (daysEl) daysEl.textContent = String(getGameStateInstance().getDaysPlayed());
    }

    private tempShowUI(): void {
        document.body.classList.remove('zen-mode');
        setTimeout(() => {
            // Only re-enable zen mode if the toggle is still checked
            const zenToggle = $('zenModeToggle') as HTMLInputElement;
            if (zenToggle && zenToggle.checked) {
                document.body.classList.add('zen-mode');
            }
        }, 3000);
    }
}
