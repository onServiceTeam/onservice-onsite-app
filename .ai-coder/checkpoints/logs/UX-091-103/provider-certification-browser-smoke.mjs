import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const screenshotDir = path.join(here, 'screenshots');
await mkdir(screenshotDir, { recursive: true });

const user = {
  id: 'provider-visual-user',
  phone: '+639221234567',
  email: 'provider.visual@onservice.test',
  firstName: 'Roberto',
  lastName: 'Santos',
  role: 'provider',
  avatarUrl: null,
};

const certifications = [
  {
    id: 'cert-visual-1',
    name: 'Electrical Installation NC II',
    issuingBody: 'TESDA',
    certificateNumber: 'TESDA-EI-1001',
    hasDocument: true,
    documentUrl: '/api/v1/providers/me/certifications/cert-visual-1/document',
    issuedDate: '2025-01-15',
    expiryDate: '2030-01-15',
    isVerified: true,
    verifiedAt: '2025-02-01T00:00:00.000Z',
    createdAt: '2025-01-15T00:00:00.000Z',
  },
  {
    id: 'cert-visual-2',
    name: 'Plumbing NC II',
    issuingBody: 'TESDA',
    certificateNumber: null,
    hasDocument: false,
    documentUrl: null,
    issuedDate: '2026-03-10',
    expiryDate: null,
    isVerified: false,
    verifiedAt: null,
    createdAt: '2026-03-10T00:00:00.000Z',
  },
];

const browser = await chromium.launch();
const evidence = [];

try {
  for (const width of [768, 1366]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    let uploadContentType = null;
    let patchBody = null;

    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    page.on('pageerror', (error) => errors.push(`page: ${error.message}`));

    await page.addInitScript((seedUser) => {
      localStorage.setItem('onservice-auth-secure:accessToken', 'visual-access-token');
      localStorage.setItem('onservice-auth-secure:refreshToken', 'visual-refresh-token');
      localStorage.setItem('onservice-auth-secure:user', JSON.stringify(seedUser));
    }, user);

    await page.route('**/api/v1/**', async (route) => {
      const request = route.request();
      const url = request.url();
      const method = request.method();
      let body = { success: true, data: {} };

      if (url.endsWith('/api/v1/config')) {
        body = { success: true, data: {} };
      } else if (url.endsWith('/api/v1/providers/me/certifications') && method === 'GET') {
        body = { success: true, data: certifications };
      } else if (url.endsWith('/api/v1/providers/me/nbi-status')) {
        body = { success: true, data: { status: 'valid', expiresAt: '2030-01-01' } };
      } else if (url.endsWith('/api/v1/uploads') && method === 'POST') {
        uploadContentType = request.headers()['content-type'] ?? null;
        body = {
          success: true,
          data: [{
            id: 'upload-visual-1',
            url: 'https://app.onservice.ph/uploads/onboarding/provider-visual-user/certificate.png',
            filename: 'photo.png',
            mimeType: 'image/png',
            sizeBytes: 1024,
          }],
        };
      } else if (url.includes('/api/v1/providers/me/certifications/cert-visual-1') && method === 'PATCH') {
        patchBody = request.postDataJSON();
        body = { success: true, data: { ...certifications[0], ...patchBody, isVerified: false } };
      } else if (url.includes('/api/v1/notifications/unread-count')) {
        body = { success: true, data: { count: 0 } };
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });

    await page.goto('http://127.0.0.1:7390/provider/certifications', { waitUntil: 'networkidle' });
    await page.getByText('Build trust with verified credentials').waitFor();
    await page.getByLabel('Edit Electrical Installation NC II').click();
    await page.getByText('Certificate photo on file').waitFor();

    const issued = page.getByLabel('Issued date');
    const expiry = page.getByLabel('Expiry date');
    assert.equal(await issued.getAttribute('type'), 'date');
    assert.equal(await expiry.getAttribute('type'), 'date');
    assert.equal(await issued.inputValue(), '2025-01-15');
    const dateControls = await Promise.all([issued, expiry].map(async (control) => {
      return control.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const computed = getComputedStyle(element);
        return {
          width: rect.width,
          height: rect.height,
          inlineStyle: element.getAttribute('style'),
          display: computed.display,
          position: computed.position,
          flex: computed.flex,
          minHeight: computed.minHeight,
          heightStyle: computed.height,
        };
      });
    }));
    for (const control of dateControls) {
      assert.ok(control.height >= 44 && control.height <= 52, `date control height ${control.height}px at ${width}px`);
      assert.ok(control.width >= 160, `date control width ${control.width}px truncates its value at ${width}px`);
    }

    if (width === 1366) {
      const chooserPromise = page.waitForEvent('filechooser');
      await page.getByText('Replace', { exact: true }).click();
      const chooser = await chooserPromise;
      await chooser.setFiles(path.resolve('apps/mobile/assets/icon.png'));
      await page.getByText('Change', { exact: true }).waitFor();
    }

    const screenshot = path.join(screenshotDir, `provider-certifications-${width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });

    const overflow = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    assert.ok(overflow.scrollWidth <= overflow.clientWidth + 1, `horizontal overflow at ${width}px`);

    if (width === 1366) {
      await page.getByText('Save certification', { exact: true }).click();
      await page.waitForFunction(() => document.body.textContent?.includes('Certification updated.'));
      assert.match(uploadContentType ?? '', /^multipart\/form-data;\s*boundary=/i);
      assert.equal(patchBody?.certificateUrl, 'https://app.onservice.ph/uploads/onboarding/provider-visual-user/certificate.png');
    }

    assert.deepEqual(errors, []);
    evidence.push({ width, screenshot, overflow, dateControls, uploadContentType, patchBody });
    await context.close();
  }
} finally {
  await browser.close();
}

process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
