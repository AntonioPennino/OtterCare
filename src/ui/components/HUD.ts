import { GameState } from '../../types';
import { $ } from '../utils';

export class HUD {
    public update(state: GameState, coreStats: { hunger: number; happiness: number; energy: number }): void {
        this.setBar($('hungerBar'), coreStats.hunger);
        this.setBar($('happyBar'), coreStats.happiness);
        this.setBar($('cleanBar'), state.clean);
        this.setBar($('energyBar'), coreStats.energy);

        const coinsLabel = $('coins');
        if (coinsLabel) {
            coinsLabel.textContent = String(state.coins);
        }

        this.updateStatsView(state);
    }

    private setBar(element: HTMLElement | null, value: number): void {
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

    private updateStatsView(state: GameState): void {
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
}
