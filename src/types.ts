export type Mood = 'neutral' | 'happy' | 'sad' | 'sleepy';

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

export interface GameState {
  version: number;
  hunger: number;
  happy: number;
  clean: number;
  energy: number;
  coins: number;
  hat: boolean;
  sunglasses: boolean;
  scarf: boolean;
  lastTick: number;
  tutorialSeen: boolean;
  analyticsOptIn: boolean;
  stats: GameStats;
  analytics: AnalyticsData;
  criticalHintsShown: CriticalHintsShown;
}

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
}
