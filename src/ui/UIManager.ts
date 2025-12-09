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
        this.initMerchant();
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

        // Remove existing listeners to avoid duplicates if called multiple times
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode?.replaceChild(newCloseBtn, closeBtn);

        newCloseBtn.addEventListener('click', () => {
            overlay.classList.add('hidden');
            dropZone.innerHTML = '<div class="base-stone"></div>';
            stackHeight = 40; // Reset stack height
        });

        let stackHeight = 40; // Base stone height

        sourceStones.forEach(stone => {
            stone.addEventListener('dragstart', (e) => {
                const dragEvent = e as DragEvent;
                dragEvent.dataTransfer?.setData('text/plain', (stone as HTMLElement).dataset.size || 'medium');
                dragEvent.dataTransfer?.setData('source', 'stone');
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

            const newStone = document.createElement('div');
            newStone.classList.add('stone', 'stacked-stone');
            newStone.textContent = '🪨';

            // Size logic
            if (size === 'large') {
                newStone.style.fontSize = '4rem';
                newStone.style.width = '100px';
                newStone.style.height = '60px';
            } else if (size === 'medium') {
                newStone.style.fontSize = '3rem';
                newStone.style.width = '80px';
                newStone.style.height = '50px';
            } else {
                newStone.style.fontSize = '2rem';
                newStone.style.width = '60px';
                newStone.style.height = '40px';
            }

            // Stack logic (simplified physics)
            newStone.style.bottom = `${stackHeight}px`;
            const offset = (Math.random() - 0.5) * 20;
            newStone.style.left = `calc(50% + ${offset}px)`;
            newStone.style.transform = `translateX(-50%) rotate(${(Math.random() - 0.5) * 10}deg)`;

            dropZone.appendChild(newStone);

            const addedHeight = size === 'large' ? 50 : size === 'medium' ? 40 : 30;
            stackHeight += addedHeight;

            if (navigator.vibrate) navigator.vibrate(20);

            if (stackHeight > 300) {
                this.notificationUI.showAlert('Che equilibrio perfetto...', 'info');
            }
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

        if (snack) {
            recordEvent(`cibo:${snack}`);
        }
    }

    private initMerchant(): void {
        const rugItems = document.querySelectorAll('.rug-item');
        const seaGlassDisplay = $('seaGlassCount');

        const updateDisplay = () => {
            if (seaGlassDisplay) {
                seaGlassDisplay.textContent = String(getGameStateInstance().getStats().seaGlass);
            }
        };

        // Initial update
        updateDisplay();
        getGameStateInstance().subscribe(updateDisplay);

        rugItems.forEach(item => {
            item.addEventListener('click', () => {
                const cost = Number((item as HTMLElement).dataset.cost);
                const itemKey = (item as HTMLElement).dataset.item;

                if (!cost || !itemKey) return;

                if (getGameServiceInstance().spendCoins(cost)) { // spendCoins now uses seaGlass
                    getGameServiceInstance().rewardItemPurchase(itemKey);
                    this.notificationUI.showAlert(`Hai ottenuto: ${itemKey}!`, 'info');
                    // Visual feedback?
                    (item as HTMLElement).style.opacity = '0.5';
                    (item as HTMLElement).style.pointerEvents = 'none';
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

        // Generate Stars
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
                    // Check if already connected
                    const exists = this.connections.some(c =>
                        (c.from === startStar && c.to === targetStar.id) ||
                        (c.from === targetStar.id && c.to === startStar)
                    );

                    if (!exists) {
                        this.connections.push({ from: startStar, to: targetStar.id });
                        if (navigator.vibrate) navigator.vibrate([10, 30, 10]);

                        // Check completion (simple: 7 connections for 8 stars = tree)
                        if (this.connections.length >= this.stars.length - 1) {
                            this.notificationUI.showAlert('Una nuova costellazione!', 'info');
                        }
                    }
                }
            }
            isDragging = false;
            startStar = null;
            draw();
        };

        // Events
        canvas.onmousedown = e => startHandler(e.offsetX, e.offsetY);
        canvas.onmousemove = e => moveHandler(e.offsetX, e.offsetY);
        canvas.onmouseup = e => endHandler(e.offsetX, e.offsetY);

        canvas.ontouchstart = e => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            startHandler(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
        };
        canvas.ontouchmove = e => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            moveHandler(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
        };
        canvas.ontouchend = e => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            // Use changedTouches for end
            endHandler(e.changedTouches[0].clientX - rect.left, e.changedTouches[0].clientY - rect.top);
        };

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw connections
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
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

            // Draw active line
            if (isDragging && startStar !== null) {
                const s = this.stars.find(s => s.id === startStar);
                if (s) {
                    ctx.beginPath();
                    ctx.moveTo(s.x, s.y);
                    ctx.lineTo(currentMouse.x, currentMouse.y);
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                    ctx.setLineDash([5, 5]);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            }

            // Draw stars
            this.stars.forEach(s => {
                ctx.fillStyle = '#FFF';
                ctx.shadowBlur = 10;
                ctx.shadowColor = '#FFF';
                ctx.beginPath();
                ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            });
        };

        draw();
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

            playerNameInput.addEventListener('change', () => {
                getGameStateInstance().setPlayerName(playerNameInput.value);
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
