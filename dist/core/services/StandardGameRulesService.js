const DECAY_PER_HOUR = {
    hunger: 1.5,
    happiness: 0.9,
    energy: 1.2
};
const HOURS_TO_GIFT = 4;
const GIFT_PROBABILITY = 0.6;
const GIFT_POOL = [
    'Sasso Liscio',
    'Conchiglia Rosa',
    'Conchiglia Tigrata',
    'Sasso Brillante',
    'Conchiglia Spirale'
];
export class StandardGameRulesService {
    calculateDecay(stats, hoursAway) {
        if (hoursAway <= 0)
            return { ...stats };
        const apply = (current, decayPerHour) => {
            const decayed = current - decayPerHour * hoursAway;
            return this.clampStat(decayed);
        };
        return {
            hunger: apply(stats.hunger, DECAY_PER_HOUR.hunger),
            happiness: apply(stats.happiness, DECAY_PER_HOUR.happiness),
            energy: apply(stats.energy, DECAY_PER_HOUR.energy)
        };
    }
    tryGrantGift(hoursAway, _currentInventory) {
        if (hoursAway < HOURS_TO_GIFT) {
            return undefined;
        }
        if (Math.random() > GIFT_PROBABILITY) {
            return undefined;
        }
        const giftIndex = Math.floor(Math.random() * GIFT_POOL.length);
        return GIFT_POOL[giftIndex];
    }
    clampStat(value) {
        if (!Number.isFinite(value))
            return 0;
        if (value < 0)
            return 0;
        if (value > 100)
            return 100;
        return Math.round(value * 10) / 10;
    }
}
