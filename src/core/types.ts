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
  seaGlass: number;
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
  notifications: NotificationSettings;
}

// ...

export interface CoreStats {
  hunger: number;
  happiness: number;
  energy: number;
  clean: number;
  seaGlass: number;
  days?: number;
  minigamesPlayed?: number;
  fishCaught?: number;
  itemsCollected?: number;
}

export interface PebbleGiftEventDetail {
  item: string;
}

export type AccessoryState = {
  hat: boolean;
  scarf: boolean;
  sunglasses: boolean;
};

export type OutfitKey = 'base' | 'hat' | 'hatScarf' | 'hatScarfSunglasses';

export interface InventoryEventDetail {
  inventory: string[];
}

export interface PlayerIdChangeDetail {
  playerId: string;
}
