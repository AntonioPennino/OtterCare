import { GameState } from './core/GameState';
import { LocalStorageService } from './core/services/LocalStorageService';
import { SupabaseCloudService } from './core/services/SupabaseCloudService';
import { StandardGameRulesService } from './core/services/StandardGameRulesService';
let gameStateInstance = null;
export function initializeGame() {
    if (gameStateInstance) {
        return gameStateInstance;
    }
    const storageService = new LocalStorageService();
    const cloudService = new SupabaseCloudService();
    const gameRulesService = new StandardGameRulesService();
    gameStateInstance = new GameState(storageService, cloudService, gameRulesService);
    return gameStateInstance;
}
export function getGameStateInstance() {
    if (!gameStateInstance) {
        return initializeGame();
    }
    return gameStateInstance;
}
import { getState as getLegacyState } from './state.js';
// ... existing code ...
export function calculateOfflineProgress(now) {
    return getGameStateInstance().calculateOfflineProgress(now);
}
export async function syncWithSupabase() {
    await getGameStateInstance().syncWithSupabase();
}
export function syncManagerWithLegacyCoreStats() {
    try {
        const legacy = getLegacyState();
        getGameStateInstance().setStats({
            hunger: legacy.hunger,
            happiness: legacy.happy,
            energy: legacy.energy
        });
    }
    catch (error) {
        console.warn('Impossibile sincronizzare le statistiche principali con il GameState manager', error);
    }
}
// Re-export for compatibility during refactor
export { GameState };
