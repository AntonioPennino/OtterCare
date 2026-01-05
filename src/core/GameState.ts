import { CoreStats, PebbleGiftEventDetail, AccessoryState, GameStats } from './types.js';
import { IStorageService } from './interfaces/IStorageService.js';
import { ICloudService } from './interfaces/ICloudService.js';
import { IGameRulesService } from './interfaces/IGameRulesService.js';

const LOCAL_STORAGE_KEY = 'pebble:game-state:v1';
const PLAYER_ID_STORAGE_KEY = 'pebble:player-id:v1';
const MIN_ELAPSED_FOR_OFFLINE_MS = 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

const DEFAULT_STATS: CoreStats = {
    hunger: 80,
    happiness: 85,
    energy: 75,
    clean: 80,
    seaGlass: 0
};

interface StoredGameState {
    stats: CoreStats;
    lastLoginDate: number;
    inventory: string[];
    petName: string;
    playerName: string; // "My" name
    equipped: AccessoryState;
    metrics: GameStats;
    firstLoginDate?: number;
    isSleeping?: boolean; // Persisted sleep state
    lastDailyBonusClaim?: number;
    dailyStreak?: number;
    dailyLimits?: {
        date: string; // To check if we need to reset
        current: number;
        firefly: number;
        stones: number;
    };
    bond?: {
        xp: number;
        level: number;
    };
    lastUpdated?: number;
}

export class GameState {
    private stats: CoreStats;
    private lastLoginDate: number;
    private firstLoginDate: number; // New field for days calculation
    private inventory: string[];
    private petName: string;
    private playerName: string;
    private equipped: AccessoryState;
    private metrics: GameStats;
    private playerId: string;
    private hadStoredStateOnBoot = false;
    private hadStoredPlayerId = false;
    private attemptedRemoteRecovery = false;
    private listeners: Array<() => void> = [];
    private syncTimeout: any = null; // For debounce
    private isSleeping: boolean = false; // Sleep state
    private lastDailyBonusClaim: number = 0;
    private dailyStreak: number = 0;
    private dailyLimits: { date: string; current: number; firefly: number; stones: number };
    private bond: { xp: number; level: number };
    private isDirty = false;
    private lastUpdated = Date.now();

    constructor(
        private storageService: IStorageService,
        private cloudService: ICloudService,
        private gameRulesService: IGameRulesService
    ) {
        const stored = this.readFromStorage();
        this.hadStoredStateOnBoot = stored.hadData;
        this.stats = stored.state.stats;
        this.lastLoginDate = stored.state.lastLoginDate;
        this.firstLoginDate = stored.state.firstLoginDate || Date.now(); // Default to now if missing
        this.inventory = stored.state.inventory;
        this.petName = stored.state.petName;
        this.playerName = stored.state.playerName;
        this.equipped = stored.state.equipped;
        this.metrics = stored.state.metrics;
        this.isSleeping = !!stored.state.isSleeping; // Restore sleep state
        this.lastDailyBonusClaim = stored.state.lastDailyBonusClaim || 0;
        this.dailyStreak = stored.state.dailyStreak || 0;
        this.lastUpdated = stored.state.lastUpdated || Date.now();

        // Init Limits & Bond
        this.dailyLimits = stored.state.dailyLimits || { date: new Date().toDateString(), current: 0, firefly: 0, stones: 0 };
        this.bond = stored.state.bond || { xp: 0, level: 1 };

        this.checkDailyReset(); // Reset limits if new day

        this.playerId = this.resolvePlayerId();
        this.dispatchPlayerIdChange();

        // Offline Handling
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => {
                if (this.isDirty) {
                    console.log('[Pebble] Connessione ripristinata. Sincronizzazione in corso...');
                    this.triggerAutoSync();
                }
            });
        }
    }

    public subscribe(listener: () => void): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notifyListeners(): void {
        this.listeners.forEach(l => l());
    }

    public getStats(): CoreStats {
        return {
            ...this.stats,
            days: this.getDaysPlayed(),
            minigamesPlayed: this.metrics.gamesPlayed,
            fishCaught: this.metrics.fishCaught,
            itemsCollected: this.inventory.length
        };
    }

    public getInventory(): string[] {
        return [...this.inventory];
    }

    public getPetName(): string {
        return this.petName;
    }

    public getPlayerName(): string {
        return this.playerName;
    }

    public getEquipped(): AccessoryState {
        return { ...this.equipped };
    }

    public getMetrics(): GameStats {
        return { ...this.metrics };
    }

    public incrementMetric(metric: keyof GameStats, amount = 1): void {
        this.metrics[metric] += amount;
        this.writeToStorage();
        this.notifyListeners();
    }

    public getPlayerId(): string {
        return this.playerId;
    }

    public async recoverFromCloudCode(code: string): Promise<{ ok: boolean; reason?: string; alreadyLinked?: boolean }> {
        const result = await this.cloudService.recoverFromCloudCode(code, this.playerId);
        if (result.ok) {
            // CRITICAL: Switch to the recovered ID before syncing!
            this.applyPlayerId(code, { forceNotify: true });

            // Now sync to pull down the data for this new ID
            await this.syncWithSupabase();

            // Force save to persist the new ID and data locally immediately
            this.writeToStorage();

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
        this.notifyListeners();
    }

    public setPetName(name: string): void {
        const sanitized = name.trim().slice(0, 24);
        if (sanitized !== this.petName) {
            this.petName = sanitized || 'Pebble';
            this.writeToStorage();
            this.notifyListeners();
        }
    }

    public getDailyBonusStatus(): { canClaim: boolean; currentDay: number; reward?: { type: 'seaGlass' | 'item'; value: number | string } } {
        const now = Date.now();
        const last = new Date(this.lastDailyBonusClaim);
        const today = new Date(now);

        // Reset hours to compare calendar days
        last.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);

        const diffTime = today.getTime() - last.getTime();
        const diffDays = diffTime / (1000 * 60 * 60 * 24);

        if (diffDays === 0) {
            // Already claimed today
            return { canClaim: false, currentDay: this.dailyStreak, reward: undefined };
        }

        let nextDay = this.dailyStreak + 1;

        // If difference is 1 (yesterday), we continue streak.
        // If difference > 1 (missed a day), we reset to 1.
        // NOTE: If lastClaim is 0 (never), diffDays is huge -> reset to 1. Correct.
        if (diffDays > 1) {
            nextDay = 1;
        }

        const reward = this.gameRulesService.getDailyReward(nextDay);
        return { canClaim: true, currentDay: nextDay, reward };
    }

    public getDailyStreak(): number {
        return this.dailyStreak;
    }

    public getDailyRewardPreview(day: number): { type: 'seaGlass' | 'item'; value: number | string } {
        return this.gameRulesService.getDailyReward(day);
    }

    public claimDailyBonus(): { type: 'seaGlass' | 'item'; value: number | string } | null {
        const status = this.getDailyBonusStatus();
        if (!status.canClaim || !status.reward) {
            return null;
        }

        this.lastDailyBonusClaim = Date.now();
        this.dailyStreak = status.currentDay;

        if (status.reward.type === 'seaGlass') {
            const val = typeof status.reward.value === 'number' ? status.reward.value : 0;
            this.stats.seaGlass += val;
        } else if (status.reward.type === 'item') {
            const item = String(status.reward.value);
            if (!this.inventory.includes(item)) {
                this.inventory.push(item);
                this.notifyInventoryChange();
            }
        }

        this.writeToStorage();
        this.notifyListeners(); // Update UI
        return status.reward;
    }

    public setPlayerName(name: string): void {
        const sanitized = name.trim().slice(0, 24);
        if (sanitized !== this.playerName) {
            this.playerName = sanitized; // No default needed here, UI handles it
            this.writeToStorage();
            this.notifyListeners();
        }
    }

    // Creating this as a persisted state because user wants it to stick
    public getIsSleeping(): boolean {
        return this.isSleeping;
    }

    public setIsSleeping(sleeping: boolean): void {
        if (this.isSleeping !== sleeping) {
            this.isSleeping = sleeping;
            this.writeToStorage();
            this.notifyListeners();
        }
    }

    public setEquipped(equipped: Partial<AccessoryState>): void {
        this.equipped = { ...this.equipped, ...equipped };
        this.writeToStorage();
        this.notifyListeners();
    }

    public getLastLoginDate(): number {
        return this.lastLoginDate;
    }

    public setStats(partial: Partial<CoreStats>): void {
        this.stats = this.mergeStats(this.stats, partial);
        this.writeToStorage();
        this.notifyListeners();
    }

    public getDaysPlayed(): number {
        const now = Date.now();
        const diff = now - this.firstLoginDate;
        // Convert ms to days, rounding up (day 1 starts at 0ms)
        return Math.floor(diff / (24 * 60 * 60 * 1000)) + 1;
    }

    private checkDailyReset(): void {
        const today = new Date().toDateString();
        if (this.dailyLimits.date !== today) {
            this.dailyLimits = {
                date: today,
                current: 0,
                firefly: 0,
                stones: 0
            };
            this.writeToStorage();
        }
    }

    public getDailyUsage(activity: 'current' | 'firefly' | 'stones'): number {
        this.checkDailyReset(); // Ensure fresh
        return this.dailyLimits[activity];
    }

    public incrementDailyUsage(activity: 'current' | 'firefly' | 'stones', amount = 1): void {
        this.checkDailyReset();
        this.dailyLimits[activity] += amount;
        this.writeToStorage();
    }

    public getBond(): { xp: number; level: number } {
        return { ...this.bond };
    }

    public addBondXP(amount: number): boolean { // Returns true if leveled up
        this.bond.xp += amount;
        let leveledUp = false;

        // Simple Level Curve: Level * 100 XP required
        const xpReq = this.bond.level * 100;
        if (this.bond.xp >= xpReq) {
            this.bond.level++;
            this.bond.xp -= xpReq; // Rolling over XP or just resetting? Let's keep it cumulative-ish or simple
            // Actually standard RPG: XP resets or threshold grows. 
            // Let's do: XP carries over for simplicity in display (0..100)
            leveledUp = true;
        }

        this.writeToStorage();
        if (leveledUp) this.notifyListeners();
        return leveledUp;
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
        this.notifyListeners();

        return {
            hoursAway,
            statsBefore,
            statsAfter: this.cloneStats(this.stats),
            gift
        };
    }

    public async syncWithSupabase(): Promise<void> {
        // PACKING EXTRA DATA: We pack bond, metrics, and dailyLimits into the 'stats' JSONB column
        // to ensure full persistence without changing the SQL schema.
        const packedStats: any = {
            ...this.stats,
            bond: this.bond,
            metrics: this.metrics,
            dailyLimits: this.dailyLimits
        };

        // Sync stats, inventory, petName, and playerName
        const remote = await this.cloudService.syncWithSupabase(
            this.playerId,
            packedStats, // Sending PACKED stats
            this.lastLoginDate,
            this.inventory,
            this.petName,
            this.playerName,
            this.firstLoginDate
        );
        if (remote) {
            this.mergeRemoteState(remote);
            this.writeToStorage();
            this.notifyListeners();
        }
    }

    private mergeRemoteState(remote: any): void {
        const remoteLogin = typeof remote.last_login === 'string' ? Date.parse(remote.last_login) : Number.NaN;
        // Unpack potential extra data from the 'stats' jsonb
        const rawStats = remote.stats || {};

        const remoteStats = this.sanitizeStats(rawStats);
        const remoteInventory = this.sanitizeInventory(remote.inventory);

        // UNPACK EXTRA DATA if present (Full Pack Strategy)
        if (rawStats.bond) {
            this.bond = { ...rawStats.bond };
        }
        if (rawStats.metrics) {
            this.metrics = { ...rawStats.metrics };
        }
        if (rawStats.dailyLimits) {
            // Check date to ensure we don't restore old limits? 
            // Actually trust cloud if it's newer login.
            // If remoteLogin > local, we trust it.
            this.dailyLimits = { ...rawStats.dailyLimits };
        }

        if (Number.isFinite(remoteLogin) && remoteLogin > this.lastLoginDate) {
            this.stats = remoteStats;
            this.lastLoginDate = remoteLogin;
            // Also trust the unpacked data specifically here? 
            // The unpacking above did it unconditionally. 
            // Ideally we only overwrite if remote is newer.
            // Moving unpacking INSIDE this block is safer.
        } else {
            // If local is newer, we ignoring remote stats. 
            // Revert unpacking?
            // Actually, merge logic usually implies "Merge Union" for inventory, but "Winner Takes All" for state.
            // If remote is older, we shouldn't overwrite local bond/metrics.
            // FIX: Move unpacking inside the `remoteLogin > this.lastLoginDate` check.
        }

        // CORRECT LOGIC:
        if (Number.isFinite(remoteLogin) && remoteLogin > this.lastLoginDate) {
            this.stats = remoteStats;
            this.lastLoginDate = remoteLogin;

            if (rawStats.bond) this.bond = { ...rawStats.bond };
            if (rawStats.metrics) this.metrics = { ...rawStats.metrics };
            if (rawStats.dailyLimits) this.dailyLimits = { ...rawStats.dailyLimits };
        }

        const mergedInventory = new Set<string>([...this.inventory, ...remoteInventory]);
        const beforeSize = this.inventory.length;
        this.inventory = Array.from(mergedInventory);

        // Sync petName if remote has one and local is default or different (conflict resolution: remote wins if newer login? actually simpler: let's trust remote if set)
        if (remote.pet_name && remote.pet_name !== 'Pebble' && this.petName === 'Pebble') {
            this.petName = remote.pet_name;
        }

        // Sync playerName
        if (remote.player_name && !this.playerName) {
            this.playerName = remote.player_name;
        }

        // Sync created_at for accurate days count
        if (remote.created_at) {
            const created = Date.parse(remote.created_at);
            if (Number.isFinite(created) && created < this.firstLoginDate) {
                this.firstLoginDate = created; // Use the oldest known date
            }
        }

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
            energy: this.clampStat(partial.energy ?? current.energy),
            clean: this.clampStat(partial.clean ?? current.clean),
            seaGlass: Math.max(0, partial.seaGlass ?? current.seaGlass)
        };
    }

    private sanitizeStats(candidate: Partial<CoreStats> | null | undefined): CoreStats {
        if (!candidate) {
            return this.cloneStats(DEFAULT_STATS);
        }
        return {
            hunger: this.clampStat(typeof candidate.hunger === 'number' ? candidate.hunger : DEFAULT_STATS.hunger),
            happiness: this.clampStat(typeof candidate.happiness === 'number' ? candidate.happiness : DEFAULT_STATS.happiness),
            energy: this.clampStat(typeof candidate.energy === 'number' ? candidate.energy : DEFAULT_STATS.energy),
            clean: this.clampStat(typeof candidate.clean === 'number' ? candidate.clean : DEFAULT_STATS.clean),
            seaGlass: Math.max(0, typeof candidate.seaGlass === 'number' ? candidate.seaGlass : DEFAULT_STATS.seaGlass)
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
        this.notifyListeners();
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
            const petName = typeof parsed.petName === 'string' ? parsed.petName : 'Pebble';
            const playerName = typeof parsed.playerName === 'string' ? parsed.playerName : '';
            const equipped = parsed.equipped || { hat: false, scarf: false, sunglasses: false };
            const metrics = parsed.metrics || { gamesPlayed: 0, fishCaught: 0, itemsBought: 0 };
            const firstLoginDate = typeof parsed.firstLoginDate === 'number' ? parsed.firstLoginDate : Date.now();
            const isSleeping = !!parsed.isSleeping;

            return { state: { stats, lastLoginDate, inventory, petName, playerName, equipped, metrics, firstLoginDate, isSleeping }, hadData: true };
        } catch (error) {
            console.warn('Impossibile leggere il GameState locale, verrà ricreato', error);
            return { state: this.createDefaultState(), hadData: false };
        }
    }

    private writeToStorage(): void {
        this.lastUpdated = Date.now();
        const payload: StoredGameState = {
            stats: this.cloneStats(this.stats),
            lastLoginDate: this.lastLoginDate,
            firstLoginDate: this.firstLoginDate, // Persist this
            inventory: [...this.inventory],
            petName: this.petName,
            playerName: this.playerName,
            equipped: { ...this.equipped },
            metrics: { ...this.metrics },
            isSleeping: this.isSleeping, // Save sleep state
            lastDailyBonusClaim: this.lastDailyBonusClaim,
            dailyStreak: this.dailyStreak,
            dailyLimits: { ...this.dailyLimits },
            bond: { ...this.bond },
            lastUpdated: this.lastUpdated
        };
        this.storageService.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
        this.persistPlayerId(this.playerId);
        this.triggerAutoSync();
    }

    private triggerAutoSync(): void {
        if (this.syncTimeout) {
            clearTimeout(this.syncTimeout);
        }
        // Debounce sync to avoid spamming Supabase on every stat change
        this.syncTimeout = setTimeout(() => {
            this.syncWithSupabase()
                .then(() => {
                    this.isDirty = false;
                })
                .catch(err => {
                    console.warn('[Pebble] Sync failed, marked generic dirty', err);
                    this.isDirty = true;
                });
            this.syncTimeout = null;
        }, 5000); // 5 seconds debounce
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
            firstLoginDate: Date.now(), // New state starts now
            inventory: [],
            petName: 'Pebble',
            playerName: '',
            equipped: { hat: false, scarf: false, sunglasses: false },
            metrics: { gamesPlayed: 0, fishCaught: 0, itemsBought: 0 },
            isSleeping: false,
            lastDailyBonusClaim: 0,
            dailyStreak: 0,
            dailyLimits: { date: new Date().toDateString(), current: 0, firefly: 0, stones: 0 },
            bond: { xp: 0, level: 1 }
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

    public getFullStateString(): string {
        try {
            const raw = this.storageService.getItem(LOCAL_STORAGE_KEY);
            return raw ? btoa(raw) : '';
        } catch (e) {
            console.error('Export failed', e);
            return '';
        }
    }

    public importStateString(b64: string): boolean {
        try {
            const raw = atob(b64);
            const parsed = JSON.parse(raw);
            if (!parsed.stats || !parsed.petName) {
                return false;
            }
            this.storageService.setItem(LOCAL_STORAGE_KEY, raw);
            window.location.reload();
            return true;
        } catch (e) {
            console.error('Import failed', e);
            return false;
        }
    }
}
