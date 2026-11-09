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

test('desktop: status banner and compact Output, Input, Device Details lists', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDashboard(page);

  const layout = page.locator('#metrics-grid');
  await expect(layout).toHaveClass(/telemetry-layout/);
  const sections = page.locator('.telemetry-section');
  await expect(sections).toHaveCount(3);
  const order = await sections.evaluateAll(nodes =>
    nodes.map(node => (node as HTMLElement).dataset.group));
  expect(order).toEqual(['output', 'input', 'device']);

  // Large desktop windows use two balanced columns for the power lists,
  // with the status, highlights and device panel spanning both columns.
  const outputRect = await page.locator('.telemetry-section[data-group="output"]')
    .boundingBox();
  const inputRect = await page.locator('.telemetry-section[data-group="input"]')
    .boundingBox();
  const deviceRect = await page.locator('.telemetry-section[data-group="device"]')
    .boundingBox();
  expect(outputRect).not.toBeNull();
  expect(inputRect).not.toBeNull();
  expect(deviceRect).not.toBeNull();
  expect(Math.abs(outputRect!.y - inputRect!.y)).toBeLessThan(2);
  expect(inputRect!.x).toBeGreaterThan(outputRect!.x + outputRect!.width - 2);
  // Grid row height follows the longer telemetry list; the shorter Input
  // panel fills its entire half so desktop borders line up visually.
  expect(Math.abs(outputRect!.height - inputRect!.height)).toBeLessThan(2);
  expect(deviceRect!.width).toBeGreaterThan(outputRect!.width * 1.9);

  const highlights = page.locator('.telemetry-highlight');
  await expect(highlights).toHaveCount(4);
  await expect(page.locator('.telemetry-highlight[data-metric-key="ups.load"] .telemetry-highlight-value')).toHaveText('24');
  await expect(page.locator('.telemetry-highlight[data-metric-key="battery.charge"] .telemetry-highlight-value')).toHaveText('98');
  await expect(page.locator('.telemetry-highlight[data-metric-key="ups.realpower"] .telemetry-highlight-value')).toHaveText('0');
  await expect(page.locator('.telemetry-highlight[data-metric-key="battery.runtime"] .telemetry-highlight-value')).toHaveText('2 h 58 m');
  const highlightYs = await highlights.evaluateAll(items =>
    items.map(el => el.getBoundingClientRect().top));
  expect(Math.max(...highlightYs) - Math.min(...highlightYs)).toBeLessThan(2);
  const tileSpacing = await highlights.first().evaluate(tile => {
    const label = tile.querySelector('.telemetry-highlight-label')!.getBoundingClientRect();
    const value = tile.querySelector('.telemetry-highlight-value-wrap')!.getBoundingClientRect();
    return { height: tile.getBoundingClientRect().height, gap: value.top - label.bottom };
  });
  expect(tileSpacing.gap).toBeLessThanOrEqual(8);
  expect(tileSpacing.height).toBeLessThanOrEqual(95);

  const banner = page.locator('.telemetry-status');
  await expect(banner.locator('#ups-status')).toHaveText('On Line');
  await expect(page.locator('#telemetry-status-context')).toHaveText('On utility power');
  const width = await layout.evaluate(el => el.getBoundingClientRect().width);
  expect(await banner.evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(width * .96);
  const allKeys = await page.locator('.metric-card').evaluateAll(nodes =>
    nodes.map(node => (node as HTMLElement).dataset.metricKey));
  expect(allKeys[0]).toBe('ups.status');
  expect(new Set(allKeys).size).toBe(Object.keys(TELEMETRY).length);

  const output = page.locator('#telemetry-list-output');
  await expect(output.locator('[data-metric-key="output.voltage"] .metric-reading')).toHaveText('121');
  await expect(output.locator('[data-metric-key="battery.runtime"] .metric-reading')).toHaveText('2 h 58 m');
  await expect(output.locator('[data-metric-key="ups.realpower"] .metric-reading')).toHaveText('0');
  await expect(page.locator('#telemetry-list-input [data-metric-key="input.voltage"]')).toHaveCount(1);
  await expect(page.locator('#telemetry-list-device [data-metric-key="ups.model"]')).toHaveCount(1);
  await expect(page.locator('#telemetry-list-device [data-metric-key="battery.charge"]')).toHaveCount(1);
  expect(await output.locator('.telemetry-row').first().evaluate(el =>
    el.getBoundingClientRect().height)).toBeLessThan(46);
  await expect(page.locator('#nav-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#app-sidebar')).toHaveAttribute('aria-hidden', 'true');
});

test('medium desktop windows stack Output and Input vertically', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await openDashboard(page);
  const outputRect = await page.locator('.telemetry-section[data-group="output"]').boundingBox();
  const inputRect = await page.locator('.telemetry-section[data-group="input"]').boundingBox();
  expect(outputRect).not.toBeNull();
  expect(inputRect).not.toBeNull();
  expect(inputRect!.y).toBeGreaterThan(outputRect!.y + outputRect!.height - 2);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('summary tiles open existing read-only metric details', async ({ page }) => {
  await openDashboard(page);
  await page.locator('.telemetry-highlight[data-metric-key="ups.load"]').click();
  await expect(page.locator('#metric-overlay')).toBeVisible();
  await expect(page.locator('#metric-detail-key')).toHaveText('ups.load');
  await expect(page.locator('#metric-detail-value')).toHaveText('24 %');
  await page.keyboard.press('Escape');
  await expect(page.locator('#metric-overlay')).toBeHidden();
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
  await page.mouse.click(1100, 200);
  await expect(page.locator('#app-sidebar')).not.toHaveClass(/is-open/);
});

test('clicking a telemetry row shows read-only details with the raw NUT variable', async ({ page }) => {
  await openDashboard(page);
  await page.locator('.metric-card[data-metric-key="input.voltage"]').click();
  await expect(page.locator('#metric-overlay')).toBeVisible();
  await expect(page.locator('#metric-detail-title')).toHaveText('Input Voltage');
  await expect(page.locator('#metric-detail-value')).toHaveText('121 V');
  await expect(page.locator('#metric-detail-key')).toHaveText('input.voltage');
  await expect(page.locator('#metric-detail-raw-value')).toHaveText('121');
  await expect(page.locator('#metric-detail-description')).not.toBeEmpty();
  await page.keyboard.press('Escape');
  await expect(page.locator('#metric-overlay')).toBeHidden();
});

for (const width of [320, 375, 390, 428]) {
  test('mobile ' + width + 'px: single-width compact sections without overflow', async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await openDashboard(page);
    const layout = page.locator('#metrics-grid');
    await expect(page.locator('.telemetry-section')).toHaveCount(3);
    await expect(page.locator('.telemetry-highlight')).toHaveCount(4);
    const topTiles = await page.locator('.telemetry-highlight').evaluateAll(items =>
      items.map(el => el.getBoundingClientRect().top));
    expect(topTiles[0]).toBeCloseTo(topTiles[1], 0);
    expect(topTiles[2]).toBeCloseTo(topTiles[3], 0);
    expect(topTiles[2]).toBeGreaterThan(topTiles[0] + 45);
    const mainWidth = await layout.evaluate(el => el.getBoundingClientRect().width);
    const statusWidth = await page.locator('.telemetry-status').evaluate(el => el.getBoundingClientRect().width);
    expect(statusWidth).toBeGreaterThan(mainWidth * .96);
    for (const section of await page.locator('.telemetry-section').all()) {
      const width = await section.evaluate(el => el.getBoundingClientRect().width);
      expect(width).toBeGreaterThan(mainWidth * .96);
    }
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('mobile Safari-style scroll keeps last device reading clear of bottom browser controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await openDashboard(page);
  const scroller = page.locator('.content-area');
  await scroller.evaluate(el => { el.scrollTop = el.scrollHeight; });
  const geometry = await page.evaluate(() => {
    const area = document.querySelector('.content-area')!;
    const last = document.querySelector('#telemetry-list-device .telemetry-row:last-child')!;
    return {
      bottomClearance: area.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom,
      paddingBottom: parseFloat(getComputedStyle(area).paddingBottom),
      scrollRange: area.scrollHeight - area.clientHeight,
      appHeight: document.querySelector('.app-container')!.getBoundingClientRect().height,
      viewportHeight: window.innerHeight,
    };
  });
  expect(geometry.scrollRange).toBeGreaterThan(0);
  expect(geometry.paddingBottom).toBeGreaterThanOrEqual(110);
  expect(geometry.bottomClearance).toBeGreaterThanOrEqual(90);
  expect(geometry.appHeight).toBeLessThanOrEqual(geometry.viewportHeight + 2);
});

test('sections collapse independently and remain collapsed while live polling', async ({ page }) => {
  await openDashboard(page);
  const outputToggle = page.locator('.telemetry-section-toggle[data-group="output"]');
  const outputList = page.locator('#telemetry-list-output');
  await expect(outputList).toBeVisible();
  await outputToggle.click();
  await expect(outputToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(outputList).toBeHidden();
  await expect(page.locator('#telemetry-list-input')).toBeVisible();
  await page.waitForTimeout(2300); // Longer than the existing 2-second UPS poll.
  await expect(outputList).toBeHidden();
  await outputToggle.click();
  await expect(outputList).toBeVisible();
  await expect(outputList.locator('.telemetry-row')).not.toHaveCount(0);
});

test('battery power and low charge show warning indicators, not a healthy label', async ({ page }) => {
  await serveIndex(page);
  await page.route('**/api/ups-vars', route => route.fulfill({
    json: { 'ups.status': 'OB', 'battery.charge': '10',
      'battery.charge.low': '20', 'battery.status': 'LOW',
      'output.voltage': '120', 'input.voltage': '0' },
  }));
  await page.goto('http://esp32.local/');
  await expect(page.locator('#ups-status')).toHaveText('On Battery');
  await expect(page.locator('#telemetry-status-context')).toHaveText('Running on battery power');
  await expect(page.locator('.telemetry-status-dot')).toHaveClass(/is-warning/);
  await expect(page.locator('[data-metric-key="battery.charge"] .telemetry-dot')).toHaveClass(/is-warning/);
  await expect(page.locator('[data-metric-key="input.voltage"] .telemetry-dot')).toHaveClass(/is-warning/);
  await expect(page.locator('#telemetry-health-input')).toHaveClass(/is-warning/);
  await expect(page.locator('#telemetry-health-device')).toHaveClass(/is-warning/);
});

test('status banner shows remaining runtime only while on battery', async ({ page }) => {
  await serveIndex(page);
  let onBattery = true;
  await page.route('**/api/ups-vars', route => route.fulfill({
    json: {
      'ups.status': onBattery ? 'OB' : 'OL',
      'battery.runtime': '1860',
      'battery.charge': '92',
    },
  }));
  await page.goto('http://esp32.local/');
  await expect(page.locator('#ups-status')).toHaveText('On Battery');
  await expect(page.locator('#telemetry-status-context'))
    .toHaveText('Running on battery power · 31 min remaining');

  onBattery = false;
  await expect(page.locator('#ups-status')).toHaveText('On Line', { timeout: 5000 });
  await expect(page.locator('#telemetry-status-context')).toHaveText('On utility power');
});

test('low-battery status still shows a valid estimate but never invents one', async ({ page }) => {
  await serveIndex(page);
  let runtime = '240';
  await page.route('**/api/ups-vars', route => route.fulfill({
    json: { 'ups.status': 'OB LB', 'battery.runtime': runtime },
  }));
  await page.goto('http://esp32.local/');
  await expect(page.locator('#telemetry-status-context'))
    .toHaveText('UPS requires attention · 4 min remaining');
  runtime = '-1';
  await expect(page.locator('#telemetry-status-context'))
    .toHaveText('UPS requires attention', { timeout: 5000 });
});

test('UPS status stays first even when the UPS does not report a status variable', async ({ page }) => {
  await serveIndex(page);
  await page.route('**/api/ups-vars', route => route.fulfill({
    json: { 'battery.charge': '82', 'input.voltage': '121' },
  }));
  await page.goto('http://esp32.local/');
  await expect(page.locator('.metric-card')).toHaveCount(3);
  await expect(page.locator('.metric-card').first()).toHaveAttribute('data-metric-key', 'ups.status');
  await expect(page.locator('.metric-card--status .metric-reading')).toHaveText('Status unavailable');
});

test('UPS status is visible before telemetry completes loading', async ({ page }) => {
  await serveIndex(page);
  await page.route('**/api/ups-vars', route => new Promise(resolve => {
    // Leave the telemetry request pending during this assertion.
    setTimeout(() => resolve(route.fulfill({ json: TELEMETRY })), 1500);
  }));
  await page.goto('http://esp32.local/');
  await expect(page.locator('.metric-card--status .metric-reading')).toHaveText('Checking UPS…');
  await expect(page.locator('.metric-card--status .metric-reading')).toHaveText('On Line', { timeout: 4000 });
});

test('offline UPS reports disconnected rather than retaining an old online state', async ({ page }) => {
  await serveIndex(page);
  await page.route('**/api/ups-vars', route => route.fulfill({ json: { _disconnected: true } }));
  await page.goto('http://esp32.local/');
  await expect(page.locator('.metric-card[data-metric-key="ups.status"] .metric-reading'))
    .toHaveText('Disconnected');
  await expect(page.locator('.metric-card')).toHaveCount(1);
});
