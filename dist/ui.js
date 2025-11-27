import { getState, markCriticalMessage, resetCriticalMessage, resetState, setAnalyticsOptIn, setInstallPromptDismissed, setPetName, setHatOwned, setSunglassesOwned, setScarfOwned, setTutorialSeen, subscribe, serializeBackup, restoreBackupFromString, setThemeMode } from './state.js';
import { batheAction, feedAction, rewardItemPurchase, sleepAction, spendCoins } from './gameActions.js';
import { audioManager, resumeAudioContext } from './audio.js';
import { recordEvent } from './analytics.js';
import { initMiniGame, isMiniGameRunning, openMiniGame } from './minigame.js';
import { mountStonePolishingActivity } from './stonePolishing.js';
import { disableCloudSync, enableCloudSync, forceCloudPush, getFormattedLocalSyncCode, initCloudSyncAutoPush, onCloudSyncEvent, pullCloudState } from './cloudSyncManager.js';
import { isCloudSyncConfigured } from './config.js';
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
let currentMood = 'neutral';
let currentOutfit = 'base';
let hasRenderedOnce = false;
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
function refreshCloudSyncUI(state) {
    const statusEl = $('cloudSyncStatus');
    const codeWrapper = $('cloudSyncCodeWrapper');
    const codeValue = $('cloudSyncCode');
    const enableBtn = $('cloudSyncEnableBtn');
    const syncBtn = $('cloudSyncSyncBtn');
    const disableBtn = $('cloudSyncDisableBtn');
    const copyBtn = $('cloudSyncCopyBtn');
    const importInput = $('cloudSyncCodeInput');
    const configWarning = $('cloudSyncConfigWarning');
    const configured = isCloudSyncConfigured();
    if (configWarning) {
        configWarning.classList.toggle('hidden', configured);
    }
    if (!configured) {
        if (statusEl) {
            statusEl.textContent = 'Configura Supabase per abilitare la sincronizzazione cloud.';
        }
        enableBtn?.setAttribute('disabled', 'true');
        syncBtn?.setAttribute('disabled', 'true');
        disableBtn?.setAttribute('disabled', 'true');
        copyBtn?.setAttribute('disabled', 'true');
        importInput?.setAttribute('disabled', 'true');
        codeWrapper?.classList.add('hidden');
        return;
    }
    enableBtn?.removeAttribute('disabled');
    importInput?.removeAttribute('disabled');
    const hasCloud = state.cloudSync.enabled && Boolean(state.cloudSync.recordId);
    if (statusEl) {
        statusEl.textContent = hasCloud
            ? `Ultimo salvataggio: ${formatDateTime(state.cloudSync.lastSyncedAt)}`
            : 'Sincronizzazione cloud non attiva.';
    }
    if (hasCloud) {
        const formattedCode = getFormattedLocalSyncCode();
        if (codeValue) {
            codeValue.textContent = formattedCode;
        }
        codeWrapper?.classList.remove('hidden');
        syncBtn?.classList.remove('hidden');
        disableBtn?.classList.remove('hidden');
        syncBtn?.removeAttribute('disabled');
        disableBtn?.removeAttribute('disabled');
        copyBtn?.removeAttribute('disabled');
        enableBtn?.classList.add('hidden');
    }
    else {
        codeWrapper?.classList.add('hidden');
        syncBtn?.classList.add('hidden');
        disableBtn?.classList.add('hidden');
        enableBtn?.classList.remove('hidden');
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
        toggleBtn.textContent = visible ? 'Chiudi diario e statistiche' : 'Apri diario e statistiche';
    }
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
function setExpression(mood, accessories) {
    const img = $('otterImage');
    if (!img) {
        return;
    }
    const { src, outfit } = buildOtterImage(`otter_${mood}`, accessories);
    if (hasRenderedOnce && currentMood === mood && currentOutfit === outfit) {
        return;
    }
    img.src = src;
    img.classList.remove('happy', 'sad', 'sleepy');
    if (mood !== 'neutral') {
        img.classList.add(mood);
    }
    currentMood = mood;
    currentOutfit = outfit;
    hasRenderedOnce = true;
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
    const list = $('inventoryList');
    const emptyState = $('inventoryEmpty');
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
        li.textContent = item;
        fragment.appendChild(li);
    });
    list.appendChild(fragment);
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
function render() {
    const state = getState();
    const coreManager = getGameStateInstance();
    const coreStats = coreManager.getStats();
    applyTheme(state.theme);
    updateThemeButtons(state.theme);
    const tutorialOverlay = $('tutorialOverlay');
    const nameOverlay = $('nameOverlay');
    const shouldShowNamePrompt = !state.petNameConfirmed;
    const shouldShowTutorial = !state.tutorialSeen && state.petNameConfirmed;
    toggleOverlayVisibility(nameOverlay, shouldShowNamePrompt);
    toggleOverlayVisibility(tutorialOverlay, shouldShowTutorial);
    document.body.classList.toggle('overlay-active', shouldShowNamePrompt || shouldShowTutorial);
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
    setExpression(computeMood(coreStats), pickAccessories(state));
    renderInventory(coreManager.getInventory());
    updateStatsView();
    evaluateCriticalWarnings();
    updateAnalyticsToggle(state.analyticsOptIn);
    refreshCloudSyncUI(state);
    refreshNotificationUI(state);
}
function triggerOtterAnimation(animation) {
    const img = $('otterImage');
    if (!img) {
        return;
    }
    // Optional: Switch to specific action images if available
    const baseAccessories = pickAccessories(getState());
    const resolveMood = () => computeMood(getGameStateInstance().getStats());
    if (animation === 'feed') {
        img.src = buildOtterImage('otter_eat', baseAccessories).src;
        img.classList.add('hop', 'eating');
        window.setTimeout(() => {
            img.classList.remove('hop', 'eating');
            setExpression(resolveMood(), pickAccessories(getState()));
        }, 1500);
    }
    else if (animation === 'bathe') {
        img.src = buildOtterImage('otter_bath', baseAccessories).src;
        img.classList.add('bathing');
        window.setTimeout(() => {
            img.classList.remove('bathing');
            setExpression(resolveMood(), pickAccessories(getState()));
        }, 1600);
    }
    else if (animation === 'sleep') {
        img.src = buildOtterImage('otter_sleepy', baseAccessories).src;
        img.classList.add('rest');
        window.setTimeout(() => {
            img.classList.remove('rest');
            setExpression(resolveMood(), pickAccessories(getState()));
        }, 4000);
    }
}
function initActionButtons() {
    $('feedBtn')?.addEventListener('click', () => {
        void resumeAudioContext();
        feedAction();
        triggerOtterAnimation('feed');
        void audioManager.playSFX('feed', true);
    });
    $('bathBtn')?.addEventListener('click', () => {
        void resumeAudioContext();
        batheAction();
        triggerOtterAnimation('bathe');
        void audioManager.playSFX('splash', true);
    });
    $('sleepBtn')?.addEventListener('click', () => {
        void resumeAudioContext();
        sleepAction();
        triggerOtterAnimation('sleep');
    });
    $('playBtn')?.addEventListener('click', () => {
        void resumeAudioContext();
        void audioManager.playSFX('happy', true);
        openMiniGame();
    });
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
    if (!dropZone || !foodButtons.length) {
        return;
    }
    let currentFood = null;
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
        dropZone.classList.remove('drag-over');
        currentFood = null;
        setActiveFood(null);
    };
    dropZone.addEventListener('dragover', event => {
        event.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', event => {
        event.preventDefault();
        const transferred = event.dataTransfer?.getData('text/plain') || currentFood;
        feedWithSnack(transferred ?? null);
        resetDragState();
    });
    foodButtons.forEach(button => {
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
            button.classList.remove('dragging');
            resetDragState();
        });
        button.addEventListener('click', () => {
            setActiveFood(button);
            feedWithSnack(button.dataset.food ?? null);
        });
    });
    quickFeedBtn?.addEventListener('click', () => {
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
    const mainEl = document.querySelector('main');
    const bodyEl = document.body;
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
        const shouldLock = scene === 'den';
        mainEl?.classList.toggle('no-scroll', shouldLock);
        bodyEl.classList.toggle('no-scroll', shouldLock);
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
function initCloudSyncUI() {
    const enableBtn = $('cloudSyncEnableBtn');
    const syncBtn = $('cloudSyncSyncBtn');
    const disableBtn = $('cloudSyncDisableBtn');
    const copyBtn = $('cloudSyncCopyBtn');
    const importBtn = $('cloudSyncImportBtn');
    const importInput = $('cloudSyncCodeInput');
    enableBtn?.addEventListener('click', async () => {
        if (!isCloudSyncConfigured()) {
            showAlert('Configura Supabase prima di attivare la sincronizzazione.', 'warning');
            return;
        }
        enableBtn.disabled = true;
        try {
            const result = await enableCloudSync();
            showAlert(`Cloud sync attivata! Codice: ${result.formattedCode}`, 'info');
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Impossibile attivare il cloud sync.';
            showAlert(message, 'warning');
            console.error('Errore attivazione cloud sync', error);
        }
        finally {
            enableBtn.disabled = false;
            refreshCloudSyncUI(getState());
        }
    });
    syncBtn?.addEventListener('click', async () => {
        syncBtn.disabled = true;
        try {
            await forceCloudPush();
            showAlert('Salvataggio sincronizzato sul cloud.', 'info');
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Sincronizzazione non riuscita.';
            showAlert(message, 'warning');
            console.error('Errore sincronizzazione manuale', error);
        }
        finally {
            syncBtn.disabled = false;
        }
    });
    disableBtn?.addEventListener('click', async () => {
        const confirmed = window.confirm('Vuoi disattivare la sincronizzazione cloud? Il salvataggio remoto resterà disponibile.');
        if (!confirmed) {
            return;
        }
        disableBtn.disabled = true;
        try {
            await disableCloudSync(false);
            showAlert('Cloud sync disattivata. Puoi riattivarla in qualsiasi momento.', 'info');
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Impossibile disattivare il cloud sync.';
            showAlert(message, 'warning');
            console.error('Errore disattivazione cloud sync', error);
        }
        finally {
            disableBtn.disabled = false;
            refreshCloudSyncUI(getState());
        }
    });
    copyBtn?.addEventListener('click', async () => {
        const code = getFormattedLocalSyncCode();
        if (!code) {
            return;
        }
        try {
            await navigator.clipboard.writeText(code);
            showAlert('Codice copiato negli appunti.', 'info');
        }
        catch {
            showAlert('Non sono riuscito a copiare il codice, copialo manualmente.', 'warning');
        }
    });
    importBtn?.addEventListener('click', async () => {
        if (!importInput) {
            return;
        }
        const code = importInput.value.trim();
        if (!code) {
            showAlert('Inserisci un codice di sincronizzazione.', 'warning');
            return;
        }
        importBtn.disabled = true;
        try {
            const info = await pullCloudState(code);
            showAlert(`Progressi recuperati! Bentornato ${info.petName}.`, 'info');
            importInput.value = '';
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Non sono riuscito a recuperare quel codice.';
            showAlert(message, 'warning');
            console.error('Errore recupero cloud sync', error);
        }
        finally {
            importBtn.disabled = false;
            refreshCloudSyncUI(getState());
        }
    });
    onCloudSyncEvent(event => {
        if (event.type === 'status') {
            if (event.status === 'syncing') {
                const statusEl = $('cloudSyncStatus');
                if (statusEl) {
                    statusEl.textContent = 'Sincronizzazione in corso…';
                }
            }
            else {
                refreshCloudSyncUI(getState());
            }
            return;
        }
        if (event.type === 'synced') {
            const statusEl = $('cloudSyncStatus');
            if (statusEl) {
                statusEl.textContent = `Ultimo salvataggio: ${formatDateTime(event.timestamp)}`;
            }
            return;
        }
        if (event.type === 'error') {
            showAlert(event.message, 'warning');
        }
    });
    refreshCloudSyncUI(getState());
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
    initNavigation();
    initBlink();
    initAnalyticsToggle();
    initThemeControls();
    initNotificationControls();
    initBackupControls();
    initCloudSyncAutoPush();
    initCloudSyncUI();
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
    subscribe(() => render());
    render();
    document.addEventListener('click', () => {
        void resumeAudioContext();
    }, { once: true });
}
