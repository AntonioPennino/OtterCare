import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from './cloudSync.js';
import { getState as getLegacyState, updateState as updateLegacyState } from './state.js';

const LOCAL_STORAGE_KEY = 'pebble:game-state:v1';
const PLAYER_ID_STORAGE_KEY = 'pebble:player-id:v1';
const MIN_ELAPSED_FOR_OFFLINE_MS = 60 * 1000;
const HOURS_TO_GIFT = 4;
const GIFT_PROBABILITY = 0.6;
const MS_PER_HOUR = 60 * 60 * 1000;

const DEFAULT_STATS: CoreStats = {
  hunger: 80,
  happiness: 85,
  energy: 75
};

const DECAY_PER_HOUR: CoreStats = {
  hunger: 1.5,
  happiness: 0.9,
  energy: 1.2
};

const GIFT_POOL: readonly string[] = [
  'Sasso Liscio',
  'Conchiglia Rosa',
  'Conchiglia Tigrata',
  'Sasso Brillante',
  'Conchiglia Spirale'
];

export interface CoreStats {
  hunger: number;
  happiness: number;
  energy: number;
}

interface StoredGameState {
  stats: CoreStats;
  lastLoginDate: number;
  inventory: string[];
}

interface SupabaseGameStateRow {
  id: string;
  stats: CoreStats | null;
  last_login: string | null;
  inventory: string[] | null;
  updated_at: string | null;
}

export interface PebbleGiftEventDetail {
  item: string;
}

export interface OfflineProgressResult {
  hoursAway: number;
  statsBefore: CoreStats;
  statsAfter: CoreStats;
  gift?: string;
}

export class GameState {
  private static instance: GameState | null = null;
  private static supabaseUnavailable = false;
  private static supabaseWarningLogged = false;

  private stats: CoreStats;
  private lastLoginDate: number;
  private inventory: string[];
  private playerId: string;
  private bootstrappedFromStorage = false;
  private hadStoredPlayerId = false;
  private attemptedRemoteRecovery = false;

  private constructor() {
    const stored = this.readFromStorage();
    this.bootstrappedFromStorage = stored.hadData;
    this.stats = stored.state.stats;
    this.lastLoginDate = stored.state.lastLoginDate;
    this.inventory = stored.state.inventory;
    this.playerId = this.resolvePlayerId();
    this.syncStatsToLegacyState({ silent: true });
  }

  public static getInstance(): GameState {
    if (!this.instance) {
      this.instance = new GameState();
    }
    return this.instance;
  }

  public getStats(): CoreStats {
    return this.cloneStats(this.stats);
  }

  public getPlayerId(): string {
    return this.playerId;
  }

  public getInventory(): string[] {
    return [...this.inventory];
  }

  public setInventory(items: string[]): void {
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

  public getLastLoginDate(): number {
    return this.lastLoginDate;
  }

  public setStats(partial: Partial<CoreStats>): void {
    this.stats = this.mergeStats(this.stats, partial);
    this.writeToStorage();
    this.syncStatsToLegacyState();
  }

  public calculateOfflineProgress(now: number = Date.now()): OfflineProgressResult | null {
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

  public async syncWithSupabase(): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return;
    }
    if (GameState.supabaseUnavailable) {
      return;
    }

    try {
      const { data, error } = await supabase
        .from('pebble_game_state')
        .select('stats, last_login, inventory, updated_at')
        .eq('id', this.playerId)
        .maybeSingle();

      if (error) {
        if (error.code === 'PGRST205') {
          GameState.markSupabaseUnavailable();
          return;
        }
        if (error.code !== 'PGRST116') {
        throw error;
        }
      }

      let remote = (data ?? null) as SupabaseGameStateRow | null;
      if (!remote) {
        remote = await this.tryRecoverPlayerIdFromSupabase(supabase);
      }

      if (remote) {
        this.mergeRemoteState(remote);
      }

      const payload: SupabaseGameStateRow = {
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
        if (upsertError.code === 'PGRST205') {
          GameState.markSupabaseUnavailable();
          return;
        }
        throw upsertError;
      }

      this.writeToStorage();
      this.syncStatsToLegacyState();
    } catch (error) {
      if (GameState.isMissingTableError(error)) {
        GameState.markSupabaseUnavailable();
        return;
      }
      console.warn('Impossibile sincronizzare il GameState con Supabase', error);
    }
  }

  private static isMissingTableError(error: unknown): error is { code: string } {
    return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'PGRST205');
  }

  private static markSupabaseUnavailable(): void {
    GameState.supabaseUnavailable = true;
    if (!GameState.supabaseWarningLogged) {
      GameState.supabaseWarningLogged = true;
      console.info('[Pebble] Supabase non configurato per pebble_game_state; sincronizzazione core stats disattivata. Consulta README per lo schema oppure ignora se usi solo il backup cloud.');
    }
  }

  private mergeRemoteState(remote: SupabaseGameStateRow): void {
    const remoteLogin = typeof remote.last_login === 'string' ? Date.parse(remote.last_login) : Number.NaN;
    const remoteStats = this.sanitizeStats(remote.stats);
    const remoteInventory = this.sanitizeInventory(remote.inventory);

    if (Number.isFinite(remoteLogin) && remoteLogin > this.lastLoginDate) {
      this.stats = remoteStats;
      this.lastLoginDate = remoteLogin;
    }

    const mergedInventory = new Set<string>([...this.inventory, ...remoteInventory]);
    const beforeSize = this.inventory.length;
    this.inventory = Array.from(mergedInventory);
    this.syncStatsToLegacyState();
    if (this.inventory.length !== beforeSize) {
      this.notifyInventoryChange();
    }
  }

  private applyDecay(hoursAway: number): void {
    if (hoursAway <= 0) {
      return;
    }

    const apply = (current: number, decayPerHour: number): number => {
      const decayed = current - decayPerHour * hoursAway;
      return this.clampStat(decayed);
    };

    this.stats = {
      hunger: apply(this.stats.hunger, DECAY_PER_HOUR.hunger),
      happiness: apply(this.stats.happiness, DECAY_PER_HOUR.happiness),
      energy: apply(this.stats.energy, DECAY_PER_HOUR.energy)
    };
  }

  private tryGrantGift(hoursAway: number): string | undefined {
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

  private dispatchGiftEvent(item: string): void {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      const event = new CustomEvent<PebbleGiftEventDetail>('pebble-gift-found', {
        detail: { item }
      });
      window.dispatchEvent(event);
    } else {
      console.info(`Pebble gift trovato: ${item}`);
    }
  }

  private mergeStats(current: CoreStats, partial: Partial<CoreStats>): CoreStats {
    return {
      hunger: this.clampStat(partial.hunger ?? current.hunger),
      happiness: this.clampStat(partial.happiness ?? current.happiness),
      energy: this.clampStat(partial.energy ?? current.energy)
    };
  }

  private sanitizeStats(candidate: Partial<CoreStats> | null | undefined): CoreStats {
    if (!candidate) {
      return this.cloneStats(DEFAULT_STATS);
    }
    return {
      hunger: this.clampStat(typeof candidate.hunger === 'number' ? candidate.hunger : DEFAULT_STATS.hunger),
      happiness: this.clampStat(typeof candidate.happiness === 'number' ? candidate.happiness : DEFAULT_STATS.happiness),
      energy: this.clampStat(typeof candidate.energy === 'number' ? candidate.energy : DEFAULT_STATS.energy)
    };
  }

  private sanitizeInventory(candidate: unknown): string[] {
    if (!Array.isArray(candidate)) {
      return [];
    }
    return candidate
      .map(item => (typeof item === 'string' ? item : String(item)))
      .map(item => item.trim())
      .filter(item => item.length > 0);
  }

  private async tryRecoverPlayerIdFromSupabase(client: SupabaseClient): Promise<SupabaseGameStateRow | null> {
    if (this.attemptedRemoteRecovery) {
      return null;
    }
    this.attemptedRemoteRecovery = true;

    if (this.bootstrappedFromStorage || this.hadStoredPlayerId) {
      return null;
    }

    try {
      const { data, error } = await client
        .from('pebble_game_state')
        .select('id, stats, last_login, inventory, updated_at')
        .order('updated_at', { ascending: false })
        .limit(1);

      if (error) {
        if (GameState.isMissingTableError(error)) {
          GameState.markSupabaseUnavailable();
          return null;
        }
        console.warn('Impossibile recuperare lo stato remoto da Supabase', error);
        return null;
      }

      const row = Array.isArray(data) && data.length > 0 ? data[0] as SupabaseGameStateRow : null;
      if (!row || !row.id) {
        return null;
      }

      if (row.id !== this.playerId) {
        this.playerId = row.id;
        this.hadStoredPlayerId = true;
        this.persistPlayerId(this.playerId);
        console.info('[Pebble] playerId recuperato da Supabase dopo reset locale');
      }

      return row;
    } catch (error) {
      console.warn('Errore inatteso nel tentativo di recupero stato Supabase', error);
      return null;
    }
  }

  private readFromStorage(): { state: StoredGameState; hadData: boolean } {
    const storage = this.getStorage();
    if (!storage) {
      return { state: this.createLegacyBackedState(), hadData: false };
    }
    try {
      const raw = storage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) {
        return { state: this.createLegacyBackedState(), hadData: false };
      }
      const parsed = JSON.parse(raw) as Partial<StoredGameState>;
      const stats = this.sanitizeStats(parsed.stats);
      const lastLoginDate = typeof parsed.lastLoginDate === 'number' && Number.isFinite(parsed.lastLoginDate)
        ? parsed.lastLoginDate
        : Date.now();
      const inventory = this.sanitizeInventory(parsed.inventory);
      return { state: { stats, lastLoginDate, inventory }, hadData: true };
    } catch (error) {
      console.warn('Impossibile leggere il GameState locale, verrà ricreato', error);
      return { state: this.createLegacyBackedState(), hadData: false };
    }
  }

  private writeToStorage(): void {
    const storage = this.getStorage();
    if (!storage) {
      return;
    }
    try {
      const payload: StoredGameState = {
        stats: this.cloneStats(this.stats),
        lastLoginDate: this.lastLoginDate,
        inventory: [...this.inventory]
      };
      storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
      this.bootstrappedFromStorage = true;
      this.persistPlayerId(this.playerId, storage);
    } catch (error) {
      console.warn('Impossibile salvare il GameState locale', error);
    }
  }

  private resolvePlayerId(): string {
    const storage = this.getStorage();
    if (!storage) {
      this.hadStoredPlayerId = false;
      return this.generatePlayerId();
    }
    try {
      const existing = storage.getItem(PLAYER_ID_STORAGE_KEY);
      if (existing && existing.trim().length > 0) {
        this.hadStoredPlayerId = true;
        return existing;
      }
    } catch (error) {
      console.warn('Impossibile leggere il playerId salvato, ne verrà generato uno nuovo', error);
    }
    const generated = this.generatePlayerId();
    this.hadStoredPlayerId = false;
    this.persistPlayerId(generated, storage);
    return generated;
  }

  private persistPlayerId(id: string, storageOverride?: Storage | null): void {
    const storage = storageOverride ?? this.getStorage();
    if (!storage) {
      return;
    }
    try {
      storage.setItem(PLAYER_ID_STORAGE_KEY, id);
    } catch (error) {
      console.warn('Impossibile salvare il playerId, verrà rigenerato a ogni avvio', error);
    }
  }

  private getStorage(): Storage | null {
    if (typeof window === 'undefined') {
      return null;
    }
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  private createLegacyBackedState(): StoredGameState {
    const legacyStats = this.getLegacyCoreStats();
    const legacy = this.safeGetLegacyState();
    return {
      stats: this.cloneStats(legacyStats),
      lastLoginDate: legacy?.lastTick ?? Date.now(),
      inventory: []
    };
  }

  private cloneStats(stats: CoreStats): CoreStats {
    return { ...stats };
  }

  private clampStat(value: number): number {
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

  private generatePlayerId(): string {
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
    const random = Math.floor(Math.random() * 0xffff_ffff).toString(16).padStart(8, '0');
    return `player-${Date.now().toString(16)}-${random}`;
  }

  private getLegacyCoreStats(): CoreStats {
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

  private safeGetLegacyState(): ReturnType<typeof getLegacyState> | null {
    try {
      return getLegacyState();
    } catch {
      return null;
    }
  }

  private notifyInventoryChange(): void {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
      return;
    }
    const event = new CustomEvent<{ inventory: string[] }>('pebble-inventory-changed', {
      detail: { inventory: this.getInventory() }
    });
    window.dispatchEvent(event);
  }

  private syncStatsToLegacyState(options: { silent?: boolean } = {}): void {
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

export function calculateOfflineProgress(now?: number): OfflineProgressResult | null {
  return GameState.getInstance().calculateOfflineProgress(now);
}

export async function syncWithSupabase(): Promise<void> {
  await GameState.getInstance().syncWithSupabase();
}

export function getGameStateInstance(): GameState {
  return GameState.getInstance();
}

export function syncManagerWithLegacyCoreStats(): void {
  try {
    const legacy = getLegacyState();
    GameState.getInstance().setStats({
      hunger: legacy.hunger,
      happiness: legacy.happy,
      energy: legacy.energy
    });
  } catch (error) {
    console.warn('Impossibile sincronizzare le statistiche principali con il GameState manager', error);
  }
}
