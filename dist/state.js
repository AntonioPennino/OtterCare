const STATE_KEY = 'otter_state_v2';
const STATE_VERSION = 2;
const listeners = [];
function createDefaultState() {
    const now = Date.now();
    return {
        version: STATE_VERSION,
        hunger: 60,
        happy: 70,
        clean: 80,
        energy: 80,
        coins: 0,
        hat: false,
        sunglasses: false,
        scarf: false,
        lastTick: now,
        tutorialSeen: false,
        analyticsOptIn: false,
        stats: {
            gamesPlayed: 0,
            fishCaught: 0,
            itemsBought: 0
        },
        analytics: {
            events: {},
            lastEventAt: null
        },
        criticalHintsShown: {}
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
        criticalHintsShown: {
            ...defaults.criticalHintsShown,
            ...(partial.criticalHintsShown ?? {})
        }
    };
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
