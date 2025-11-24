export type Mood = 'neutral' | 'happy' | 'sad' | 'sleepy';
export type ThemeMode = 'light' | 'comfort';

export interface GameStats {
  gamesPlayed: number;
  fishCaught: number;
  itemsBought: number;
}

export interface AnalyticsData {
  events: Record<string, number>;
  lastEventAt: string | null;
}

export interface CriticalHintsShown {
  hunger?: boolean;
  happy?: boolean;
  clean?: boolean;
  energy?: boolean;
}

export interface CloudSyncInfo {
  enabled: boolean;
  recordId: string | null;
  lastSyncedAt: string | null;
  lastRemoteUpdate: string | null;
}

export interface NotificationSettings {
  enabled: boolean;
  permission: NotificationPermission;
  lastPromptAt: number | null;
  subscriptionId: string | null;
  clientId: string;
  lastSent: Record<'hunger' | 'happy' | 'clean' | 'energy', number | undefined>;
}

export interface GameState {
  version: number;
  hunger: number;
  happy: number;
  clean: number;
  energy: number;
  coins: number;
  petName: string;
  petNameConfirmed: boolean;
  installPromptDismissed: boolean;
  hat: boolean;
  sunglasses: boolean;
  scarf: boolean;
  lastTick: number;
  tutorialSeen: boolean;
  analyticsOptIn: boolean;
  theme: ThemeMode;
  stats: GameStats;
  analytics: AnalyticsData;
  criticalHintsShown: CriticalHintsShown;
  cloudSync: CloudSyncInfo;
  notifications: NotificationSettings;
}

export interface BackupPayload {
  schemaVersion: number;
  exportedAt: string;
  state: GameState;
}

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
}
