import { test, expect } from '@playwright/test';

const HOME_URL = '/index.html';
const TUTORIAL_BUTTON_LABEL = 'Inizia l\'avventura';
const NAME_CONFIRM_LABEL = 'Conferma nome';

async function completeNamePrompt(page, name = 'Luna'): Promise<void> {
  const overlay = page.locator('#nameOverlay');
  if (!(await overlay.isVisible())) {
    return;
  }
  await page.fill('#petNameInput', name);
  await page.getByRole('button', { name: NAME_CONFIRM_LABEL }).click();
  await expect(overlay).toBeHidden();
}

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
  await completeNamePrompt(page);
  const overlay = page.locator('#tutorialOverlay');
  await expect(overlay).toBeVisible();
  await page.getByRole('button', { name: TUTORIAL_BUTTON_LABEL }).click();
  await expect(overlay).toBeHidden();
});

test('starts mini-gioco quando si preme gioca', async ({ page }) => {
  await page.goto(HOME_URL);
  await completeNamePrompt(page);
  const startButton = page.getByRole('button', { name: TUTORIAL_BUTTON_LABEL });
  if (await startButton.isVisible()) {
    await startButton.click();
  }

  await page.getByRole('button', { name: 'Giochi' }).click();
  await page.getByRole('button', { name: 'Acchiappa i pesci' }).click();
  const overlay = page.locator('#overlay');
  await expect(overlay).toBeVisible();
  await page.locator('#closeMini').click();
  await expect(overlay).toBeHidden();
});

test('ogni sezione espone la propria azione principale', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(HOME_URL);
  await completeNamePrompt(page);
  const startButton = page.getByRole('button', { name: TUTORIAL_BUTTON_LABEL });
  if (await startButton.isVisible()) {
    await startButton.click();
  }

  await page.getByRole('button', { name: 'Cucina' }).click();
  await expect(page.getByRole('button', { name: 'Servi uno snack rapido' })).toBeVisible();

  await page.getByRole('button', { name: 'Fiume' }).click();
  await expect(page.getByRole('button', { name: 'Passa la spugna' })).toBeVisible();

  await page.getByRole('button', { name: 'Giochi' }).click();
  await expect(page.getByRole('button', { name: 'Acchiappa i pesci' })).toBeVisible();

  await page.getByRole('button', { name: 'Tana' }).click();
  await expect(page.getByRole('button', { name: 'Spegni le luci' })).toBeVisible();
});
