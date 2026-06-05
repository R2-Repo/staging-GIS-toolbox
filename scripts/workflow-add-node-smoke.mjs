/**
 * Smoke test: workflow palette → React Flow canvas add node.
 * Run: node scripts/workflow-add-node-smoke.mjs [baseUrl]
 */
import { chromium } from 'playwright';

const BASE = (process.argv[2] || 'http://127.0.0.1:4173').replace(/\/$/, '');

async function dismissBlockingModals(page) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const visible = await page.locator('.modal-overlay').first().isVisible().catch(() => false);
    if (!visible) return;

    const selectors = [
      '.cancel-btn',
      'button:has-text("Skip")',
      'button:has-text("Close")',
      'button:has-text("Got it")',
      'button:has-text("Not now")',
      '.close-modal',
      'button[aria-label="Close"]'
    ];
    let dismissed = false;
    for (const sel of selectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ force: true }).catch(() => {});
        dismissed = true;
        break;
      }
    }
    if (!dismissed) {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(300);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(800);
  await dismissBlockingModals(page);

  // Open workflow editor
  await dismissBlockingModals(page);
  await page.locator('#btn-workflow').click({ timeout: 10000, force: true });
  await page.waitForSelector('#wf-overlay.visible', { timeout: 10000 });

  const reactFlowHost = page.locator('.wf-reactflow-host');
  const reactFlow = page.locator('.react-flow');
  console.log('ReactFlow host visible:', await reactFlowHost.isVisible().catch(() => false));
  console.log('ReactFlow visible:', await reactFlow.isVisible().catch(() => false));

  const hostBox = await reactFlowHost.boundingBox().catch(() => null);
  const rfBox = await reactFlow.boundingBox().catch(() => null);
  console.log('Host box:', hostBox);
  console.log('ReactFlow box:', rfBox);

  // Click first palette item immediately (race with mount)
  const paletteItem = page.locator('.wf-palette-item').first();
  await paletteItem.waitFor({ state: 'visible', timeout: 5000 });
  const itemText = await paletteItem.textContent();
  console.log('Clicking palette item:', itemText?.trim());
  await paletteItem.click();

  await page.waitForTimeout(500);

  const nodeCount = await page.locator('.react-flow__node').count();
  console.log('React Flow nodes on canvas (immediate click):', nodeCount);

  // Click again after waiting for React Flow mount
  await reactFlow.waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(500);
  await paletteItem.click();
  await page.waitForTimeout(500);

  const nodeCountAfterWait = await page.locator('.react-flow__node').count();
  console.log('React Flow nodes on canvas (after wait):', nodeCountAfterWait);

  if (consoleErrors.length) {
    console.log('\nConsole errors:');
    consoleErrors.forEach((e) => console.log('  ', e));
  }
  if (pageErrors.length) {
    console.log('\nPage errors:');
    pageErrors.forEach((e) => console.log('  ', e));
  }

  const pass = nodeCountAfterWait > 0;
  console.log(`\n${pass ? 'PASS' : 'FAIL'}: add node to canvas`);
  await browser.close();
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
