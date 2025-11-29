import { getState, markCriticalMessage, resetCriticalMessage, resetState, setAnalyticsOptIn, setInstallPromptDismissed, setPetName, setHatOwned, setSunglassesOwned, setScarfOwned, setTutorialSeen, subscribe, serializeBackup, restoreBackupFromString, setThemeMode } from './state.js';
import { batheAction, feedAction, rewardItemPurchase, sleepAction, spendCoins } from './gameActions.js';
import { audioManager, resumeAudioContext } from './audio.js';
import { recordEvent } from './analytics.js';
import { initMiniGame, isMiniGameRunning, openMiniGame } from './minigame.js';
import { mountStonePolishingActivity } from './stonePolishing.js';
import { applyTheme } from './theme.js';
import { disableNotifications, enableNotifications, notifyLowStat, notificationsSupported } from './notifications.js';
import { getGameStateInstance, syncManagerWithLegacyCoreStats } from './gameStateManager.js';
const OTTER_ASSET_BASE = 'src/assets/otter';
const OUTFIT_VARIANTS = [
    { key: 'hatScarfSunglasses', suffix: '-hatScarfSunglasses', required: ['hat', 'scarf', 'sunglasses'] },
    { key: 'hatScarf', suffix: '-hatScarf', required: ['hat', 'scarf'] },
    { key: 'hat', suffix: '-hat', required: ['hat'] }
];
function resolveOutfit(accessories) {
    for (const variant of OUTFIT_VARIANTS) {
        if (variant.required.every(name => accessories[name])) {
            return { key: variant.key, suffix: variant.suffix };
        }
    }
    return { key: 'base', suffix: '' };
}
function buildOtterImage(baseName, accessories) {
    const outfit = resolveOutfit(accessories);
    return {
        src: `${OTTER_ASSET_BASE}/${baseName}${outfit.suffix}.png`,
        outfit: outfit.key
    };
}
function pickAccessories(source) {
    return {
        hat: source.hat,
        scarf: source.scarf,
        sunglasses: source.sunglasses
    };
}
const CRITICAL_MESSAGES = {
    hunger: 'La lontra è affamatissima! Dagli da mangiare prima che diventi triste.',
    happy: 'La lontra è triste, falle fare qualcosa di divertente o falle un bagnetto.',
    clean: 'La lontra è molto sporca. Portala a fare il bagnetto subito!',
    energy: 'La lontra è esausta. Mettila a dormire per recuperare energia.'
};
const STAT_ICONS = {
    hunger: '🍗',
    happy: '🎉',
    clean: '🧼',
    energy: '⚡'
};
function updateThemeButtons(mode) {
    const lightBtn = $('themeLightBtn');
    const comfortBtn = $('themeComfortBtn');
    lightBtn?.classList.toggle('active', mode === 'light');
    comfortBtn?.classList.toggle('active', mode === 'comfort');
}
const otterElements = new Set();
const otterRenderCache = new WeakMap();
const otterAnimationTimers = new WeakMap();
let latestMood = 'neutral';
let latestAccessories = { hat: false, scarf: false, sunglasses: false };
let alertTimeoutId = null;
let updateConfirm = null;
let updateDismiss = null;
let hasFocusedNamePrompt = false;
let deferredInstallPrompt = null;
let installBannerVisible = false;
let stonePolishingActivity = null;
function formatDateTime(iso) {
    if (!iso) {
        return 'Mai sincronizzato';
    }
    try {
        return new Date(iso).toLocaleString();
    }
    catch {
        return iso;
    }
}
function refreshNotificationUI(state) {
    const statusEl = $('notificationStatus');
    const enableBtn = $('notificationEnableBtn');
    const disableBtn = $('notificationDisableBtn');
    const warningEl = $('notificationUnsupported');
    const granted = state.notifications.permission === 'granted';
    const supported = notificationsSupported();
    if (warningEl) {
        warningEl.classList.toggle('hidden', supported);
    }
    if (!supported) {
        if (statusEl) {
            statusEl.textContent = 'Il tuo dispositivo non supporta le notifiche push.';
        }
        enableBtn?.setAttribute('disabled', 'true');
        disableBtn?.setAttribute('disabled', 'true');
        const details = $('notificationNextDetails');
        if (details) {
            details.textContent = '';
        }
        return;
    }
    if (enableBtn) {
        enableBtn.disabled = state.notifications.enabled && granted;
    }
    if (disableBtn) {
        disableBtn.disabled = !state.notifications.enabled;
    }
    if (statusEl) {
        if (!granted) {
            statusEl.textContent = 'Promemoria disattivati. Concedi il permesso per ricevere notifiche.';
        }
        else if (!state.notifications.enabled) {
            statusEl.textContent = 'Permesso attivo, premi "Attiva promemoria" per ricevere segnali di promemoria.';
        }
        else {
            statusEl.textContent = 'Promemoria attivi. Ti avviseremo quando la lontra avrà bisogno di attenzioni.';
        }
    }
    const nextList = $('notificationNextDetails');
    if (nextList) {
        const items = [];
        ['hunger', 'happy', 'clean', 'energy'].forEach(key => {
            const last = state.notifications.lastSent[key];
            if (typeof last === 'number') {
                items.push(`${STAT_ICONS[key]} ${formatDateTime(new Date(last).toISOString())}`);
            }
        });
        nextList.textContent = items.length ? `Ultimi promemoria: ${items.join(' · ')}` : 'Nessun promemoria inviato finora.';
    }
}
function $(id) {
    return document.getElementById(id);
}
function toggleOverlayVisibility(element, show) {
    if (!element) {
        return;
    }
    element.classList.toggle('hidden', !show);
    element.setAttribute('aria-hidden', String(!show));
}
let giftModalOpen = false;
let denJournalOpen = false;
let settingsModalOpen = false;
function setGiftModalVisibility(show) {
    const overlay = $('giftOverlay');
    if (!overlay) {
        return;
    }
    giftModalOpen = show;
    toggleOverlayVisibility(overlay, show);
    overlay.classList.toggle('active', show);
    document.body.classList.toggle('gift-modal-open', show);
}
function hideGiftModal() {
    setGiftModalVisibility(false);
    const trigger = $('giftCloseBtn');
    trigger?.blur();
}
function recomputeOverlayState() {
    const nameOverlay = $('nameOverlay');
    const tutorialOverlay = $('tutorialOverlay');
    const isNameOpen = Boolean(nameOverlay && !nameOverlay.classList.contains('hidden'));
    const isTutorialOpen = Boolean(tutorialOverlay && !tutorialOverlay.classList.contains('hidden'));
    const anyOverlayOpen = settingsModalOpen || isNameOpen || isTutorialOpen;
    document.body.classList.toggle('overlay-active', anyOverlayOpen);
}
function setDenJournalVisibility(visible) {
    const journal = $('denJournal');
    const toggleBtn = $('statsToggleBtn');
    denJournalOpen = visible;
    if (journal) {
        journal.classList.toggle('hidden', !visible);
        journal.setAttribute('aria-hidden', String(!visible));
    }
    if (toggleBtn) {
        toggleBtn.setAttribute('aria-expanded', String(visible));
        toggleBtn.textContent = visible ? 'Nascondi i regali della lontra' : 'Mostra i regali della lontra';
    }
}
function setSettingsOverlayVisibility(visible) {
    const overlay = $('settingsOverlay');
    const settingsBtn = $('settingsBtn');
    const closeBtn = $('settingsCloseBtn');
    settingsModalOpen = visible;
    toggleOverlayVisibility(overlay, visible);
    overlay?.classList.toggle('active', visible);
    if (overlay) {
        overlay.style.display = visible ? 'flex' : 'none';
    }
    if (settingsBtn) {
        settingsBtn.setAttribute('aria-expanded', String(visible));
    }
    if (visible) {
        window.setTimeout(() => closeBtn?.focus(), 0);
    }
    document.body.classList.toggle('settings-open', visible);
    recomputeOverlayState();
}
export function showGiftModal(item) {
    const title = $('giftTitle');
    if (title) {
        title.textContent = 'La tua lontra ha un dono!';
    }
    const message = $('giftMessage');
    if (message) {
        message.textContent = `Ha trovato ${item}.`;
    }
    renderInventory(getGameStateInstance().getInventory());
    setGiftModalVisibility(true);
    window.setTimeout(() => {
        const closeBtn = $('giftCloseBtn');
        closeBtn?.focus();
    }, 0);
}
function initGiftModal() {
    const closeBtn = $('giftCloseBtn');
    const overlay = $('giftOverlay');
    closeBtn?.addEventListener('click', () => hideGiftModal());
    overlay?.addEventListener('click', event => {
        if (event.target === overlay) {
            hideGiftModal();
        }
    });
    window.addEventListener('keydown', event => {
        if (event.key === 'Escape' && giftModalOpen) {
            hideGiftModal();
        }
    });
}
function initSettingsOverlay() {
    const settingsBtn = $('settingsBtn');
    const closeBtn = $('settingsCloseBtn');
    const overlay = $('settingsOverlay');
    settingsBtn?.setAttribute('aria-expanded', 'false');
    settingsBtn?.addEventListener('click', () => {
        setSettingsOverlayVisibility(true);
    });
    closeBtn?.addEventListener('click', () => {
        setSettingsOverlayVisibility(false);
        settingsBtn?.focus();
    });
    overlay?.addEventListener('click', event => {
        if (event.target === overlay) {
            setSettingsOverlayVisibility(false);
            settingsBtn?.focus();
        }
    });
    window.addEventListener('keydown', event => {
        if (event.key === 'Escape' && settingsModalOpen) {
            setSettingsOverlayVisibility(false);
            settingsBtn?.focus();
        }
    });
}
function initDenJournal() {
    const toggleBtn = $('statsToggleBtn');
    if (!toggleBtn) {
        return;
    }
    setDenJournalVisibility(false);
    toggleBtn.addEventListener('click', () => {
        setDenJournalVisibility(!denJournalOpen);
        if (denJournalOpen) {
            recordEvent('nav:den-journal');
        }
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && denJournalOpen) {
            setDenJournalVisibility(false);
        }
    });
}
function showInstallBanner() {
    if (installBannerVisible) {
        return;
    }
    const banner = $('installBanner');
    if (!banner) {
        return;
    }
    banner.classList.remove('hidden');
    installBannerVisible = true;
}
function hideInstallBanner() {
    if (!installBannerVisible) {
        return;
    }
    const banner = $('installBanner');
    if (!banner) {
        return;
    }
    banner.classList.add('hidden');
    installBannerVisible = false;
}
function collectOtterElements() {
    otterElements.clear();
    document.querySelectorAll('.otter-img').forEach(img => {
        otterElements.add(img);
    });
}
function applyMoodClasses(element, mood) {
    element.classList.remove('happy', 'sad', 'sleepy');
    if (mood !== 'neutral') {
        element.classList.add(mood);
    }
}
function applyExpressionToElement(element, mood, accessories, force = false) {
    const { src, outfit } = buildOtterImage(`otter_${mood}`, accessories);
    const cached = otterRenderCache.get(element);
    if (!force && cached && cached.mood === mood && cached.outfit === outfit) {
        return;
    }
    otterRenderCache.set(element, { mood, outfit });
    element.src = src;
    applyMoodClasses(element, mood);
}
function syncOtterExpressions(options = {}) {
    if (!otterElements.size) {
        collectOtterElements();
    }
    const mood = latestMood;
    const accessories = latestAccessories;
    otterElements.forEach(element => {
        if (!options.force && element.dataset.animating) {
            return;
        }
        applyExpressionToElement(element, mood, accessories, options.force ?? false);
    });
}
function getActiveOtterElement() {
    const activeScene = document.querySelector('.scene.active');
    if (activeScene) {
        const activeOtter = activeScene.querySelector('.otter-img');
        if (activeOtter) {
            return activeOtter;
        }
    }
    return $('otterImage');
}
function computeMood(core) {
    if (core.energy < 30) {
        return 'sleepy';
    }
    if (core.happiness > 75 && core.hunger > 50) {
        return 'happy';
    }
    if (core.happiness < 30 || core.hunger < 20) {
        return 'sad';
    }
    return 'neutral';
}
function setBar(element, value) {
    if (!element) {
        return;
    }
    const clamped = Math.max(0, Math.min(100, value));
    element.style.width = `${clamped}%`;
    element.classList.remove('low', 'critical');
    if (clamped < 30) {
        element.classList.add('low');
    }
    if (clamped < 15) {
        element.classList.add('critical');
    }
}
function renderInventory(items) {
    const contexts = [
        { list: $('inventoryList'), empty: $('inventoryEmpty') },
        { list: $('denGiftList'), empty: $('denGiftEmpty') }
    ];
    contexts.forEach(context => {
        const list = context.list;
        const emptyState = context.empty;
        if (!list || !emptyState) {
            return;
        }
        list.replaceChildren();
        if (!items.length) {
            emptyState.classList.remove('hidden');
            list.classList.add('hidden');
            return;
        }
        emptyState.classList.add('hidden');
        list.classList.remove('hidden');
        const fragment = document.createDocumentFragment();
        items.forEach(item => {
            const li = document.createElement('li');
            li.setAttribute('role', 'listitem');
            li.textContent = item;
            fragment.appendChild(li);
        });
        list.appendChild(fragment);
    });
}
function updateStatsView() {
    const state = getState();
    const statCoins = $('statCoins');
    if (statCoins) {
        statCoins.textContent = String(state.coins);
    }
    const statGames = $('statGames');
    if (statGames) {
        statGames.textContent = String(state.stats.gamesPlayed);
    }
    const statFish = $('statFish');
    if (statFish) {
        statFish.textContent = String(state.stats.fishCaught);
    }
    const statItems = $('statItems');
    if (statItems) {
        statItems.textContent = String(state.stats.itemsBought);
    }
    const analyticsSummary = $('analyticsSummary');
    if (analyticsSummary) {
        const entries = Object.entries(state.analytics.events);
        analyticsSummary.textContent = entries.length
            ? entries.map(([key, value]) => `${key}: ${value}`).join(' · ')
            : 'Statistiche opzionali disattivate.';
    }
}
function showAlert(message, variant = 'warning') {
    const banner = $('alertBanner');
    if (!banner) {
        return;
    }
    banner.textContent = message;
    banner.dataset.variant = variant;
    banner.classList.remove('hidden');
    if (alertTimeoutId !== null) {
        window.clearTimeout(alertTimeoutId);
    }
    alertTimeoutId = window.setTimeout(() => {
        banner.classList.add('hidden');
    }, 5000);
}
function evaluateCriticalWarnings() {
    const state = getState();
    ['hunger', 'happy', 'clean', 'energy'].forEach(key => {
        const value = state[key];
        if (value < 15 && !state.criticalHintsShown[key]) {
            markCriticalMessage(key);
            showAlert(CRITICAL_MESSAGES[key]);
            recordEvent(`avviso:${key}`);
            void notifyLowStat(key).catch(() => undefined);
        }
        else if (value > 40 && state.criticalHintsShown[key]) {
            resetCriticalMessage(key);
        }
    });
}
function describeDenAtmosphere(core, state) {
    if (core.energy < 30) {
        return 'Luci soffuse: Pebble è pronta per riposare.';
    }
    if (state.clean < 35) {
        return "Serve un passaggio al fiume: la tana è un po' impolverata.";
    }
    if (core.happiness > 80) {
        return 'Atmosfera festosa: Pebble è entusiasta della tua compagnia!';
    }
    if (core.hunger < 40) {
        return 'Pebble scruta la dispensa: forse è ora di uno snack.';
    }
    return state.theme === 'comfort'
        ? 'La tana è avvolta da luci calde e rilassanti.'
        : 'La tana è luminosa e accogliente, ideale per giocare.';
}
function render() {
    const state = getState();
    const coreManager = getGameStateInstance();
    const coreStats = coreManager.getStats();
    const recoveryCode = $('cloudRecoveryCode');
    if (recoveryCode) {
        recoveryCode.textContent = coreManager.getPlayerId();
    }
    applyTheme(state.theme);
    updateThemeButtons(state.theme);
    const tutorialOverlay = $('tutorialOverlay');
    const nameOverlay = $('nameOverlay');
    const shouldShowNamePrompt = !state.petNameConfirmed;
    const shouldShowTutorial = !state.tutorialSeen && state.petNameConfirmed;
    toggleOverlayVisibility(nameOverlay, shouldShowNamePrompt);
    toggleOverlayVisibility(tutorialOverlay, shouldShowTutorial);
    recomputeOverlayState();
    if (shouldShowNamePrompt) {
        if (!hasFocusedNamePrompt) {
            const nameInput = $('petNameInput');
            if (nameInput) {
                nameInput.value = state.petName ?? 'Pebble';
                window.setTimeout(() => nameInput.focus(), 0);
            }
            hasFocusedNamePrompt = true;
        }
    }
    else {
        hasFocusedNamePrompt = false;
    }
    const nameLabel = $('petNameLabel');
    if (nameLabel) {
        nameLabel.textContent = state.petName || 'Pebble';
    }
    const baseTitle = 'Pebble — Gioco di cura della lontra';
    const trimmedName = state.petName.trim();
    if (state.petNameConfirmed && trimmedName && trimmedName !== 'Pebble') {
        document.title = `${trimmedName} — Pebble`;
    }
    else {
        document.title = baseTitle;
    }
    setBar($('hungerBar'), coreStats.hunger);
    setBar($('happyBar'), coreStats.happiness);
    setBar($('cleanBar'), state.clean);
    setBar($('energyBar'), coreStats.energy);
    const coinsLabel = $('coins');
    if (coinsLabel) {
        coinsLabel.textContent = String(state.coins);
    }
    const denWindowLabel = $('denWindowLabel');
    if (denWindowLabel) {
        denWindowLabel.textContent = describeDenAtmosphere(coreStats, state);
    }
    const mood = computeMood(coreStats);
    const accessories = pickAccessories(state);
    latestMood = mood;
    latestAccessories = accessories;
    syncOtterExpressions();
    renderInventory(coreManager.getInventory());
    updateStatsView();
    evaluateCriticalWarnings();
    updateAnalyticsToggle(state.analyticsOptIn);
    refreshNotificationUI(state);
}
function triggerOtterAnimation(animation) {
    const target = getActiveOtterElement();
    if (!target) {
        return;
    }
    const previousTimer = otterAnimationTimers.get(target);
    if (typeof previousTimer === 'number') {
        window.clearTimeout(previousTimer);
        otterAnimationTimers.delete(target);
    }
    target.classList.remove('hop', 'eating', 'bathing', 'rest');
    target.classList.remove('happy', 'sad', 'sleepy');
    target.dataset.animating = animation;
    const accessories = pickAccessories(getState());
    const applyAction = (assetBase, classes, duration) => {
        const { src } = buildOtterImage(assetBase, accessories);
        otterRenderCache.delete(target);
        target.src = src;
        if (classes.length) {
            target.classList.add(...classes);
        }
        const timerId = window.setTimeout(() => {
            if (classes.length) {
                target.classList.remove(...classes);
            }
            delete target.dataset.animating;
            otterAnimationTimers.delete(target);
            const state = getState();
            const mood = computeMood(getGameStateInstance().getStats());
            const refreshedAccessories = pickAccessories(state);
            latestMood = mood;
            latestAccessories = refreshedAccessories;
            syncOtterExpressions({ force: true });
        }, duration);
        otterAnimationTimers.set(target, timerId);
    };
    if (animation === 'feed') {
        applyAction('otter_eat', ['hop', 'eating'], 1500);
    }
    else if (animation === 'bathe') {
        applyAction('otter_bath', ['bathing'], 1600);
    }
    else if (animation === 'sleep') {
        applyAction('otter_sleepy', ['rest'], 4000);
    }
}
function initActionButtons() {
    const handleFeed = () => {
        void resumeAudioContext();
        feedAction();
        triggerOtterAnimation('feed');
        void audioManager.playSFX('feed', true);
    };
    const handleBath = () => {
        void resumeAudioContext();
        batheAction();
        triggerOtterAnimation('bathe');
        void audioManager.playSFX('splash', true);
    };
    const handleSleep = () => {
        void resumeAudioContext();
        sleepAction();
        triggerOtterAnimation('sleep');
    };
    const handlePlay = () => {
        void resumeAudioContext();
        void audioManager.playSFX('happy', true);
        openMiniGame();
    };
    $('feedBtn')?.addEventListener('click', handleFeed);
    $('bathBtn')?.addEventListener('click', handleBath);
    $('sleepBtn')?.addEventListener('click', handleSleep);
    $('playBtn')?.addEventListener('click', handlePlay);
    $('resetBtn')?.addEventListener('click', () => {
        const confirmed = window.confirm('Sei sicuro di voler ricominciare da zero?');
        if (confirmed) {
            resetState();
            getGameStateInstance().setInventory([]);
            syncManagerWithLegacyCoreStats();
            recordEvent('reset');
            showAlert('Nuova lontra creata. Prenditene cura!', 'info');
        }
    });
}
function initKitchenScene() {
    const dropZone = $('kitchenDropZone');
    const foodButtons = Array.from(document.querySelectorAll('.food-item'));
    const quickFeedBtn = $('kitchenFeedBtn');
    const kitchenOtter = document.querySelector('#kitchenPage .kitchen-otter');
    const kitchenOtterImg = kitchenOtter?.querySelector('.otter-img') ?? null;
    if (!dropZone || !foodButtons.length) {
        return;
    }
    const dropTargets = Array.from(new Set([dropZone, kitchenOtter, kitchenOtterImg].filter((el) => Boolean(el))));
    let currentFood = null;
    let suppressNextClick = false;
    let touchDrag = null;
    const toggleDropHover = (active) => {
        dropTargets.forEach(target => {
            target.classList.toggle('drag-over', active);
        });
    };
    const setActiveFood = (button) => {
        foodButtons.forEach(btn => {
            btn.classList.toggle('active', btn === button);
        });
    };
    const feedWithSnack = (_foodKey) => {
        void resumeAudioContext();
        feedAction();
        triggerOtterAnimation('feed');
        void audioManager.playSFX('feed', true);
        dropZone.classList.add('fed');
        window.setTimeout(() => dropZone.classList.remove('fed'), 1200);
    };
    const resetDragState = () => {
        toggleDropHover(false);
        currentFood = null;
        setActiveFood(null);
        foodButtons.forEach(btn => btn.classList.remove('dragging'));
    };
    const isTouchPointer = (event) => event.pointerType === 'touch' || event.pointerType === 'pen';
    const isPointInsideDropTargets = (x, y) => {
        return dropTargets.some(target => {
            const rect = target.getBoundingClientRect();
            return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        });
    };
    const finishTouchDrag = (event, drop) => {
        if (!touchDrag || touchDrag.pointerId !== event.pointerId) {
            return;
        }
        try {
            touchDrag.button.releasePointerCapture(event.pointerId);
        }
        catch (error) {
            void error;
        }
        if (drop) {
            suppressNextClick = true;
            feedWithSnack(touchDrag.foodKey);
            window.setTimeout(() => {
                suppressNextClick = false;
            }, 0);
        }
        else {
            suppressNextClick = false;
        }
        touchDrag = null;
        resetDragState();
    };
    const bindDropTarget = (element) => {
        element.addEventListener('dragenter', event => {
            event.preventDefault();
            toggleDropHover(true);
        });
        element.addEventListener('dragover', event => {
            event.preventDefault();
            toggleDropHover(true);
        });
        element.addEventListener('dragleave', () => {
            toggleDropHover(false);
        });
        element.addEventListener('drop', event => {
            event.preventDefault();
            const transferred = event.dataTransfer?.getData('text/plain') || currentFood;
            feedWithSnack(transferred ?? null);
            resetDragState();
        });
    };
    dropTargets.forEach(target => bindDropTarget(target));
    foodButtons.forEach(button => {
        button.addEventListener('pointerdown', event => {
            if (!isTouchPointer(event)) {
                return;
            }
            touchDrag = {
                button,
                pointerId: event.pointerId,
                foodKey: button.dataset.food ?? null
            };
            currentFood = touchDrag.foodKey;
            setActiveFood(button);
            button.classList.add('dragging');
            try {
                button.setPointerCapture(event.pointerId);
            }
            catch (error) {
                void error;
            }
            toggleDropHover(isPointInsideDropTargets(event.clientX, event.clientY));
            event.preventDefault();
        });
        button.addEventListener('pointermove', event => {
            if (!touchDrag || touchDrag.pointerId !== event.pointerId) {
                return;
            }
            toggleDropHover(isPointInsideDropTargets(event.clientX, event.clientY));
        });
        button.addEventListener('pointerup', event => {
            if (!touchDrag || touchDrag.pointerId !== event.pointerId) {
                return;
            }
            const shouldDrop = isPointInsideDropTargets(event.clientX, event.clientY);
            finishTouchDrag(event, shouldDrop);
        });
        button.addEventListener('pointercancel', event => {
            if (!touchDrag || touchDrag.pointerId !== event.pointerId) {
                return;
            }
            finishTouchDrag(event, false);
        });
        button.addEventListener('dragstart', event => {
            const foodKey = button.dataset.food ?? null;
            currentFood = foodKey;
            setActiveFood(button);
            button.classList.add('dragging');
            if (event.dataTransfer && foodKey) {
                event.dataTransfer.setData('text/plain', foodKey);
                event.dataTransfer.effectAllowed = 'move';
            }
        });
        button.addEventListener('dragend', () => {
            resetDragState();
        });
        button.addEventListener('click', () => {
            if (suppressNextClick) {
                suppressNextClick = false;
                return;
            }
            setActiveFood(button);
            currentFood = button.dataset.food ?? null;
            feedWithSnack(button.dataset.food ?? null);
        });
    });
    quickFeedBtn?.addEventListener('click', () => {
        currentFood = null;
        setActiveFood(null);
        feedWithSnack(null);
    });
}
function initShop() {
    const buttons = document.querySelectorAll('.buy-btn');
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            const price = Number(button.dataset.price ?? '0');
            const item = button.dataset.item ?? 'item';
            if (spendCoins(price)) {
                if (item === 'hat') {
                    setHatOwned(true);
                }
                else if (item === 'sunglasses') {
                    setSunglassesOwned(true);
                }
                else if (item === 'scarf') {
                    setScarfOwned(true);
                }
                rewardItemPurchase(item);
                showAlert('Acquisto completato! Trovi il nuovo oggetto sulla lontra.', 'info');
            }
            else {
                window.alert('Monete insufficienti. Gioca per guadagnarne di più!');
            }
        });
    });
}
function initNavigation() {
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
            if (!element) {
                return;
            }
            const isVisible = key === scene;
            element.classList.toggle('hidden', !isVisible);
            element.classList.toggle('active', isVisible);
            element.setAttribute('aria-hidden', String(!isVisible));
        });
        collectOtterElements();
        syncOtterExpressions();
        recordEvent(`nav:${scene}`);
        const ambientTarget = ambientByScene[scene];
        if (ambientTarget && audioManager.hasAsset(ambientTarget.track)) {
            void audioManager.playAmbient(ambientTarget.track, ambientTarget.volume);
        }
        else {
            void audioManager.stopAmbient();
        }
        if (scene !== 'den') {
            setDenJournalVisibility(false);
        }
    };
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const target = button.dataset.page ?? 'den';
            if (target === 'stats') {
                showScene('den');
                setDenJournalVisibility(true);
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
            setDenJournalVisibility(true);
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
function initBlink() {
    window.setInterval(() => {
        const img = $('otterImage');
        if (!img || isMiniGameRunning()) {
            return;
        }
        img.classList.add('blink');
        window.setTimeout(() => img.classList.remove('blink'), 180);
    }, 4000 + Math.random() * 2000);
}
function initStonePolishing() {
    const wrapper = $('stonePolishingWrapper');
    const statusEl = $('stonePolishingStatus');
    const startBtn = $('stonePolishingStartBtn');
    if (!wrapper || !statusEl || !startBtn) {
        return;
    }
    const showWrapper = () => {
        wrapper.classList.remove('hidden');
    };
    const updateStatus = (message) => {
        statusEl.textContent = message;
    };
    const startOrReset = async () => {
        await resumeAudioContext();
        showWrapper();
        updateStatus('Strofina il sasso per farlo brillare!');
        startBtn.textContent = 'Ricomincia';
        if (!stonePolishingActivity) {
            stonePolishingActivity = mountStonePolishingActivity(wrapper, {
                baseImage: 'src/assets/activities/stone-polished.svg',
                playScrubSound: () => {
                    void resumeAudioContext();
                    void audioManager.playSFX('splash', true);
                },
                onComplete: () => {
                    updateStatus('Splendido! Il sasso è lucidissimo ✨');
                    showAlert('Il sasso brilla di nuova energia!', 'info');
                    startBtn.textContent = 'Ricomincia';
                }
            });
        }
        else {
            await stonePolishingActivity.reset();
        }
    };
    startBtn.addEventListener('click', () => {
        void startOrReset();
    });
}
function updateAnalyticsToggle(optIn) {
    const toggle = $('analyticsOptInToggle');
    if (toggle) {
        toggle.checked = optIn;
    }
    const tutorialToggle = $('analyticsOptInTutorial');
    if (tutorialToggle) {
        tutorialToggle.checked = optIn;
    }
}
function initAnalyticsToggle() {
    const toggle = $('analyticsOptInToggle');
    if (!toggle) {
        return;
    }
    toggle.addEventListener('change', () => {
        setAnalyticsOptIn(toggle.checked);
        const message = toggle.checked
            ? 'Statistiche locali attivate. I dati restano sul tuo dispositivo.'
            : 'Statistiche locali disattivate.';
        showAlert(message, 'info');
    });
}
function initBackupControls() {
    const exportBtn = $('backupExportBtn');
    const importBtn = $('backupImportBtn');
    const fileInput = $('backupFileInput');
    exportBtn?.addEventListener('click', () => {
        try {
            const backupJson = serializeBackup();
            const petName = getState().petName.trim() || 'Pebble';
            const normalized = petName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'pebble';
            const timestamp = new Date().toISOString().replace(/[:]/g, '-');
            const blob = new Blob([backupJson], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `pebble-backup-${normalized}-${timestamp}.json`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 0);
            showAlert('Backup scaricato! Conserva il file per sicurezza.', 'info');
            recordEvent('backup:export');
        }
        catch (error) {
            console.error('Impossibile generare il backup', error);
            showAlert('Non sono riuscito a creare il backup, riprova.', 'warning');
        }
    });
    if (importBtn && fileInput) {
        importBtn.addEventListener('click', () => {
            fileInput.click();
        });
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files?.[0];
            if (!file) {
                return;
            }
            try {
                const text = await file.text();
                const summary = restoreBackupFromString(text);
                const name = summary.petName || 'Pebble';
                showAlert(`Backup ripristinato! Bentornato ${name}.`, 'info');
                recordEvent('backup:import');
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Backup non valido.';
                showAlert(message, 'warning');
                console.error('Errore nel ripristino del backup', error);
            }
            finally {
                fileInput.value = '';
            }
        });
    }
}
function initCloudSyncControls() {
    const codeLabel = $('cloudRecoveryCode');
    const copyBtn = $('cloudCopyCodeBtn');
    const form = $('cloudRecoveryForm');
    const input = $('cloudRecoveryInput');
    const status = $('cloudRecoveryStatus');
    if (!codeLabel || !form || !input || !status) {
        return;
    }
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
            showAlert('Il tuo browser non consente la copia automatica. Seleziona e copia il codice.', 'warning');
            return;
        }
        try {
            await clipboard.writeText(manager.getPlayerId());
            showAlert('Codice Pebble copiato negli appunti. Conservalo in un luogo sicuro.', 'info');
            setStatus('Codice copiato. Salvalo per futuri ripristini.');
        }
        catch (error) {
            console.warn('Impossibile copiare il codice Supabase negli appunti', error);
            setStatus('Non riesco a copiare automaticamente: seleziona e copia manualmente.', 'warning');
            showAlert('Copia manualmente il codice mostrato nelle impostazioni.', 'warning');
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
                showAlert('Salvataggio cloud sincronizzato. Benvenuto di nuovo!', 'info');
            }
            input.value = '';
            return;
        }
        switch (result.reason) {
            case 'not_found':
                setStatus('Codice non trovato. Verifica di averlo scritto correttamente.', 'warning');
                showAlert('Nessun salvataggio corrisponde a quel codice.', 'warning');
                break;
            case 'disabled':
                setStatus('Sincronizzazione cloud non configurata: controlla le variabili Supabase.', 'warning');
                showAlert('Configura Supabase per usare il recupero cloud.', 'warning');
                break;
            case 'invalid':
                setStatus('Il codice contiene caratteri non validi.', 'warning');
                break;
            default:
                setStatus('Impossibile collegare il codice per un errore temporaneo.', 'warning');
                showAlert('Errore nel collegamento al cloud, riprova più tardi.', 'warning');
                break;
        }
    });
}
function initThemeControls() {
    const lightBtn = $('themeLightBtn');
    const comfortBtn = $('themeComfortBtn');
    lightBtn?.addEventListener('click', () => {
        setThemeMode('light');
        recordEvent('tema:light');
    });
    comfortBtn?.addEventListener('click', () => {
        setThemeMode('comfort');
        recordEvent('tema:comfort');
    });
}
function initNotificationControls() {
    const enableBtn = $('notificationEnableBtn');
    const disableBtn = $('notificationDisableBtn');
    enableBtn?.addEventListener('click', async () => {
        if (!enableBtn) {
            return;
        }
        enableBtn.disabled = true;
        const granted = await enableNotifications();
        enableBtn.disabled = false;
        if (granted) {
            showAlert('Promemoria attivati. Ti avviseremo quando la lontra avrà bisogno di aiuto.', 'info');
        }
        else {
            showAlert('Permesso negato o non disponibile. Controlla le impostazioni del browser.', 'warning');
        }
        refreshNotificationUI(getState());
    });
    disableBtn?.addEventListener('click', async () => {
        if (!disableBtn) {
            return;
        }
        disableBtn.disabled = true;
        await disableNotifications();
        disableBtn.disabled = false;
        showAlert('Promemoria disattivati.', 'info');
        refreshNotificationUI(getState());
    });
}
function initInstallPrompt() {
    const installButton = $('installConfirm');
    const dismissButton = $('installDismiss');
    dismissButton?.addEventListener('click', () => {
        hideInstallBanner();
        setInstallPromptDismissed(true);
        recordEvent('pwa:promptDismissed');
    });
    installButton?.addEventListener('click', async () => {
        if (!deferredInstallPrompt) {
            showAlert('Installazione non disponibile. Usa il menu del browser per aggiungere Pebble.', 'warning');
            return;
        }
        try {
            await deferredInstallPrompt.prompt();
            const outcome = await deferredInstallPrompt.userChoice;
            recordEvent(`pwa:${outcome.outcome}`);
            if (outcome.outcome === 'accepted') {
                showAlert('Pebble è stata aggiunta alla tua schermata Home! 🦦', 'info');
            }
        }
        finally {
            deferredInstallPrompt = null;
            hideInstallBanner();
            setInstallPromptDismissed(true);
        }
    });
    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        deferredInstallPrompt = event;
        if (getState().installPromptDismissed) {
            return;
        }
        showInstallBanner();
        recordEvent('pwa:promptShown');
    });
    window.addEventListener('appinstalled', () => {
        deferredInstallPrompt = null;
        hideInstallBanner();
        setInstallPromptDismissed(true);
        recordEvent('pwa:installed');
        showAlert('Installazione completata! Trovi Pebble tra le tue app.', 'info');
    });
}
function initNamePrompt() {
    const form = $('nameForm');
    const input = $('petNameInput');
    if (!form || !input) {
        return;
    }
    form.addEventListener('submit', event => {
        event.preventDefault();
        const rawValue = input.value ?? '';
        setPetName(rawValue);
        recordEvent('nome:impostato');
    });
}
function initTutorial() {
    const overlay = $('tutorialOverlay');
    const startBtn = $('tutorialStart');
    const analyticsToggle = $('analyticsOptInTutorial');
    if (!overlay || !startBtn || !analyticsToggle) {
        return;
    }
    const closeOverlay = () => {
        overlay.classList.add('hidden');
        overlay.setAttribute('aria-hidden', 'true');
        window.setTimeout(() => {
            const target = $('feedBtn');
            target?.focus();
        }, 0);
    };
    if (getState().tutorialSeen) {
        closeOverlay();
    }
    const handleStart = () => {
        setTutorialSeen();
        setAnalyticsOptIn(analyticsToggle.checked);
        closeOverlay();
        recordEvent('tutorial:completato');
        showAlert('Benvenuto in Pebble! Prenditi cura della tua lontra 🦦', 'info');
        startBtn.removeEventListener('click', handleStart);
    };
    startBtn.addEventListener('click', handleStart);
}
function initUpdateBanner() {
    const banner = $('updateBanner');
    const accept = $('updateReload');
    const dismiss = $('updateDismiss');
    if (!banner || !accept || !dismiss) {
        return;
    }
    accept.addEventListener('click', () => {
        updateConfirm?.();
    });
    dismiss.addEventListener('click', () => {
        banner.classList.add('hidden');
        updateDismiss?.();
    });
}
export function prepareUpdatePrompt(onConfirm, onDismiss) {
    updateConfirm = onConfirm;
    updateDismiss = onDismiss;
    const banner = $('updateBanner');
    if (!banner) {
        return;
    }
    banner.classList.remove('hidden');
    showAlert('Nuova versione disponibile! Premi Aggiorna per ricaricare.', 'info');
}
export function initUI() {
    initActionButtons();
    initKitchenScene();
    initShop();
    initDenJournal();
    initSettingsOverlay();
    initNavigation();
    initBlink();
    initAnalyticsToggle();
    initThemeControls();
    initNotificationControls();
    initBackupControls();
    initCloudSyncControls();
    initInstallPrompt();
    initNamePrompt();
    initTutorial();
    initUpdateBanner();
    initStonePolishing();
    initGiftModal();
    window.addEventListener('pebble-inventory-changed', event => {
        const detail = event.detail;
        if (detail) {
            renderInventory(detail.inventory);
        }
    });
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
                showAlert(`Mini-gioco terminato! Hai catturato ${result} pesci.`, 'info');
            }
        });
    }
    collectOtterElements();
    subscribe(() => render());
    render();
    document.addEventListener('click', () => {
        void resumeAudioContext();
    }, { once: true });
}
