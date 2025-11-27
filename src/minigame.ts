import { rewardFishCatch, rewardMiniGameStart } from './gameActions.js';
import { audioManager, resumeAudioContext } from './audio.js';

interface MiniGameElements {
  overlay: HTMLElement;
  area: HTMLElement;
  score: HTMLElement;
  closeButton: HTMLElement;
}

interface MiniGameCallbacks {
  onFinish(score: number): void;
}

let elements: MiniGameElements | null = null;
let callbacks: MiniGameCallbacks | null = null;
let running = false;
let score = 0;
let intervalId: number | null = null;
let timerId: number | null = null;

function clearTimers(): void {
  if (intervalId !== null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
  if (timerId !== null) {
    window.clearTimeout(timerId);
    timerId = null;
  }
}

function showScorePopup(x: number, y: number, value: number, text?: string): void {
  if (!elements) return;
  const popup = document.createElement('div');
  popup.classList.add('score-popup');
  popup.textContent = text || (value > 0 ? `+${value}` : `${value}`);
  popup.style.left = `${x}px`;
  popup.style.top = `${y}px`;
  if (value < 0) popup.style.color = '#FF5252';
  elements.area.appendChild(popup);
  setTimeout(() => popup.remove(), 800);
}

function spawnItem(area: HTMLElement): void {
  const rand = Math.random();
  let type = 'fish';
  let content = '🐟';
  let points = 1;
  let className = 'fish';

  if (rand > 0.9) {
    type = 'rare';
    content = '🐠';
    points = 3;
    className = 'fish rare';
  } else if (rand > 0.75) {
    type = 'trash';
    content = '👢';
    points = -2;
    className = 'trash';
  }

  const item = document.createElement('div');
  item.className = className;
  item.textContent = content;
  item.style.left = `${Math.random() * 85}%`;
  item.style.top = `${Math.random() * 85}%`;

  item.addEventListener('click', (e) => {
    if (!running) return;

    score += points;
    if (score < 0) score = 0; // Prevent negative score

    void resumeAudioContext();

    if (points > 0) {
      rewardFishCatch();
      void audioManager.playSFX('happy', true);
    } else {
      void audioManager.playSFX('splash', true); // Use 'splash' as negative sound
    }

    if (elements) {
      elements.score.textContent = String(score);
      // Get click coordinates relative to area
      const rect = elements.area.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      showScorePopup(x, y, points);
    }
    item.remove();
  }, { once: true });

  area.appendChild(item);
}

export function initMiniGame(el: MiniGameElements, cb: MiniGameCallbacks): void {
  elements = el;
  callbacks = cb;
  elements.closeButton.addEventListener('click', () => {
    closeMiniGame();
  });
}

export function openMiniGame(): void {
  if (!elements || running) {
    return;
  }
  running = true;
  score = 0;
  rewardMiniGameStart();

  elements.score.textContent = '0';
  elements.area.innerHTML = '';
  elements.overlay.classList.remove('hidden');

  intervalId = window.setInterval(() => {
    if (!elements) {
      return;
    }
    spawnItem(elements.area);
    if (elements.area.children.length > 8) {
      elements.area.removeChild(elements.area.firstElementChild as Element);
    }
  }, 700);

  timerId = window.setTimeout(() => {
    closeMiniGame();
    if (callbacks) {
      callbacks.onFinish(score);
    }
  }, 10000);
}

export function closeMiniGame(): void {
  if (!elements) {
    return;
  }
  clearTimers();
  running = false;
  elements.overlay.classList.add('hidden');
}

export function isMiniGameRunning(): boolean {
  return running;
}
