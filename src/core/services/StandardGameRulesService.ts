import { IGameRulesService } from '../interfaces/IGameRulesService.js';
import { CoreStats } from '../types.js';

const DECAY_PER_HOUR: CoreStats = {
    hunger: 1.5,
    happiness: 0.9,
    energy: 1.2,
    clean: 0.8,
    seaGlass: 0 // Sea Glass doesn't decay
};

const HOURS_TO_GIFT = 4;
const GIFT_PROBABILITY = 0.6;

const GIFT_POOL: readonly string[] = [
    'Sasso Liscio',
    'Conchiglia Rosa',
    'Conchiglia Tigrata',
    'Sasso Brillante',
    'Conchiglia Spirale'
];

export class StandardGameRulesService implements IGameRulesService {
    public calculateDecay(stats: CoreStats, hoursAway: number): CoreStats {
        if (hoursAway <= 0) return { ...stats };

        const apply = (current: number, decayPerHour: number): number => {
            const decayed = current - decayPerHour * hoursAway;
            return this.clampStat(decayed);
        };

        return {
            hunger: apply(stats.hunger, DECAY_PER_HOUR.hunger),
            happiness: apply(stats.happiness, DECAY_PER_HOUR.happiness),
            energy: apply(stats.energy, DECAY_PER_HOUR.energy),
            clean: apply(stats.clean, DECAY_PER_HOUR.clean),
            seaGlass: stats.seaGlass // Sea Glass persists
        };
    }

    public tryGrantGift(hoursAway: number, _currentInventory: string[]): string | undefined {
        if (hoursAway < HOURS_TO_GIFT) {
            return undefined;
        }
        if (Math.random() > GIFT_PROBABILITY) {
            return undefined;
        }

        const giftIndex = Math.floor(Math.random() * GIFT_POOL.length);
        return GIFT_POOL[giftIndex];
    }

    private clampStat(value: number): number {
        if (!Number.isFinite(value)) return 0;
        if (value < 0) return 0;
        if (value > 100) return 100;
        return Math.round(value * 10) / 10;
    }

    public getDailyReward(day: number): { type: 'seaGlass' | 'item'; value: number | string } {
        // Cycle every 7 days
        const cycleDay = ((day - 1) % 7) + 1;

        switch (cycleDay) {
            case 1: return { type: 'seaGlass', value: 25 };
            case 2: return { type: 'seaGlass', value: 50 };
            case 3: return { type: 'seaGlass', value: 75 };
            case 4: return { type: 'seaGlass', value: 100 }; // Big boost
            case 5: return { type: 'seaGlass', value: 125 };
            case 6: return { type: 'seaGlass', value: 150 };
            case 7: return { type: 'seaGlass', value: 300 }; // Jackpot
            default: return { type: 'seaGlass', value: 25 };
        }
    }

    public isMerchantAvailable(): boolean {
        const now = new Date();
        const day = now.getDay(); // 0 = Sun, 1 = Mon, ...
        const hour = now.getHours();

        // Schedule: Mon (1), Wed (3), Fri (5)
        // Hours: 08:00 - 20:00
        const isDay = [1, 3, 5].includes(day); // Mon, Wed, Fri
        const isTime = hour >= 8 && hour < 20;

        return isDay && isTime;
    }
}
