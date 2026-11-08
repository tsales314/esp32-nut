import { test, expect } from '@playwright/test';
import { serveIndex } from './support/webui';

test.describe('UPS telemetry cards', () => {
  test.beforeEach(async ({ page }) => {
    await serveIndex(page);
    await page.route('**/api/config', route => route.fulfill({ json: {} }));
  });

  test('polls and updates all reported UPS values and their details', async ({ page }) => {
    let mockData: Record<string, string> = {
      'ups.status': 'OL',
      'ups.mfr': 'Eaton',
      'battery.charge': '100',
      'battery.runtime': '3240',
      'ups.load': '15',
      'ups.realpower': '120',
      'input.voltage.nominal': '230',
      'output.voltage': '230.1',
    };
    await page.route('**/api/ups-vars', route => route.fulfill({ json: mockData }));
    await page.goto('http://esp32.local/');

    await expect(page.locator('.metric-card')).toHaveCount(Object.keys(mockData).length);
    await expect(page.locator('#ups-status')).toHaveText('On Line');
    await expect(page.locator('#ups-charge')).toHaveText('100');
    await expect(page.locator('#ups-load')).toHaveText('15');
    await expect(page.locator('#ups-realpower')).toHaveText('120');
    await expect(page.locator('.metric-card[data-metric-key="battery.runtime"] .metric-reading')).toHaveText('54 min');

    // Every card provides the original NUT variable and description.
    await page.locator('.metric-card[data-metric-key="ups.mfr"]').click();
    await expect(page.locator('#metric-detail-key')).toHaveText('ups.mfr');
    await expect(page.locator('#metric-detail-description')).toHaveText('UPS manufacturer');
    await page.locator('#metric-detail-close').click();

    mockData = {
      ...mockData,
      'ups.status': 'OB',
      'battery.charge': '95',
      'battery.runtime': '1800',
      'ups.load': '45',
      'ups.realpower': '350',
      'output.voltage': '229.5',
    };
    await expect(page.locator('#ups-status')).toHaveText('On Battery', { timeout: 3500 });
    await expect(page.locator('#ups-charge')).toHaveText('95');
    await expect(page.locator('#ups-load')).toHaveText('45');
    await expect(page.locator('#ups-realpower')).toHaveText('350');
    await expect(page.locator('.metric-card[data-metric-key="battery.runtime"] .metric-reading')).toHaveText('30 min');
  });

  test('shows unsupported UPS banner and clears it when a supported UPS connects', async ({ page }) => {
    let type = 'Generic';
    await page.route('**/api/ups-vars', route => route.fulfill({
      json: { 'ups.status': 'OL', 'ups.type': type },
    }));
    await page.goto('http://esp32.local/');
    await expect(page.locator('#generic-ups-banner')).toBeVisible();
    type = 'Eaton';
    await expect(page.locator('#generic-ups-banner')).toBeHidden({ timeout: 3500 });
  });

  test('omits unsupported/missing metrics rather than inventing 0', async ({ page }) => {
    const mockData = {
      'ups.status': 'OL',
      'ups.mfr': 'American Power Conversion',
      'ups.model': 'Smart-UPS 750',
      'battery.charge': '100',
      'battery.runtime': '2520',
      'output.voltage': '230.0',
    };
    await page.route('**/api/ups-vars', route => route.fulfill({ json: mockData }));
    await page.goto('http://esp32.local/');
    await expect(page.locator('.metric-card')).toHaveCount(Object.keys(mockData).length);
    await expect(page.locator('.metric-card[data-metric-key="ups.load"]')).toHaveCount(0);
    await expect(page.locator('.metric-card[data-metric-key="ups.realpower"]')).toHaveCount(0);
  });

  test('shows zero values and puts primary metrics ahead of secondary data', async ({ page }) => {
    await page.route('**/api/ups-vars', route => route.fulfill({
      json: {
        'ups.mfr': 'Eaton',
        'ups.status': 'OL',
        'ups.load': '0',
        'battery.charge': '100',
        'input.voltage': '121',
        'ups.realpower': '0',
      },
    }));
    await page.goto('http://esp32.local/');
    await expect(page.locator('#ups-load')).toHaveText('0');
    await expect(page.locator('#ups-realpower')).toHaveText('0');
    const keys = await page.locator('.metric-card').evaluateAll(cards =>
      cards.map(card => (card as HTMLElement).dataset.metricKey));
    expect(keys.slice(0, 4)).toEqual(['battery.charge', 'input.voltage', 'ups.load', 'ups.status']);
    expect(keys[keys.length - 1]).toBe('ups.mfr');
  });
});
