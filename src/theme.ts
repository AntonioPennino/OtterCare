import { ThemeMode } from './types.js';

export function applyTheme(mode: ThemeMode): void {
  const body = document.body;
  body.dataset.theme = mode;
  body.classList.toggle('theme-comfort', mode === 'comfort');
  body.classList.toggle('theme-light', mode === 'light');
}
