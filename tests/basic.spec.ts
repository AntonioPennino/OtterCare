import { test, expect } from '@playwright/test';

const HOME_URL = '/index.html';
const TUTORIAL_BUTTON_LABEL = 'Inizia l\'avventura';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  page.on('console', msg => {
    console.log('[browser]', msg.type(), msg.text());
  });
  page.on('pageerror', error => {
    console.log('[pageerror]', error.message, error.stack);
  });
});

test('shows tutorial on first access and allows dismissal', async ({ page }) => {
  await page.goto(HOME_URL);
  const overlay = page.locator('#tutorialOverlay');
  await expect(overlay).toBeVisible();
  await page.getByRole('button', { name: TUTORIAL_BUTTON_LABEL }).click();
  await expect(overlay).toBeHidden();
});

test('starts mini-gioco quando si preme gioca', async ({ page }) => {
  await page.goto(HOME_URL);
  const startButton = page.getByRole('button', { name: TUTORIAL_BUTTON_LABEL });
  if (await startButton.isVisible()) {
    await startButton.click();
  }

  await page.getByRole('button', { name: 'Gioca' }).click();
  const overlay = page.locator('#overlay');
  await expect(overlay).toBeVisible();
  await page.locator('#closeMini').click();
  await expect(overlay).toBeHidden();
});
