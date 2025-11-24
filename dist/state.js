const STATE_KEY = 'otter_state_v2';
const STATE_VERSION = 2;
const BACKUP_SCHEMA_VERSION = 1;
const listeners = [];
let persistentStorageGranted = null;
function generateClientId() {
    const buffer = new Uint8Array(8);
    crypto.getRandomValues(buffer);
    return Array.from(buffer, byte => byte.toString(16).padStart(2, '0')).join('');
}
function createDefaultState() {
    const now = Date.now();
    return {
        version: STATE_VERSION,
        hunger: 60,
        happy: 70,
        clean: 80,
        energy: 80,
        coins: 0,
        petName: 'OtterCare',
        petNameConfirmed: false,
        installPromptDismissed: false,
        hat: false,
        sunglasses: false,
        scarf: false,
        lastTick: now,
        tutorialSeen: false,
        analyticsOptIn: false,
        theme: 'light',
        stats: {
            gamesPlayed: 0,
            fishCaught: 0,
            itemsBought: 0
        },
        analytics: {
            events: {},
            lastEventAt: null
        },
        criticalHintsShown: {},
        cloudSync: {
            enabled: false,
            recordId: null,
            lastSyncedAt: null,
            lastRemoteUpdate: null
        },
        notifications: {
            enabled: false,
            permission: typeof Notification !== 'undefined' ? Notification.permission : 'default',
            lastPromptAt: null,
            subscriptionId: null,
            clientId: generateClientId(),
            lastSent: {
                hunger: undefined,
                happy: undefined,
                clean: undefined,
                energy: undefined
            }
        }
    };
}
let state = createDefaultState();
function mergeState(partial) {
    const defaults = createDefaultState();
    if (!partial) {
        return defaults;
    }
    return {
        ...defaults,
        ...partial,
        version: STATE_VERSION,
        petName: typeof partial.petName === 'string' && partial.petName.trim().length
            ? partial.petName.replace(/[<>]/g, '').trim().slice(0, 24)
            : defaults.petName,
        petNameConfirmed: typeof partial.petNameConfirmed === 'boolean'
            ? partial.petNameConfirmed
            : false,
        installPromptDismissed: typeof partial.installPromptDismissed === 'boolean'
            ? partial.installPromptDismissed
            : defaults.installPromptDismissed,
        theme: partial.theme === 'comfort' ? 'comfort' : 'light',
        stats: {
            ...defaults.stats,
            ...(partial.stats ?? {})
        },
        analytics: {
            ...defaults.analytics,
            ...(partial.analytics ?? {}),
            events: {
                ...defaults.analytics.events,
                ...((partial.analytics && partial.analytics.events) || {})
            }
        },
        cloudSync: {
            ...defaults.cloudSync,
            ...(partial.cloudSync ?? {}),
            recordId: typeof partial.cloudSync?.recordId === 'string'
                ? partial.cloudSync.recordId.slice(0, 128)
                : defaults.cloudSync.recordId,
            lastSyncedAt: partial.cloudSync?.lastSyncedAt ?? defaults.cloudSync.lastSyncedAt,
            lastRemoteUpdate: partial.cloudSync?.lastRemoteUpdate ?? defaults.cloudSync.lastRemoteUpdate
        },
        notifications: {
            ...defaults.notifications,
            ...(partial.notifications ?? {}),
            permission: (partial.notifications?.permission ?? defaults.notifications.permission),
            clientId: typeof partial.notifications?.clientId === 'string' && partial.notifications.clientId.trim().length
                ? partial.notifications.clientId.slice(0, 32)
                : defaults.notifications.clientId,
            lastSent: {
                ...defaults.notifications.lastSent,
                ...(partial.notifications?.lastSent ?? {})
            }
        },
        criticalHintsShown: {
            ...defaults.criticalHintsShown,
            ...(partial.criticalHintsShown ?? {})
        }
    };
}
function cloneState(source) {
    return JSON.parse(JSON.stringify(source));
}
export function getState() {
    return state;
}
export function subscribe(listener) {
    listeners.push(listener);
    return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) {
            listeners.splice(index, 1);
        }
    };
}
function notify() {
    for (const listener of listeners) {
        listener(state);
    }
}
export function loadState() {
    try {
        const raw = window.localStorage.getItem(STATE_KEY);
        if (!raw) {
            state = createDefaultState();
            saveState();
            return;
        }
        const parsed = JSON.parse(raw);
        state = mergeState(parsed);
        saveState();
    }
    catch (error) {
        console.error('Errore nel caricamento dello stato', error);
        state = createDefaultState();
        saveState();
    }
}
export function saveState() {
    try {
        state.lastTick = Date.now();
        window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
    }
    catch (error) {
        console.error('Errore nel salvataggio dello stato', error);
    }
}
export function updateState(mutator, options = {}) {
    mutator(state);
    if (!options.skipSave) {
        saveState();
    }
    if (!options.silent) {
        notify();
    }
}
export function resetState() {
    state = createDefaultState();
    saveState();
    notify();
}
export function advanceTick() {
    updateState(draft => {
        draft.hunger = Math.max(0, draft.hunger - 0.5);
        draft.happy = Math.max(0, draft.happy - 0.25);
        draft.clean = Math.max(0, draft.clean - 0.15);
        draft.energy = Math.max(0, draft.energy - 0.4);
        if (draft.hunger < 20) {
            draft.happy = Math.max(0, draft.happy - 0.5);
        }
        if (draft.clean < 20) {
            draft.happy = Math.max(0, draft.happy - 0.3);
        }
    });
}
export function modifyCoins(delta) {
    updateState(draft => {
        draft.coins = Math.max(0, draft.coins + delta);
    });
}
export function incrementStat(name, amount = 1) {
    updateState(draft => {
        draft.stats[name] += amount;
    });
}
export function ensureStats() {
    updateState(draft => {
        if (!draft.stats) {
            draft.stats = {
                gamesPlayed: 0,
                fishCaught: 0,
                itemsBought: 0
            };
        }
    }, { skipSave: true, silent: true });
}
export function setHatOwned(value) {
    updateState(draft => {
        draft.hat = value;
    });
}
export function setSunglassesOwned(value) {
    updateState(draft => {
        draft.sunglasses = value;
    });
}
export function setScarfOwned(value) {
    updateState(draft => {
        draft.scarf = value;
    });
}
export function setPetName(name) {
    const sanitized = name.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
    updateState(draft => {
        draft.petName = sanitized.length ? sanitized : 'OtterCare';
        draft.petNameConfirmed = true;
    });
}
export function setInstallPromptDismissed(value) {
    updateState(draft => {
        draft.installPromptDismissed = value;
    });
}
export function setTutorialSeen() {
    updateState(draft => {
        draft.tutorialSeen = true;
    });
}
export function setAnalyticsOptIn(value) {
    updateState(draft => {
        draft.analyticsOptIn = value;
    });
}
export function markCriticalMessage(stat) {
    updateState(draft => {
        draft.criticalHintsShown[stat] = true;
    }, { silent: true });
}
export function resetCriticalMessage(stat) {
    updateState(draft => {
        if (draft.criticalHintsShown[stat]) {
            delete draft.criticalHintsShown[stat];
        }
    }, { silent: true });
}
export function updateCloudSyncInfo(mutator) {
    updateState(draft => {
        mutator(draft.cloudSync);
    });
}
export function setThemeMode(mode) {
    updateState(draft => {
        draft.theme = mode;
    });
}
export function updateNotificationSettings(mutator, options = {}) {
    updateState(draft => {
        mutator(draft.notifications);
    }, options);
}
export function markNotificationPrompted() {
    updateNotificationSettings(settings => {
        settings.lastPromptAt = Date.now();
    });
}
export function markNotificationSent(stat) {
    updateNotificationSettings(settings => {
        settings.lastSent[stat] = Date.now();
    }, { silent: true });
}
export async function ensurePersistentStorage() {
    if (persistentStorageGranted === true) {
        return true;
    }
    if (!('storage' in navigator)) {
        persistentStorageGranted = false;
        return false;
    }
    const manager = navigator.storage;
    if (typeof manager.persist !== 'function') {
        persistentStorageGranted = false;
        return false;
    }
    try {
        if (typeof manager.persisted === 'function') {
            const alreadyPersisted = await manager.persisted();
            if (alreadyPersisted) {
                persistentStorageGranted = true;
                return true;
            }
        }
        const granted = await manager.persist();
        persistentStorageGranted = granted;
        return granted;
    }
    catch (error) {
        console.warn('Impossibile richiedere storage persistente', error);
        persistentStorageGranted = false;
        return false;
    }
}
export function serializeBackup() {
    const snapshot = {
        schemaVersion: BACKUP_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        state: cloneState(state)
    };
    return JSON.stringify(snapshot, null, 2);
}
export function restoreBackupFromString(raw) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        throw new Error('Il file selezionato non è un JSON valido.');
    }
    const resolveState = () => {
        if (!parsed || typeof parsed !== 'object') {
            throw new Error('Formato di backup non riconosciuto.');
        }
        const candidate = parsed;
        if ('state' in candidate && candidate.state && typeof candidate.state === 'object') {
            return candidate.state;
        }
        if ('hunger' in candidate || 'coins' in candidate) {
            return candidate;
        }
        throw new Error('Il backup non contiene uno stato valido.');
    };
    const restoredState = mergeState(resolveState());
    state = restoredState;
    saveState();
    notify();
    const payload = parsed;
    return {
        petName: state.petName,
        coins: state.coins,
        exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : undefined
    };
}
