import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isCloudSyncConfigured } from './config.js';
let client = null;
function getClient() {
    if (!isCloudSyncConfigured()) {
        return null;
    }
    if (!client) {
        client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: { persistSession: false },
            global: {
                headers: {
                    'x-otter-client': 'ottercare-app'
                }
            }
        });
    }
    return client;
}
export function generateSyncCode() {
    const buffer = new Uint8Array(16);
    crypto.getRandomValues(buffer);
    return Array.from(buffer).map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export function formatSyncCode(code) {
    return (code || '').replace(/[^a-z0-9]/gi, '').match(/.{1,4}/g)?.join('-') ?? '';
}
export async function uploadStateToCloud(code, state) {
    const supabase = getClient();
    if (!supabase) {
        throw new Error('Cloud sync non configurata');
    }
    const payload = {
        id: code,
        state,
        updated_at: new Date().toISOString()
    };
    const { error, data } = await supabase
        .from('otter_saves')
        .upsert(payload, { onConflict: 'id', ignoreDuplicates: false })
        .select('updated_at')
        .maybeSingle();
    if (error) {
        throw error;
    }
    return data?.updated_at ?? payload.updated_at;
}
export async function downloadStateFromCloud(code) {
    const supabase = getClient();
    if (!supabase) {
        throw new Error('Cloud sync non configurata');
    }
    const { data, error } = await supabase
        .from('otter_saves')
        .select('state, updated_at')
        .eq('id', code)
        .maybeSingle();
    if (error) {
        throw error;
    }
    if (!data) {
        return null;
    }
    return {
        state: data.state,
        updatedAt: data.updated_at
    };
}
export async function deleteStateFromCloud(code) {
    const supabase = getClient();
    if (!supabase) {
        throw new Error('Cloud sync non configurata');
    }
    const { error } = await supabase
        .from('otter_saves')
        .delete()
        .eq('id', code);
    if (error) {
        throw error;
    }
}
