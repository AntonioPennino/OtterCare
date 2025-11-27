import { getState, updateState } from '../state.js';
import type { GameState } from '../types.js';

export function recordEvent(name: string): void {
  const current = getState();
  if (!current.analyticsOptIn) {
    return;
  }

  updateState((draft: GameState) => {
    draft.analytics.events[name] = (draft.analytics.events[name] ?? 0) + 1;
    draft.analytics.lastEventAt = new Date().toISOString();
  }, { silent: true });
}

export function getAnalyticsSummary(): string {
  const { analytics } = getState();
  const keys = Object.keys(analytics.events);
  if (keys.length === 0) {
    return 'Nessun evento registrato.';
  }

  return keys
    .map(key => `${key}: ${analytics.events[key]}`)
    .join(', ');
}
