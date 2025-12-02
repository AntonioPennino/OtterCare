import { ICloudService, CloudRecoveryResult, SupabaseGameStateRow } from '../interfaces/ICloudService';
import { getSupabaseClient } from '../../cloudSync';
import { CoreStats } from '../../types';

export class SupabaseCloudService implements ICloudService {
    private supabaseUnavailable = false;
    private supabaseWarningLogged = false;

    public isAvailable(): boolean {
        return !this.supabaseUnavailable && !!getSupabaseClient();
    }

    public async recoverFromCloudCode(code: string, currentPlayerId: string): Promise<CloudRecoveryResult> {
        const supabase = getSupabaseClient();
        if (!supabase) {
            return { ok: false, reason: 'disabled' };
        }

        const trimmedCode = code.trim();
        if (!trimmedCode) {
            return { ok: false, reason: 'invalid' };
        }

        if (trimmedCode === currentPlayerId) {
            return { ok: true, alreadyLinked: true };
        }

        try {
            const { data, error } = await supabase
                .from('pebble_game_state')
                .select('stats, last_login, inventory, updated_at')
                .eq('id', trimmedCode)
                .maybeSingle();

            if (error) {
                const err = error as { code?: string };
                if (this.isMissingTableError(error)) {
                    this.markSupabaseUnavailable();
                    return { ok: false, reason: 'disabled' };
                }
                if (err.code === 'PGRST116') {
                    return { ok: false, reason: 'not_found' };
                }
                throw error;
            }

            if (!data) {
                return { ok: false, reason: 'not_found' };
            }

            return { ok: true };
        } catch (error) {
            console.warn('Errore nel recupero del GameState da Supabase tramite codice', error);
            return { ok: false, reason: 'error' };
        }
    }

    public async syncWithSupabase(playerId: string, stats: CoreStats, lastLoginDate: number, inventory: string[]): Promise<SupabaseGameStateRow | null> {
        const supabase = getSupabaseClient();
        if (!supabase || this.supabaseUnavailable) {
            return null;
        }

        try {
            const { data, error } = await supabase
                .from('pebble_game_state')
                .select('stats, last_login, inventory, updated_at')
                .eq('id', playerId)
                .maybeSingle();

            if (error) {
                const err = error as { code?: string };
                if (err.code === 'PGRST205') {
                    this.markSupabaseUnavailable();
                    return null;
                }
                if (err.code !== 'PGRST116') {
                    throw error;
                }
            }

            const remote = (data ?? null) as SupabaseGameStateRow | null;

            const payload: SupabaseGameStateRow = {
                id: playerId,
                stats: stats,
                last_login: new Date(lastLoginDate).toISOString(),
                inventory: inventory,
                updated_at: new Date().toISOString()
            };

            const { error: upsertError } = await supabase
                .from('pebble_game_state')
                .upsert(payload, { onConflict: 'id' });

            if (upsertError) {
                const err = upsertError as { code?: string };
                if (err.code === 'PGRST205') {
                    this.markSupabaseUnavailable();
                    return remote;
                }
                throw upsertError;
            }

            return remote;

        } catch (error) {
            if (this.isMissingTableError(error)) {
                this.markSupabaseUnavailable();
                return null;
            }
            console.warn('Impossibile sincronizzare il GameState con Supabase', error);
            return null;
        }
    }

    private isMissingTableError(error: unknown): error is { code: string } {
        return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'PGRST205');
    }

    private markSupabaseUnavailable(): void {
        this.supabaseUnavailable = true;
        if (!this.supabaseWarningLogged) {
            this.supabaseWarningLogged = true;
            console.info('[Pebble] Supabase non configurato per pebble_game_state; sincronizzazione core stats disattivata.');
        }
    }
}
