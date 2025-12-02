import { CoreStats } from '../../types';

export interface OfflineProgressResult {
    hoursAway: number;
    statsBefore: CoreStats;
    statsAfter: CoreStats;
    gift?: string;
}

export interface IGameRulesService {
    calculateDecay(stats: CoreStats, hoursAway: number): CoreStats;
    tryGrantGift(hoursAway: number, currentInventory: string[]): string | undefined;
}
