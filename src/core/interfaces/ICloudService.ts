import { CoreStats } from '../../types';

export interface SupabaseGameStateRow {
    id: string;
    stats: CoreStats | null;
    last_login: string | null;
    inventory: string[] | null;
    updated_at: string | null;
}

export interface CloudRecoveryResult {
    ok: boolean;
    reason?: 'disabled' | 'invalid' | 'not_found' | 'error';
    alreadyLinked?: boolean;
}

export interface ICloudService {
    recoverFromCloudCode(code: string, currentPlayerId: string): Promise<CloudRecoveryResult>;
    syncWithSupabase(playerId: string, stats: CoreStats, lastLoginDate: number, inventory: string[]): Promise<SupabaseGameStateRow | null>;
    isAvailable(): boolean;
}
