import { test, expect, Page } from '@playwright/test';
import { serveIndex } from './support/webui';

async function openApp(page: Page) {
  await serveIndex(page);
  await page.route('**/api/config', route => route.fulfill({ json: {} }));
  await page.route('**/api/ups-vars', route => route.fulfill({ json: {
    'ups.status': 'OL', 'battery.charge': '100', 'ups.load': '20',
    'input.voltage': '120', 'output.voltage': '120',
  } }));
  await page.goto('http://esp32.local/');
  await expect(page.locator('.metric-card')).toHaveCount(5);
}

async function selectPage(page: Page, target: string) {
  await page.locator('#nav-toggle').click();
  await expect(page.locator('#app-sidebar')).toHaveClass(/is-open/);
  await page.locator('button.tab[data-target="' + target + '"]').click();
  await expect(page.locator('#content-' + target)).toHaveClass(/active/);
  await expect(page.locator('#app-sidebar')).not.toHaveClass(/is-open/);
}

for (const width of [375, 800, 1024, 1440]) {
  test('drawer remains out of layout flow at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openApp(page);
    const widthBefore = await page.locator('.content-area').evaluate(el => el.getBoundingClientRect().width);
    await expect(page.locator('#app-sidebar')).toHaveAttribute('aria-hidden', 'true');
    await page.locator('#nav-toggle').click();
    const drawerWidth = await page.locator('#app-sidebar').evaluate(el => el.getBoundingClientRect().width);
    expect(drawerWidth).toBeLessThanOrEqual(Math.min(width, 290));
    const widthOpen = await page.locator('.content-area').evaluate(el => el.getBoundingClientRect().width);
    expect(widthOpen).toBeCloseTo(widthBefore, 0);
    await page.locator('#nav-close').click();
    await expect(page.locator('#app-sidebar')).not.toHaveClass(/is-open/);
  });
}

test('all existing pages remain available from the hamburger menu', async ({ page }) => {
  await openApp(page);
  for (const target of ['commands', 'settings', 'network', 'nut', 'board', 'weblogin', 'logs', 'ups']) {
    await selectPage(page, target);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
});

test('mobile: the drawer does not replace the dashboard content', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openApp(page);
  await expect(page.locator('#metrics-grid')).toBeVisible();
  await page.locator('#nav-toggle').click();
  await expect(page.locator('#app-sidebar')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#app-sidebar')).not.toHaveClass(/is-open/);
  await expect(page.locator('#metrics-grid')).toBeVisible();
});
