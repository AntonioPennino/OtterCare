import { BackupPayload, GameState, GameStats } from './types';

const STATE_KEY = 'otter_state_v2';
const STATE_VERSION = 2;
const BACKUP_SCHEMA_VERSION = 1;

type Listener = (state: GameState) => void;

const listeners: Listener[] = [];
let persistentStorageGranted: boolean | null = null;

function createDefaultState(): GameState {
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
    }
  };
}

let state: GameState = createDefaultState();

function mergeState(partial: Partial<GameState> | null | undefined): GameState {
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
    criticalHintsShown: {
      ...defaults.criticalHintsShown,
      ...(partial.criticalHintsShown ?? {})
    }
  };
}

function cloneState(source: GameState): GameState {
  return JSON.parse(JSON.stringify(source)) as GameState;
}

export function getState(): GameState {
  return state;
}

export function subscribe(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) {
      listeners.splice(index, 1);
    }
  };
}

function notify(): void {
  for (const listener of listeners) {
    listener(state);
  }
}

export function loadState(): void {
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    if (!raw) {
      state = createDefaultState();
      saveState();
      return;
    }
    const parsed = JSON.parse(raw) as Partial<GameState>;
    state = mergeState(parsed);
    saveState();
  } catch (error) {
    console.error('Errore nel caricamento dello stato', error);
    state = createDefaultState();
    saveState();
  }
}

export function saveState(): void {
  try {
    state.lastTick = Date.now();
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Errore nel salvataggio dello stato', error);
  }
}

interface UpdateOptions {
  silent?: boolean;
  skipSave?: boolean;
}

export function updateState(mutator: (draft: GameState) => void, options: UpdateOptions = {}): void {
  mutator(state);
  if (!options.skipSave) {
    saveState();
  }
  if (!options.silent) {
    notify();
  }
}

export function resetState(): void {
  state = createDefaultState();
  saveState();
  notify();
}

export function advanceTick(): void {
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

export function modifyCoins(delta: number): void {
  updateState(draft => {
    draft.coins = Math.max(0, draft.coins + delta);
  });
}

export function incrementStat(name: keyof GameStats, amount = 1): void {
  updateState(draft => {
    draft.stats[name] += amount;
  });
}

export function ensureStats(): void {
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

export function setHatOwned(value: boolean): void {
  updateState(draft => {
    draft.hat = value;
  });
}

export function setSunglassesOwned(value: boolean): void {
  updateState(draft => {
    draft.sunglasses = value;
  });
}

export function setScarfOwned(value: boolean): void {
  updateState(draft => {
    draft.scarf = value;
  });
}

export function setPetName(name: string): void {
  const sanitized = name.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  updateState(draft => {
    draft.petName = sanitized.length ? sanitized : 'OtterCare';
    draft.petNameConfirmed = true;
  });
}

export function setInstallPromptDismissed(value: boolean): void {
  updateState(draft => {
    draft.installPromptDismissed = value;
  });
}

export function setTutorialSeen(): void {
  updateState(draft => {
    draft.tutorialSeen = true;
  });
}

export function setAnalyticsOptIn(value: boolean): void {
  updateState(draft => {
    draft.analyticsOptIn = value;
  });
}

export function markCriticalMessage(stat: 'hunger' | 'happy' | 'clean' | 'energy'): void {
  updateState(draft => {
    draft.criticalHintsShown[stat] = true;
  }, { silent: true });
}

export function resetCriticalMessage(stat: 'hunger' | 'happy' | 'clean' | 'energy'): void {
  updateState(draft => {
    if (draft.criticalHintsShown[stat]) {
      delete draft.criticalHintsShown[stat];
    }
  }, { silent: true });
}

export function updateCloudSyncInfo(mutator: (info: GameState['cloudSync']) => void): void {
  updateState(draft => {
    mutator(draft.cloudSync);
  });
}

export async function ensurePersistentStorage(): Promise<boolean> {
  if (persistentStorageGranted === true) {
    return true;
  }

  if (!('storage' in navigator)) {
    persistentStorageGranted = false;
    return false;
  }

  const manager = navigator.storage as StorageManager;
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
  } catch (error) {
    console.warn('Impossibile richiedere storage persistente', error);
    persistentStorageGranted = false;
    return false;
  }
}

export function serializeBackup(): string {
  const snapshot: BackupPayload = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    state: cloneState(state)
  };
  return JSON.stringify(snapshot, null, 2);
}

export function restoreBackupFromString(raw: string): { petName: string; coins: number; exportedAt?: string } {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error('Il file selezionato non è un JSON valido.');
  }

  const resolveState = (): Partial<GameState> => {
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Formato di backup non riconosciuto.');
    }

    const candidate = parsed as Partial<BackupPayload> & Partial<GameState>;

    if ('state' in candidate && candidate.state && typeof candidate.state === 'object') {
      return candidate.state as Partial<GameState>;
    }

    if ('hunger' in candidate || 'coins' in candidate) {
      return candidate as Partial<GameState>;
    }

    throw new Error('Il backup non contiene uno stato valido.');
  };

  const restoredState = mergeState(resolveState());
  state = restoredState;
  saveState();
  notify();

  const payload = parsed as Partial<BackupPayload>;
  return {
    petName: state.petName,
    coins: state.coins,
    exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : undefined
  };
}
