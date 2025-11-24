import { getState, markCriticalMessage, resetCriticalMessage, resetState, setAnalyticsOptIn, setInstallPromptDismissed, setPetName, setHatOwned, setSunglassesOwned, setScarfOwned, setTutorialSeen, subscribe, serializeBackup, restoreBackupFromString } from './state.js';
import { batheAction, feedAction, rewardItemPurchase, sleepAction, spendCoins } from './gameActions.js';
import { playSound, resumeAudioContext } from './audio.js';
import { recordEvent } from './analytics.js';
import { initMiniGame, isMiniGameRunning, openMiniGame } from './minigame.js';
import { disableCloudSync, enableCloudSync, forceCloudPush, getFormattedLocalSyncCode, initCloudSyncAutoPush, onCloudSyncEvent, pullCloudState } from './cloudSyncManager.js';
import { isCloudSyncConfigured } from './config.js';
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
let hasFocusedNamePrompt = false;
let deferredInstallPrompt = null;
let installBannerVisible = false;
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
                nameInput.value = state.petName ?? 'OtterCare';
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
        nameLabel.textContent = state.petName || 'OtterCare';
    }
    const baseTitle = 'OtterCare — Gioco di cura della lontra';
    const trimmedName = state.petName.trim();
    if (state.petNameConfirmed && trimmedName && trimmedName !== 'OtterCare') {
        document.title = `${trimmedName} — OtterCare`;
    }
    else {
        document.title = baseTitle;
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
    refreshCloudSyncUI(state);
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
    const navButtons = Array.from(document.querySelectorAll('.nav-item, .desktop-nav-item'));
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
            window.location.hash = target === 'home' ? '' : `#${target}`;
        });
    });
    const applyHash = () => {
        const hash = window.location.hash.replace('#', '');
        if (hash === 'shop' || hash === 'stats') {
            showPage(hash);
            return;
        }
        if (hash === 'home' || hash === '') {
            showPage('home');
            return;
        }
        if (hash === 'play') {
            showPage('home');
            window.setTimeout(() => $('playBtn')?.click(), 300);
            return;
        }
        showPage('home');
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
            const petName = getState().petName.trim() || 'OtterCare';
            const normalized = petName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'ottercare';
            const timestamp = new Date().toISOString().replace(/[:]/g, '-');
            const blob = new Blob([backupJson], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `ottercare-backup-${normalized}-${timestamp}.json`;
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
                const name = summary.petName || 'OtterCare';
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
            showAlert('Installazione non disponibile. Usa il menu del browser per aggiungere OtterCare.', 'warning');
            return;
        }
        try {
            await deferredInstallPrompt.prompt();
            const outcome = await deferredInstallPrompt.userChoice;
            recordEvent(`pwa:${outcome.outcome}`);
            if (outcome.outcome === 'accepted') {
                showAlert('OtterCare è stata aggiunta alla tua schermata Home! 🦦', 'info');
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
        showAlert('Installazione completata! Trovi OtterCare tra le tue app.', 'info');
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
        showAlert('Benvenuto in OtterCare! Prenditi cura della tua lontra 🦦', 'info');
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
    initShop();
    initNavigation();
    initBlink();
    initAnalyticsToggle();
    initBackupControls();
    initCloudSyncAutoPush();
    initCloudSyncUI();
    initInstallPrompt();
    initNamePrompt();
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
