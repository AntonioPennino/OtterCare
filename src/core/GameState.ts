import { CoreStats, PebbleGiftEventDetail } from '../types';
import { IStorageService } from './interfaces/IStorageService';
import { ICloudService } from './interfaces/ICloudService';
import { IGameRulesService } from './interfaces/IGameRulesService';

const LOCAL_STORAGE_KEY = 'pebble:game-state:v1';
const PLAYER_ID_STORAGE_KEY = 'pebble:player-id:v1';
const MIN_ELAPSED_FOR_OFFLINE_MS = 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

const DEFAULT_STATS: CoreStats = {
    hunger: 80,
    happiness: 85,
    energy: 75
};

interface StoredGameState {
    stats: CoreStats;
    lastLoginDate: number;
    inventory: string[];
}

export class GameState {
    private stats: CoreStats;
    private lastLoginDate: number;
    private inventory: string[];
    private playerId: string;
    private hadStoredStateOnBoot = false;
    private hadStoredPlayerId = false;
    private attemptedRemoteRecovery = false;

    constructor(
        private storageService: IStorageService,
        private cloudService: ICloudService,
        private gameRulesService: IGameRulesService
    ) {
        const stored = this.readFromStorage();
        this.hadStoredStateOnBoot = stored.hadData;
        this.stats = stored.state.stats;
        this.lastLoginDate = stored.state.lastLoginDate;
        this.inventory = stored.state.inventory;
        this.playerId = this.resolvePlayerId();
        this.dispatchPlayerIdChange();
        this.dispatchPlayerIdChange();
    }

    public getStats(): CoreStats {
        return this.cloneStats(this.stats);
    }

    public getInventory(): string[] {
        return [...this.inventory];
    }

    public getPlayerId(): string {
        return this.playerId;
    }

    public async recoverFromCloudCode(code: string): Promise<{ ok: boolean; reason?: string; alreadyLinked?: boolean }> {
        const result = await this.cloudService.recoverFromCloudCode(code, this.playerId);
        if (result.ok) {
            await this.syncWithSupabase();
            return { ok: true, alreadyLinked: result.alreadyLinked };
        }
        return { ok: false, reason: result.reason };
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
    }

    public calculateOfflineProgress(now: number = Date.now()): { hoursAway: number; statsBefore: CoreStats; statsAfter: CoreStats; gift?: string } | null {
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

        this.stats = this.gameRulesService.calculateDecay(this.stats, hoursAway);
        const gift = this.gameRulesService.tryGrantGift(hoursAway, this.inventory);

        if (gift) {
            this.inventory.push(gift);
            this.dispatchGiftEvent(gift);
            this.notifyInventoryChange();
        }

        this.lastLoginDate = now;
        this.writeToStorage();

        return {
            hoursAway,
            statsBefore,
            statsAfter: this.cloneStats(this.stats),
            gift
        };
    }

    public async syncWithSupabase(): Promise<void> {
        const remote = await this.cloudService.syncWithSupabase(this.playerId, this.stats, this.lastLoginDate, this.inventory);
        if (remote) {
            this.mergeRemoteState(remote);
            this.writeToStorage();
        }
    }

    private mergeRemoteState(remote: any): void {
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

        if (this.inventory.length !== beforeSize) {
            this.notifyInventoryChange();
        }
    }

    private dispatchGiftEvent(item: string): void {
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            const event = new CustomEvent<PebbleGiftEventDetail>('pebble-gift-found', {
                detail: { item }
            });
            window.dispatchEvent(event);
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

    private applyRecoveredSupabaseState(newPlayerId: string, remote: any): void {
        this.applyPlayerId(newPlayerId, { forceNotify: true });

        const remoteStats = this.sanitizeStats(remote.stats);
        const remoteLogin = typeof remote.last_login === 'string' ? Date.parse(remote.last_login) : Number.NaN;
        const remoteInventory = this.sanitizeInventory(remote.inventory);

        this.stats = remoteStats;
        this.lastLoginDate = Number.isFinite(remoteLogin) ? remoteLogin : Date.now();
        this.inventory = remoteInventory;

        this.writeToStorage();
        this.notifyInventoryChange();
    }

    private applyPlayerId(newId: string, options: { forceNotify?: boolean } = {}): void {
        const sanitized = newId.trim();
        if (!sanitized) {
            return;
        }
        const changed = sanitized !== this.playerId;
        this.playerId = sanitized;
        this.hadStoredPlayerId = true;
        this.persistPlayerId(sanitized);
        if (changed || options.forceNotify) {
            this.dispatchPlayerIdChange();
        }
    }

    private dispatchPlayerIdChange(): void {
        if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
            return;
        }
        const event = new CustomEvent<{ playerId: string }>('pebble-player-id-changed', {
            detail: { playerId: this.playerId }
        });
        window.dispatchEvent(event);
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

    private readFromStorage(): { state: StoredGameState; hadData: boolean } {
        const raw = this.storageService.getItem(LOCAL_STORAGE_KEY);
        if (!raw) {
            return { state: this.createDefaultState(), hadData: false };
        }
        try {
            const parsed = JSON.parse(raw) as Partial<StoredGameState>;
            const stats = this.sanitizeStats(parsed.stats);
            const lastLoginDate = typeof parsed.lastLoginDate === 'number' && Number.isFinite(parsed.lastLoginDate)
                ? parsed.lastLoginDate
                : Date.now();
            const inventory = this.sanitizeInventory(parsed.inventory);
            return { state: { stats, lastLoginDate, inventory }, hadData: true };
        } catch (error) {
            console.warn('Impossibile leggere il GameState locale, verrà ricreato', error);
            return { state: this.createDefaultState(), hadData: false };
        }
    }

    private writeToStorage(): void {
        const payload: StoredGameState = {
            stats: this.cloneStats(this.stats),
            lastLoginDate: this.lastLoginDate,
            inventory: [...this.inventory]
        };
        this.storageService.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
        this.persistPlayerId(this.playerId);
    }

    private resolvePlayerId(): string {
        const existing = this.storageService.getItem(PLAYER_ID_STORAGE_KEY);
        if (existing && existing.trim().length > 0) {
            this.hadStoredPlayerId = true;
            return existing;
        }
        const generated = this.generatePlayerId();
        this.hadStoredPlayerId = false;
        this.persistPlayerId(generated);
        return generated;
    }

    private persistPlayerId(id: string): void {
        this.storageService.setItem(PLAYER_ID_STORAGE_KEY, id);
    }

    private createDefaultState(): StoredGameState {
        return {
            stats: this.cloneStats(DEFAULT_STATS),
            lastLoginDate: Date.now(),
            inventory: []
        };
    }

    private cloneStats(stats: CoreStats): CoreStats {
        return { ...stats };
    }

    private clampStat(value: number): number {
        if (!Number.isFinite(value)) return 0;
        if (value < 0) return 0;
        if (value > 100) return 100;
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
}
