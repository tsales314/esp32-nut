import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { serveIndex, serveUpdatePage } from './support/webui';

test.describe('OTA Update Flow', () => {
  let dummyBinPath: string;

  test.beforeAll(() => {
    // Crea un file .bin fittizio per il test
    dummyBinPath = path.join(__dirname, 'dummy_firmware.bin');
    fs.writeFileSync(dummyBinPath, Buffer.from([0xE9, 0x01, 0x02, 0x03]));
  });

  test.afterAll(() => {
    // Pulisci il file fittizio
    try {
      if (fs.existsSync(dummyBinPath)) {
        // We comment this out because fullyParallel: true causes workers to delete it prematurely
        // fs.unlinkSync(dummyBinPath);
      }
    } catch(e) {}
  });

  test.beforeEach(async ({ page }) => {
    await serveIndex(page);
    await serveUpdatePage(page);
  });

  test('firmware update keeps the dashboard navigation and can return to UPS stats', async ({ page }) => {
    await page.goto('http://esp32.local/');
    await page.locator('#nav-toggle').click();
    await page.locator('button[data-target="ota"]').click();

    // OTA loads its original upload page inside the existing dashboard shell.
    await expect(page).toHaveURL('http://esp32.local/');
    await expect(page.locator('#content-ota')).toBeVisible();
    await expect(page.locator('#nav-toggle')).toBeVisible();
    await expect(page.locator('button[data-target="ota"]')).toHaveClass(/active/);
    await expect(page.locator('#ota-frame')).toHaveAttribute('src', '/update?embedded=1');
    await expect(page.frameLocator('#ota-frame').locator('#fileInput')).toBeAttached();
    await expect(page.frameLocator('#ota-frame').locator('.dropzone')).toBeVisible();
    await expect(page.frameLocator('#ota-frame').locator('.btn-back')).toBeHidden();

    await page.locator('#nav-toggle').click();
    await page.locator('button[data-target="ups"]').click();
    await expect(page.locator('#content-ups')).toBeVisible();
    await expect(page.locator('#nav-toggle')).toBeVisible();
  });

  test('upload in the integrated OTA panel uses the original /update endpoint', async ({ page }) => {
    await page.route('**/update', route => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 200, contentType: 'text/plain', body: 'OK' });
      }
      return route.fallback();
    });
    await page.goto('http://esp32.local/');
    await page.locator('#nav-toggle').click();
    await page.locator('button[data-target="ota"]').click();
    const frame = page.frameLocator('#ota-frame');
    await frame.locator('#fileInput').setInputFiles(dummyBinPath);
    await expect(frame.locator('#statusMessage')).toContainText('Update complete');
    await expect(page.locator('#content-ota')).toBeVisible();
    await expect(page.locator('#nav-toggle')).toBeVisible();
  });

  test('mobile OTA retains navigation without a horizontal scrollbar', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('http://esp32.local/');
    await page.locator('#nav-toggle').click();
    await page.locator('button[data-target="ota"]').click();
    await expect(page.frameLocator('#ota-frame').locator('.dropzone')).toBeVisible();
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('should load OTA page and have upload elements', async ({ page }) => {
    await page.goto('http://esp32.local/update');
    
    await expect(page.locator('h2')).toContainText('OTA');
    await expect(page.locator('#fileInput')).toBeAttached();
    await expect(page.locator('.dropzone')).toBeVisible();
  });

  test('demo__user-uploads-firmware', async ({ page }) => {
    await page.goto('http://esp32.local/update');

    // Assicura che la richiesta OTA venga intercettata per non fallire sul backend inesistente o restituire OK fittizio
    await page.route('**/update', route => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 200,
          contentType: 'text/plain',
          body: 'OK',
        });
      } else {
        route.fallback();
      }
    });

    // Usa setInputFiles sull'input nascosto
    await page.locator('#fileInput').setInputFiles(dummyBinPath);
    
    // Verifica che lo status venga aggiornato
    await expect(page.locator('#statusMessage')).toContainText('Update complete', { ignoreCase: true });
  });
});
