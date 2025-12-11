import { getSupabaseClient } from './cloudSync.js';
export class SupabaseCloudService {
    constructor() {
        this.supabaseUnavailable = false;
        this.supabaseWarningLogged = false;
    }
    isAvailable() {
        return !this.supabaseUnavailable && !!getSupabaseClient();
    }
    async recoverFromCloudCode(code, currentPlayerId) {
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
                const err = error;
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
        }
        catch (error) {
            console.warn('Errore nel recupero del GameState da Supabase tramite codice', error);
            return { ok: false, reason: 'error' };
        }
    }
    async syncWithSupabase(playerId, stats, lastLoginDate, inventory, petName, playerName, firstLoginDate) {
        const supabase = getSupabaseClient();
        if (!supabase || this.supabaseUnavailable) {
            return null;
        }
        try {
            const { data, error } = await supabase
                .from('pebble_game_state')
                .select('stats, last_login, inventory, updated_at, pet_name, created_at, player_name')
                .eq('id', playerId)
                .maybeSingle();
            if (error) {
                const err = error;
                if (err.code === 'PGRST205') {
                    this.markSupabaseUnavailable();
                    return null;
                }
                if (err.code !== 'PGRST116') {
                    throw error;
                }
            }
            const remote = (data ?? null);
            // Conflict Resolution:
            // If remote exists and has a NEWER last_login than our local state, 
            // we should NOT overwrite it. We should return the remote state so local can update.
            if (remote && remote.last_login) {
                const remoteDate = new Date(remote.last_login).getTime();
                // Allow a small buffer (e.g., 1s) for clock differences
                if (remoteDate > lastLoginDate + 1000) {
                    console.log('Remote state is newer. Skipping upsert.');
                    return remote;
                }
            }
            // Determine accurate creation date
            // If remote has created_at, use MIN(remote.created_at, local.firstLoginDate)
            // This ensures if we restore a very old save, we keep the old date.
            let creationDate = new Date(firstLoginDate).toISOString();
            if (remote && remote.created_at) {
                const remoteCreation = new Date(remote.created_at).getTime();
                if (remoteCreation < firstLoginDate) {
                    creationDate = remote.created_at;
                }
            }
            const payload = {
                id: playerId,
                stats: stats,
                last_login: new Date(lastLoginDate).toISOString(),
                inventory: inventory,
                updated_at: new Date().toISOString(),
                pet_name: petName,
                player_name: playerName, // Sync player name
                created_at: creationDate
            };
            const { error: upsertError } = await supabase
                .from('pebble_game_state')
                .upsert(payload, { onConflict: 'id' });
            if (upsertError) {
                const err = upsertError;
                if (err.code === 'PGRST205') {
                    this.markSupabaseUnavailable();
                    return remote;
                }
                throw upsertError;
            }
            return remote;
        }
        catch (error) {
            if (this.isMissingTableError(error)) {
                this.markSupabaseUnavailable();
                return null;
            }
            console.warn('Impossibile sincronizzare il GameState con Supabase', error);
            return null;
        }
    }
    isMissingTableError(error) {
        return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'PGRST205');
    }
    markSupabaseUnavailable() {
        this.supabaseUnavailable = true;
        if (!this.supabaseWarningLogged) {
            this.supabaseWarningLogged = true;
            console.info('[Pebble] Supabase non configurato per pebble_game_state; sincronizzazione core stats disattivata.');
        }
    }
}
