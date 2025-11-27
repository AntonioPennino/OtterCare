import { getSupabaseClient } from './cloudSync.js';
import { getState as getLegacyState, updateState as updateLegacyState } from './state.js';
const LOCAL_STORAGE_KEY = 'pebble:game-state:v1';
const PLAYER_ID_STORAGE_KEY = 'pebble:player-id:v1';
const MIN_ELAPSED_FOR_OFFLINE_MS = 60 * 1000;
const HOURS_TO_GIFT = 4;
const GIFT_PROBABILITY = 0.6;
const MS_PER_HOUR = 60 * 60 * 1000;
const DEFAULT_STATS = {
    hunger: 80,
    happiness: 85,
    energy: 75
};
const DECAY_PER_HOUR = {
    hunger: 1.5,
    happiness: 0.9,
    energy: 1.2
};
const GIFT_POOL = [
    'Sasso Liscio',
    'Conchiglia Rosa',
    'Conchiglia Tigrata',
    'Sasso Brillante',
    'Conchiglia Spirale'
];
export class GameState {
    constructor() {
        this.playerId = this.resolvePlayerId();
        const stored = this.readFromStorage();
        this.stats = stored.stats;
        this.lastLoginDate = stored.lastLoginDate;
        this.inventory = stored.inventory;
        this.syncStatsToLegacyState({ silent: true });
    }
    static getInstance() {
        if (!this.instance) {
            this.instance = new GameState();
        }
        return this.instance;
    }
    getStats() {
        return this.cloneStats(this.stats);
    }
    getInventory() {
        return [...this.inventory];
    }
    setInventory(items) {
        const sanitized = this.sanitizeInventory(items);
        const changed = sanitized.length !== this.inventory.length
            || sanitized.some((item, index) => item !== this.inventory[index]);
        if (!changed) {
            return;
        }
        this.inventory = sanitized;
        this.writeToStorage();
        this.notifyInventoryChange();
    }
    getLastLoginDate() {
        return this.lastLoginDate;
    }
    setStats(partial) {
        this.stats = this.mergeStats(this.stats, partial);
        this.writeToStorage();
        this.syncStatsToLegacyState();
    }
    calculateOfflineProgress(now = Date.now()) {
        const previousLogin = this.lastLoginDate;
        if (!Number.isFinite(previousLogin) || previousLogin <= 0) {
            this.lastLoginDate = now;
            this.writeToStorage();
            return null;
        }
        const elapsedMs = now - previousLogin;
        if (elapsedMs < MIN_ELAPSED_FOR_OFFLINE_MS) {
            this.lastLoginDate = now;
            this.writeToStorage();
            return null;
        }
        const hoursAway = elapsedMs / MS_PER_HOUR;
        const statsBefore = this.cloneStats(this.stats);
        this.applyDecay(hoursAway);
        const gift = this.tryGrantGift(hoursAway);
        this.lastLoginDate = now;
        this.writeToStorage();
        this.syncStatsToLegacyState();
        return {
            hoursAway,
            statsBefore,
            statsAfter: this.cloneStats(this.stats),
            gift
        };
    }
    async syncWithSupabase() {
        const supabase = getSupabaseClient();
        if (!supabase) {
            return;
        }
        try {
            const { data, error } = await supabase
                .from('pebble_game_state')
                .select('stats, last_login, inventory, updated_at')
                .eq('id', this.playerId)
                .maybeSingle();
            if (error && error.code !== 'PGRST116') {
                throw error;
            }
            const remote = (data ?? null);
            if (remote) {
                this.mergeRemoteState(remote);
            }
            const payload = {
                id: this.playerId,
                stats: this.cloneStats(this.stats),
                last_login: new Date(this.lastLoginDate).toISOString(),
                inventory: [...this.inventory],
                updated_at: new Date().toISOString()
            };
            const { error: upsertError } = await supabase
                .from('pebble_game_state')
                .upsert(payload, { onConflict: 'id' });
            if (upsertError) {
                throw upsertError;
            }
            this.writeToStorage();
            this.syncStatsToLegacyState();
        }
        catch (error) {
            console.warn('Impossibile sincronizzare il GameState con Supabase', error);
        }
    }
    mergeRemoteState(remote) {
        const remoteLogin = typeof remote.last_login === 'string' ? Date.parse(remote.last_login) : Number.NaN;
        const remoteStats = this.sanitizeStats(remote.stats);
        const remoteInventory = this.sanitizeInventory(remote.inventory);
        if (Number.isFinite(remoteLogin) && remoteLogin > this.lastLoginDate) {
            this.stats = remoteStats;
            this.lastLoginDate = remoteLogin;
        }
        const mergedInventory = new Set([...this.inventory, ...remoteInventory]);
        const beforeSize = this.inventory.length;
        this.inventory = Array.from(mergedInventory);
        this.syncStatsToLegacyState();
        if (this.inventory.length !== beforeSize) {
            this.notifyInventoryChange();
        }
    }
    applyDecay(hoursAway) {
        if (hoursAway <= 0) {
            return;
        }
        const apply = (current, decayPerHour) => {
            const decayed = current - decayPerHour * hoursAway;
            return this.clampStat(decayed);
        };
        this.stats = {
            hunger: apply(this.stats.hunger, DECAY_PER_HOUR.hunger),
            happiness: apply(this.stats.happiness, DECAY_PER_HOUR.happiness),
            energy: apply(this.stats.energy, DECAY_PER_HOUR.energy)
        };
    }
    tryGrantGift(hoursAway) {
        if (hoursAway < HOURS_TO_GIFT) {
            return undefined;
        }
        if (Math.random() > GIFT_PROBABILITY) {
            return undefined;
        }
        const giftIndex = Math.floor(Math.random() * GIFT_POOL.length);
        const gift = GIFT_POOL[giftIndex];
        this.inventory.push(gift);
        this.dispatchGiftEvent(gift);
        this.notifyInventoryChange();
        this.writeToStorage();
        return gift;
    }
    dispatchGiftEvent(item) {
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            const event = new CustomEvent('pebble-gift-found', {
                detail: { item }
            });
            window.dispatchEvent(event);
        }
        else {
            console.info(`Pebble gift trovato: ${item}`);
        }
    }
    mergeStats(current, partial) {
        return {
            hunger: this.clampStat(partial.hunger ?? current.hunger),
            happiness: this.clampStat(partial.happiness ?? current.happiness),
            energy: this.clampStat(partial.energy ?? current.energy)
        };
    }
    sanitizeStats(candidate) {
        if (!candidate) {
            return this.cloneStats(DEFAULT_STATS);
        }
        return {
            hunger: this.clampStat(typeof candidate.hunger === 'number' ? candidate.hunger : DEFAULT_STATS.hunger),
            happiness: this.clampStat(typeof candidate.happiness === 'number' ? candidate.happiness : DEFAULT_STATS.happiness),
            energy: this.clampStat(typeof candidate.energy === 'number' ? candidate.energy : DEFAULT_STATS.energy)
        };
    }
    sanitizeInventory(candidate) {
        if (!Array.isArray(candidate)) {
            return [];
        }
        return candidate
            .map(item => (typeof item === 'string' ? item : String(item)))
            .map(item => item.trim())
            .filter(item => item.length > 0);
    }
    readFromStorage() {
        const storage = this.getStorage();
        if (!storage) {
            return this.createLegacyBackedState();
        }
        try {
            const raw = storage.getItem(LOCAL_STORAGE_KEY);
            if (!raw) {
                return this.createLegacyBackedState();
            }
            const parsed = JSON.parse(raw);
            const stats = this.sanitizeStats(parsed.stats);
            const lastLoginDate = typeof parsed.lastLoginDate === 'number' && Number.isFinite(parsed.lastLoginDate)
                ? parsed.lastLoginDate
                : Date.now();
            const inventory = this.sanitizeInventory(parsed.inventory);
            return { stats, lastLoginDate, inventory };
        }
        catch (error) {
            console.warn('Impossibile leggere il GameState locale, verrà ricreato', error);
            return this.createLegacyBackedState();
        }
    }
    writeToStorage() {
        const storage = this.getStorage();
        if (!storage) {
            return;
        }
        try {
            const payload = {
                stats: this.cloneStats(this.stats),
                lastLoginDate: this.lastLoginDate,
                inventory: [...this.inventory]
            };
            storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
        }
        catch (error) {
            console.warn('Impossibile salvare il GameState locale', error);
        }
    }
    resolvePlayerId() {
        const storage = this.getStorage();
        if (!storage) {
            return this.generatePlayerId();
        }
        const existing = storage.getItem(PLAYER_ID_STORAGE_KEY);
        if (existing && existing.trim().length > 0) {
            return existing;
        }
        const generated = this.generatePlayerId();
        try {
            storage.setItem(PLAYER_ID_STORAGE_KEY, generated);
        }
        catch (error) {
            console.warn('Impossibile salvare il playerId, verrà rigenerato a ogni avvio', error);
        }
        return generated;
    }
    getStorage() {
        if (typeof window === 'undefined') {
            return null;
        }
        try {
            return window.localStorage;
        }
        catch {
            return null;
        }
    }
    createLegacyBackedState() {
        const legacyStats = this.getLegacyCoreStats();
        const legacy = this.safeGetLegacyState();
        return {
            stats: this.cloneStats(legacyStats),
            lastLoginDate: legacy?.lastTick ?? Date.now(),
            inventory: []
        };
    }
    cloneStats(stats) {
        return { ...stats };
    }
    clampStat(value) {
        if (!Number.isFinite(value)) {
            return 0;
        }
        if (value < 0) {
            return 0;
        }
        if (value > 100) {
            return 100;
        }
        return Math.round(value * 10) / 10;
    }
    generatePlayerId() {
        if (typeof crypto !== 'undefined') {
            if (typeof crypto.randomUUID === 'function') {
                return crypto.randomUUID();
            }
            if (typeof crypto.getRandomValues === 'function') {
                const buffer = new Uint8Array(16);
                crypto.getRandomValues(buffer);
                return Array.from(buffer).map(byte => byte.toString(16).padStart(2, '0')).join('');
            }
        }
        const random = Math.floor(Math.random() * 4294967295).toString(16).padStart(8, '0');
        return `player-${Date.now().toString(16)}-${random}`;
    }
    getLegacyCoreStats() {
        const legacy = this.safeGetLegacyState();
        if (!legacy) {
            return this.cloneStats(DEFAULT_STATS);
        }
        return {
            hunger: this.clampStat(typeof legacy.hunger === 'number' ? legacy.hunger : DEFAULT_STATS.hunger),
            happiness: this.clampStat(typeof legacy.happy === 'number' ? legacy.happy : DEFAULT_STATS.happiness),
            energy: this.clampStat(typeof legacy.energy === 'number' ? legacy.energy : DEFAULT_STATS.energy)
        };
    }
    safeGetLegacyState() {
        try {
            return getLegacyState();
        }
        catch {
            return null;
        }
    }
    notifyInventoryChange() {
        if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
            return;
        }
        const event = new CustomEvent('pebble-inventory-changed', {
            detail: { inventory: this.getInventory() }
        });
        window.dispatchEvent(event);
    }
    syncStatsToLegacyState(options = {}) {
        const legacy = this.safeGetLegacyState();
        if (!legacy) {
            return;
        }
        const snapshot = this.cloneStats(this.stats);
        const changed = legacy.hunger !== snapshot.hunger
            || legacy.happy !== snapshot.happiness
            || legacy.energy !== snapshot.energy;
        if (!changed) {
            return;
        }
        updateLegacyState(draft => {
            draft.hunger = snapshot.hunger;
            draft.happy = snapshot.happiness;
            draft.energy = snapshot.energy;
        }, { silent: options.silent ?? false });
    }
}
GameState.instance = null;
export function calculateOfflineProgress(now) {
    return GameState.getInstance().calculateOfflineProgress(now);
}
export async function syncWithSupabase() {
    await GameState.getInstance().syncWithSupabase();
}
export function getGameStateInstance() {
    return GameState.getInstance();
}
export function syncManagerWithLegacyCoreStats() {
    try {
        const legacy = getLegacyState();
        GameState.getInstance().setStats({
            hunger: legacy.hunger,
            happiness: legacy.happy,
            energy: legacy.energy
        });
    }
    catch (error) {
        console.warn('Impossibile sincronizzare le statistiche principali con il GameState manager', error);
    }
}
