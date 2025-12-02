import { recordEvent } from './core/analytics.js';
import { incrementStat, modifyCoins, updateState } from './state.js';
import { syncManagerWithLegacyCoreStats } from './bootstrap.js';
export function feedAction() {
    updateState(draft => {
        draft.hunger = Math.min(100, draft.hunger + 20);
        draft.happy = Math.min(100, draft.happy + 6);
        draft.coins = Math.max(0, draft.coins - 5);
    });
    syncManagerWithLegacyCoreStats();
    recordEvent('azione:cibo');
}
export function batheAction() {
    updateState(draft => {
        draft.clean = Math.min(100, draft.clean + 25);
        draft.happy = Math.min(100, draft.happy + 4);
    });
    syncManagerWithLegacyCoreStats();
    recordEvent('azione:bagno');
}
export function sleepAction() {
    updateState(draft => {
        draft.energy = Math.min(100, draft.energy + 40);
        draft.happy = Math.min(100, draft.happy + 3);
    });
    syncManagerWithLegacyCoreStats();
    recordEvent('azione:sonno');
}
export function spendCoins(amount) {
    let canSpend = false;
    updateState(draft => {
        if (draft.coins >= amount) {
            draft.coins -= amount;
            canSpend = true;
        }
        else {
            canSpend = false;
        }
    });
    if (canSpend) {
        recordEvent(`spesa:${amount}`);
    }
    return canSpend;
}
export function rewardMiniGameStart() {
    incrementStat('gamesPlayed');
    recordEvent('minigioco:avviato');
}
export function rewardFishCatch() {
    modifyCoins(2);
    updateState(draft => {
        draft.happy = Math.min(100, draft.happy + 4);
    });
    syncManagerWithLegacyCoreStats();
    incrementStat('fishCaught');
    recordEvent('minigioco:pesce');
}
export function rewardItemPurchase(itemKey) {
    incrementStat('itemsBought');
    recordEvent(`acquisto:${itemKey}`);
}
