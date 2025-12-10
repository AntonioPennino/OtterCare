const DECAY_PER_HOUR = {
    hunger: 1.5,
    happiness: 0.9,
    energy: 1.2,
    clean: 0.8,
    seaGlass: 0 // Sea Glass doesn't decay
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
            energy: apply(stats.energy, DECAY_PER_HOUR.energy),
            clean: apply(stats.clean, DECAY_PER_HOUR.clean),
            seaGlass: stats.seaGlass // Sea Glass persists
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
    getDailyReward(day) {
        // Cycle every 7 days
        const cycleDay = ((day - 1) % 7) + 1;
        switch (cycleDay) {
            case 1: return { type: 'seaGlass', value: 50 };
            case 2: return { type: 'seaGlass', value: 100 };
            case 3: return { type: 'seaGlass', value: 150 };
            case 4: return { type: 'item', value: 'Conchiglia Preziosa' }; // Item placeholder
            case 5: return { type: 'seaGlass', value: 200 };
            case 6: return { type: 'seaGlass', value: 300 };
            case 7: return { type: 'item', value: 'Cappello Avventuriero' }; // Rare item placeholder
            default: return { type: 'seaGlass', value: 50 };
        }
    }
}
