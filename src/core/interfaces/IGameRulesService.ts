import { CoreStats } from '../types.js';

export interface OfflineProgressResult {
    hoursAway: number;
    statsBefore: CoreStats;
    statsAfter: CoreStats;
    gift?: string;
}

export interface IGameRulesService {
    calculateDecay(stats: CoreStats, hoursAway: number): CoreStats;
    tryGrantGift(hoursAway: number, currentInventory: string[]): string | undefined;
    getDailyReward(day: number): { type: 'seaGlass' | 'item'; value: number | string };
    isMerchantAvailable(): boolean;
}
