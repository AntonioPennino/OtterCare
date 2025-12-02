import { IGameRulesService } from '../interfaces/IGameRulesService';
import { CoreStats } from '../../types';

const DECAY_PER_HOUR: CoreStats = {
    hunger: 1.5,
    happiness: 0.9,
    energy: 1.2
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
            energy: apply(stats.energy, DECAY_PER_HOUR.energy)
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
}
