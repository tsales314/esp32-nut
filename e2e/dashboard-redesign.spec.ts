import { test, expect, Page } from '@playwright/test';
import { serveIndex } from './support/webui';

const TELEMETRY = {
  'ups.status': 'OL',
  'battery.charge': '98',
  'input.voltage': '121',
  'output.voltage': '121',
  'ups.load': '24',
  'battery.runtime': '10680',
  'input.frequency': '60.0',
  'battery.voltage': '13.6',
  'ups.temperature': '29.4',
  'ups.realpower': '0',
  'ups.model': 'Smart-UPS',
  'ups.serial': 'ABC12345',
};

async function openDashboard(page: Page) {
  await serveIndex(page);
  await page.route('**/api/ups-vars', route => route.fulfill({ json: TELEMETRY }));
  await page.route('**/api/system-status', route => route.fulfill({
    json: { wifi: { status: 'Connected' }, ups: { status: 'OL', stale: false } },
  }));
  await page.goto('http://esp32.local/');
  await expect(page.locator('.metric-card')).toHaveCount(Object.keys(TELEMETRY).length);
}

test('desktop: compact cards render every reported UPS variable in three columns', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDashboard(page);

  const grid = page.locator('#metrics-grid');
  const columns = await grid.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(3);
  await expect(page.locator('.metric-card[data-metric-key="battery.charge"] .metric-reading')).toHaveText('98');
  await expect(page.locator('.metric-card[data-metric-key="battery.runtime"] .metric-reading')).toHaveText('2 h 58 m');
  await expect(page.locator('.metric-card[data-metric-key="ups.realpower"] .metric-reading')).toHaveText('0');
  await expect(page.locator('#nav-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#app-sidebar')).toHaveAttribute('aria-hidden', 'true');
});

test('hamburger opens and closes navigation; existing pages still work', async ({ page }) => {
  await openDashboard(page);
  await page.locator('#nav-toggle').click();
  await expect(page.locator('#app-sidebar')).toHaveClass(/is-open/);
  await expect(page.locator('#nav-toggle')).toHaveAttribute('aria-expanded', 'true');

  await page.locator('.tab[data-target="commands"]').click();
  await expect(page.locator('#content-commands')).toHaveClass(/active/);
  await expect(page.locator('#app-sidebar')).not.toHaveClass(/is-open/);

  await page.locator('#nav-toggle').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#app-sidebar')).not.toHaveClass(/is-open/);

  await page.locator('#nav-toggle').click();
  await page.locator('#nav-scrim').click({ position: { x: 2, y: 200 } });
  await expect(page.locator('#app-sidebar')).not.toHaveClass(/is-open/);
});

test('clicking a card shows read-only details with the raw NUT variable', async ({ page }) => {
  await openDashboard(page);
  await page.locator('.metric-card[data-metric-key="input.voltage"]').click();
  await expect(page.locator('#metric-overlay')).toBeVisible();
  await expect(page.locator('#metric-detail-title')).toHaveText('Input Voltage');
  await expect(page.locator('#metric-detail-value')).toHaveText('121 V');
  await expect(page.locator('#metric-detail-key')).toHaveText('input.voltage');
  await expect(page.locator('#metric-detail-description')).not.toBeEmpty();
  await page.keyboard.press('Escape');
  await expect(page.locator('#metric-overlay')).toBeHidden();
});

for (const width of [320, 375, 390, 428]) {
  test('mobile ' + width + 'px: two columns and no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await openDashboard(page);
    const columns = await page.locator('#metrics-grid').evaluate(el =>
      getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(2);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('offline UPS reports disconnected rather than retaining an old online state', async ({ page }) => {
  await serveIndex(page);
  await page.route('**/api/ups-vars', route => route.fulfill({ json: { _disconnected: true } }));
  await page.goto('http://esp32.local/');
  await expect(page.locator('.metric-card[data-metric-key="ups.status"] .metric-reading'))
    .toHaveText('Disconnected');
  await expect(page.locator('.metric-card')).toHaveCount(1);
});
