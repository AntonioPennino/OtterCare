import { getState, markCriticalMessage, resetCriticalMessage, resetState, setAnalyticsOptIn, setHatOwned, setSunglassesOwned, setScarfOwned, setTutorialSeen, subscribe } from './state.js';
import { batheAction, feedAction, rewardItemPurchase, sleepAction, spendCoins } from './gameActions.js';
import { playSound, resumeAudioContext } from './audio.js';
import { recordEvent } from './analytics.js';
import { initMiniGame, isMiniGameRunning, openMiniGame } from './minigame.js';
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
let currentMood = 'neutral';
let currentOutfit = 'base';
let hasRenderedOnce = false;
let alertTimeoutId = null;
let updateConfirm = null;
let updateDismiss = null;
function $(id) {
    return document.getElementById(id);
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
function computeMood() {
    const state = getState();
    if (state.energy < 30) {
        return 'sleepy';
    }
    if (state.happy > 75 && state.hunger > 50) {
        return 'happy';
    }
    if (state.happy < 30 || state.hunger < 20) {
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
        }
        else if (value > 40 && state.criticalHintsShown[key]) {
            resetCriticalMessage(key);
        }
    });
}
function render() {
    const state = getState();
    const tutorialOverlay = $('tutorialOverlay');
    if (tutorialOverlay) {
        const shouldShowTutorial = !state.tutorialSeen;
        tutorialOverlay.classList.toggle('hidden', !shouldShowTutorial);
        tutorialOverlay.setAttribute('aria-hidden', String(!shouldShowTutorial));
        document.body.classList.toggle('overlay-active', shouldShowTutorial);
    }
    setBar($('hungerBar'), state.hunger);
    setBar($('happyBar'), state.happy);
    setBar($('cleanBar'), state.clean);
    setBar($('energyBar'), state.energy);
    const coinsLabel = $('coins');
    if (coinsLabel) {
        coinsLabel.textContent = String(state.coins);
    }
    setExpression(computeMood(), pickAccessories(state));
    updateStatsView();
    evaluateCriticalWarnings();
    updateAnalyticsToggle(state.analyticsOptIn);
}
function triggerOtterAnimation(animation) {
    const img = $('otterImage');
    if (!img) {
        return;
    }
    // Optional: Switch to specific action images if available
    const baseAccessories = pickAccessories(getState());
    if (animation === 'feed') {
        img.src = buildOtterImage('otter_eat', baseAccessories).src;
        img.classList.add('hop', 'eating');
        window.setTimeout(() => {
            img.classList.remove('hop', 'eating');
            setExpression(currentMood, pickAccessories(getState())); // Re-ensure correct mood image
        }, 1500);
    }
    else if (animation === 'bathe') {
        img.src = buildOtterImage('otter_bath', baseAccessories).src;
        img.classList.add('bathing');
        window.setTimeout(() => {
            img.classList.remove('bathing');
            setExpression(currentMood, pickAccessories(getState()));
        }, 1600);
    }
    else if (animation === 'sleep') {
        img.src = buildOtterImage('otter_sleepy', baseAccessories).src;
        img.classList.add('rest');
        window.setTimeout(() => {
            img.classList.remove('rest');
            setExpression(computeMood(), pickAccessories(getState()));
        }, 4000);
    }
}
function initActionButtons() {
    $('feedBtn')?.addEventListener('click', () => {
        resumeAudioContext();
        feedAction();
        triggerOtterAnimation('feed');
        playSound('feed');
    });
    $('bathBtn')?.addEventListener('click', () => {
        resumeAudioContext();
        batheAction();
        triggerOtterAnimation('bathe');
        playSound('splash');
    });
    $('sleepBtn')?.addEventListener('click', () => {
        resumeAudioContext();
        sleepAction();
        triggerOtterAnimation('sleep');
    });
    $('playBtn')?.addEventListener('click', () => {
        resumeAudioContext();
        playSound('happy');
        openMiniGame();
    });
    $('resetBtn')?.addEventListener('click', () => {
        const confirmed = window.confirm('Sei sicuro di voler ricominciare da zero?');
        if (confirmed) {
            resetState();
            recordEvent('reset');
            render();
            showAlert('Nuova lontra creata. Prenditene cura!', 'info');
        }
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
                render();
                showAlert('Acquisto completato! Trovi il nuovo oggetto sulla lontra.', 'info');
            }
            else {
                window.alert('Monete insufficienti. Gioca per guadagnarne di più!');
            }
        });
    });
}
function initNavigation() {
    const navButtons = Array.from(document.querySelectorAll('.nav-item'));
    const pages = {
        home: $('homePage'),
        shop: $('shopPage'),
        stats: $('statsPage')
    };
    const showPage = (page) => {
        navButtons.forEach(btn => {
            const isActive = btn.dataset.page === page;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', String(isActive));
        });
        Object.entries(pages).forEach(([key, element]) => {
            if (!element) {
                return;
            }
            const isVisible = key === page;
            element.classList.toggle('hidden', !isVisible);
            element.classList.toggle('active', isVisible);
            element.setAttribute('aria-hidden', String(!isVisible));
        });
        recordEvent(`nav:${page}`);
    };
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const target = (button.dataset.page ?? 'home');
            showPage(target);
        });
    });
    showPage('home');
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
function initTutorial() {
    const overlay = $('tutorialOverlay');
    const startBtn = $('tutorialStart');
    const analyticsToggle = $('analyticsOptInTutorial');
    if (!overlay || !startBtn || !analyticsToggle) {
        return;
    }
    const tutorialSeen = getState().tutorialSeen;
    if (tutorialSeen) {
        overlay.classList.add('hidden');
        return;
    }
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('overlay-active');
    const focusHomeButton = () => {
        const target = $('feedBtn');
        window.setTimeout(() => target?.focus(), 0);
    };
    startBtn.addEventListener('click', () => {
        if (getState().tutorialSeen) {
            overlay.classList.add('hidden');
            overlay.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('overlay-active');
            focusHomeButton();
            return;
        }
        setTutorialSeen();
        setAnalyticsOptIn(analyticsToggle.checked);
        overlay.classList.add('hidden');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('overlay-active');
        focusHomeButton();
        recordEvent('tutorial:completato');
        showAlert('Benvenuto in OtterCare! Prenditi cura della tua lontra 🦦', 'info');
    });
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
    initShop();
    initNavigation();
    initBlink();
    initAnalyticsToggle();
    initTutorial();
    initUpdateBanner();
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
    document.addEventListener('click', () => resumeAudioContext(), { once: true });
}
