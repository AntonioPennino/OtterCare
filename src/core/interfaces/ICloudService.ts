import { CoreStats } from '../types.js';

export interface SupabaseGameStateRow {
    id: string;
    stats: CoreStats | null;
    last_login: string | null;
    inventory: string[] | null;
    updated_at: string | null;
    pet_name: string | null;
    created_at: string | null;
    player_name: string | null;
}

export interface CloudRecoveryResult {
    ok: boolean;
    reason?: 'disabled' | 'invalid' | 'not_found' | 'error';
    alreadyLinked?: boolean;
}

export interface ICloudService {
    recoverFromCloudCode(code: string, currentPlayerId: string): Promise<CloudRecoveryResult>;
    syncWithSupabase(playerId: string, stats: any, lastLoginDate: number, inventory: string[], petName: string, playerName: string, firstLoginDate: number): Promise<SupabaseGameStateRow | null>;
    isAvailable(): boolean;
}
