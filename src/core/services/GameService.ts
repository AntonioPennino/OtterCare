import { GameState } from '../GameState.js';
import { recordEvent } from '../analytics.js';
import { audioManager } from '../audio.js';

export class GameService {
    constructor(private gameState: GameState) { }

    public feed(): void {
        const stats = this.gameState.getStats();
        if (stats.hunger >= 100) {
            return; // Already full
        }

        this.gameState.setStats({
            hunger: Math.min(100, stats.hunger + 20),
            happiness: Math.min(100, stats.happiness + 6),
            seaGlass: Math.max(0, stats.seaGlass - 5)
        });

        recordEvent('azione:cibo');
        void audioManager.playSFX('eat');

        // Bond
        if (this.gameState.addBondXP(5)) {
            // Level up logic handled by UI listeners usually, or we can dispatch event
            recordEvent('bond:levelup');
        }
    }

    public bathe(): void {
        const stats = this.gameState.getStats();
        this.gameState.setStats({
            clean: Math.min(100, stats.clean + 25),
            happiness: Math.min(100, stats.happiness + 4)
        });
        recordEvent('azione:bagno');
        this.gameState.addBondXP(5);
    }

    public sleep(): void {
        this.gameState.setIsSleeping(true);
        recordEvent('azione:sonno_inizio');
    }

    public wakeUp(): void {
        this.gameState.setIsSleeping(false);
        // Restore energy on wake up specific amount?
        // Or should energy restore over time while sleeping?
        // Let's give a bulk restore on wake up for "good night's sleep"
        const stats = this.gameState.getStats();
        this.gameState.setStats({
            energy: Math.min(100, stats.energy + 100), // Fully rested!
            happiness: Math.min(100, stats.happiness + 10)
        });
        recordEvent('azione:sveglia');
        this.gameState.addBondXP(10);
    }

    public spendCoins(amount: number): boolean {
        const stats = this.gameState.getStats();
        if (stats.seaGlass >= amount) {
            this.gameState.setStats({
                seaGlass: stats.seaGlass - amount
            });
            recordEvent(`spesa:${amount}`);
            return true;
        }
        return false;
    }

    public rewardMiniGameStart(): void {
        this.gameState.incrementMetric('gamesPlayed');
        recordEvent('minigioco:avviato');
    }

    public rewardFishCatch(): void {
        const stats = this.gameState.getStats();
        this.gameState.setStats({
            seaGlass: stats.seaGlass + 2,
            happiness: Math.min(100, stats.happiness + 4)
        });
        this.gameState.incrementMetric('fishCaught');
        recordEvent('minigioco:pesce');
    }

    public rewardItemPurchase(itemKey: string): void {
        this.gameState.incrementMetric('itemsBought');
        recordEvent(`acquisto:${itemKey}`);

        // Unlock visual equipment
        if (itemKey === 'hat_straw') {
            this.gameState.setEquipped({ hat: true });
        } else if (itemKey === 'scarf_wool') {
            this.gameState.setEquipped({ scarf: true });
        } else if (itemKey === 'glasses_sun') {
            this.gameState.setEquipped({ sunglasses: true });
        }
    }

    public rewardStoneStacking(height: number): number {
        let reward = 0;
        if (height > 300) reward = 5;
        else if (height > 200) reward = 3;
        else if (height > 100) reward = 1;

        if (reward > 0) {
            // Check limit
            if (this.gameState.getDailyUsage('stones') + reward > 25) {
                // Partial or no reward logic? 
                // Simple cap: If total usage >= 25, return 0.
                if (this.gameState.getDailyUsage('stones') >= 25) return 0;
            }

            const stats = this.gameState.getStats();
            this.gameState.setStats({
                seaGlass: stats.seaGlass + reward,
                happiness: Math.min(100, stats.happiness + 5)
            });
            this.gameState.incrementDailyUsage('stones', reward);
            recordEvent(`minigioco:pietre:reward:${reward}`);
        }
        return reward;
    }

    public rewardTheCurrent(): boolean {
        // Daily Limit: 10
        if (this.gameState.getDailyUsage('current') >= 10) {
            return false; // The river is calm
        }

        // 5% chance to find a sea glass piece per interaction tick
        if (Math.random() < 0.05) {
            const stats = this.gameState.getStats();
            this.gameState.setStats({
                seaGlass: stats.seaGlass + 1,
                clean: Math.min(100, stats.clean + 2)
            });
            this.gameState.incrementDailyUsage('current');
            recordEvent('minigioco:corrente:trovato');
            return true;
        }
        return false;
    }

    public rewardFireflyConnection(): boolean {
        // Daily Limit: 15
        if (this.gameState.getDailyUsage('firefly') >= 15) {
            return false;
        }

        const stats = this.gameState.getStats();
        this.gameState.setStats({
            seaGlass: stats.seaGlass + 1, // Generous: 1 per connection
            happiness: Math.min(100, stats.happiness + 2)
        });
        this.gameState.incrementDailyUsage('firefly');
        recordEvent('minigioco:lucciole:connesso');
        return true;
    }
}

