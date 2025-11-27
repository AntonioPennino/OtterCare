import { getState, updateState } from '../state.js';
export function recordEvent(name) {
    const current = getState();
    if (!current.analyticsOptIn) {
        return;
    }
    updateState((draft) => {
        draft.analytics.events[name] = (draft.analytics.events[name] ?? 0) + 1;
        draft.analytics.lastEventAt = new Date().toISOString();
    }, { silent: true });
}
export function getAnalyticsSummary() {
    const { analytics } = getState();
    const keys = Object.keys(analytics.events);
    if (keys.length === 0) {
        return 'Nessun evento registrato.';
    }
    return keys
        .map(key => `${key}: ${analytics.events[key]}`)
        .join(', ');
}
