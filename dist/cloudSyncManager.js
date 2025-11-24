import { isCloudSyncConfigured } from './config.js';
import { generateSyncCode, formatSyncCode, uploadStateToCloud, downloadStateFromCloud, deleteStateFromCloud } from './cloudSync.js';
import { getState, restoreBackupFromString, subscribe, updateCloudSyncInfo } from './state.js';
const listeners = [];
const PUSH_DELAY_MS = 2500;
let pushTimeoutId = null;
let pushing = false;
function emit(event) {
    for (const listener of listeners) {
        listener(event);
    }
}
function schedulePush() {
    if (pushTimeoutId !== null) {
        window.clearTimeout(pushTimeoutId);
    }
    pushTimeoutId = window.setTimeout(() => {
        pushTimeoutId = null;
        void pushNow();
    }, PUSH_DELAY_MS);
}
async function pushNow() {
    if (pushing) {
        return;
    }
    const { cloudSync } = getState();
    if (!cloudSync.enabled || !cloudSync.recordId) {
        return;
    }
    if (!isCloudSyncConfigured()) {
        return;
    }
    pushing = true;
    emit({ type: 'status', status: 'syncing' });
    try {
        const timestamp = await uploadStateToCloud(cloudSync.recordId, getSerializableState());
        updateCloudSyncInfo(info => {
            info.lastSyncedAt = timestamp;
            info.lastRemoteUpdate = timestamp;
        });
        emit({ type: 'synced', timestamp });
    }
    catch (error) {
        console.error('Errore nella sincronizzazione cloud', error);
        emit({ type: 'error', message: 'Sincronizzazione cloud non riuscita.' });
    }
    finally {
        pushing = false;
        emit({ type: 'status', status: 'idle' });
    }
}
function getSerializableState() {
    return JSON.parse(JSON.stringify(getState()));
}
export function onCloudSyncEvent(listener) {
    listeners.push(listener);
    return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) {
            listeners.splice(index, 1);
        }
    };
}
export function initCloudSyncAutoPush() {
    subscribe(() => {
        const { cloudSync } = getState();
        if (!cloudSync.enabled || !cloudSync.recordId) {
            return;
        }
        if (!isCloudSyncConfigured()) {
            return;
        }
        schedulePush();
    });
}
export async function enableCloudSync() {
    if (!isCloudSyncConfigured()) {
        throw new Error('Configura Supabase per attivare il cloud sync.');
    }
    let { recordId } = getState().cloudSync;
    if (!recordId) {
        recordId = generateSyncCode();
    }
    updateCloudSyncInfo(info => {
        info.enabled = true;
        info.recordId = recordId;
    });
    const timestamp = await uploadStateToCloud(recordId, getSerializableState());
    updateCloudSyncInfo(info => {
        info.lastSyncedAt = timestamp;
        info.lastRemoteUpdate = timestamp;
    });
    return {
        code: recordId,
        formattedCode: formatSyncCode(recordId),
        syncedAt: timestamp
    };
}
export async function disableCloudSync(removeRemote = false) {
    const { recordId } = getState().cloudSync;
    if (removeRemote && recordId && isCloudSyncConfigured()) {
        try {
            await deleteStateFromCloud(recordId);
        }
        catch (error) {
            console.error('Impossibile eliminare il salvataggio remoto', error);
        }
    }
    updateCloudSyncInfo(info => {
        info.enabled = false;
        info.lastSyncedAt = null;
    });
}
export async function pullCloudState(code) {
    if (!code) {
        throw new Error('Inserisci un codice di sincronizzazione valido.');
    }
    const cleanedCode = code.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (!cleanedCode) {
        throw new Error('Il codice non può essere vuoto.');
    }
    const remote = await downloadStateFromCloud(cleanedCode);
    if (!remote) {
        throw new Error('Nessun salvataggio trovato per questo codice.');
    }
    restoreBackupFromString(JSON.stringify(remote.state));
    updateCloudSyncInfo(info => {
        info.enabled = true;
        info.recordId = cleanedCode;
        info.lastSyncedAt = remote.updatedAt;
        info.lastRemoteUpdate = remote.updatedAt;
    });
    return {
        petName: remote.state.petName,
        coins: remote.state.coins,
        updatedAt: remote.updatedAt
    };
}
export function getFormattedLocalSyncCode() {
    const { recordId } = getState().cloudSync;
    return recordId ? formatSyncCode(recordId) : '';
}
export function getLastCloudSync() {
    return getState().cloudSync.lastSyncedAt;
}
export async function forceCloudPush() {
    await pushNow();
}
