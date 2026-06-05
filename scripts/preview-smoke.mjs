/**
 * Automated preview smoke checks for the Vite-built app.
 * Run: node scripts/preview-smoke.mjs [baseUrl]
 */
import { chromium } from 'playwright';

const BASE = (process.argv[2] || 'http://127.0.0.1:4174').replace(/\/$/, '');
const results = [];

function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function fetchOk(url) {
  const res = await fetch(url);
  return res.ok;
}

async function httpSmoke() {
  const paths = [
    '/',
    '/map-window.html',
    '/manifest.webmanifest',
    '/sw.js',
    '/registerSW.js',
    '/robots.txt'
  ];
  for (const path of paths) {
    const ok = await fetchOk(`${BASE}${path}`);
    record(`HTTP ${path}`, ok, ok ? '200' : 'non-OK response');
  }
}

async function dismissBlockingModals(page) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const overlay = page.locator('.modal-overlay').first();
    const visible = await overlay.isVisible().catch(() => false);
    if (!visible) return;

    const cancelBtn = page.locator('.cancel-btn').first();
    if (await cancelBtn.isVisible().catch(() => false)) {
      await cancelBtn.click();
      await page.waitForTimeout(200);
      continue;
    }

    const closeBtn = page.locator('.close-modal, button[aria-label="Close"]').first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
      await page.waitForTimeout(200);
      continue;
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
}

async function browserSmoke(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  const response = await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
  record('App shell loads', response?.ok() === true, `status ${response?.status() ?? 'n/a'}`);

  await page.waitForSelector('#map-container', { timeout: 30000 });
  record('Map container present', true);

  // Boot may show tool guide and/or session-restore prompts.
  await page.waitForTimeout(800);
  await dismissBlockingModals(page);

  const headerButtons = [
    '#btn-import',
    '#btn-workflow',
    '#btn-dual-screen',
    '#btn-undo',
    '#btn-redo'
  ];
  for (const sel of headerButtons) {
    const visible = await page.locator(sel).isVisible().catch(() => false);
    record(`Header control ${sel}`, visible);
  }

  const panelHosts = ['#layer-list', '#field-list', '#output-panel-content'];
  for (const sel of panelHosts) {
    const attached = await page.locator(sel).count() > 0;
    record(`Panel host ${sel}`, attached);
  }

  // MapLibre canvas should appear once map initializes.
  const mapCanvas = await page.locator('.maplibregl-canvas').count();
  record('MapLibre canvas rendered', mapCanvas > 0, `count=${mapCanvas}`);

  try {
    await dismissBlockingModals(page);
    await page.locator('#btn-workflow').click({ timeout: 10000 });
    await page.waitForTimeout(500);
    const workflowVisible = await page.locator('#wf-overlay.visible, .wf-overlay.visible, .react-flow').first().isVisible().catch(() => false);
    record('Workflow editor opens', workflowVisible);
  } catch (error) {
    record('Workflow editor opens', false, error.message);
  }

  try {
    const swRegistered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) return true;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return false;
    });
    record('Service worker registered', swRegistered);
  } catch (error) {
    record('Service worker registered', false, error.message);
  }

  const onlineConsoleErrors = [...consoleErrors];
  const onlinePageErrors = [...pageErrors];
  consoleErrors.length = 0;
  pageErrors.length = 0;

  try {
    await page.context().setOffline(true);
    const offlineResponse = await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
    const offlineTitle = await page.title().catch(() => '');
    record(
      'Offline reload serves app shell',
      offlineResponse !== null && offlineTitle.includes('GIS'),
      offlineTitle
    );
    await page.context().setOffline(false);
    await page.reload({ waitUntil: 'networkidle', timeout: 60000 }).catch(() => null);
  } catch (error) {
    await page.context().setOffline(false).catch(() => {});
    record('Offline reload serves app shell', false, error.message);
  }

  try {
    const mapWindow = await browser.newPage();
    const mapWindowResponse = await mapWindow.goto(`${BASE}/map-window.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    record('Map window entry loads', mapWindowResponse?.ok() === true, `status ${mapWindowResponse?.status() ?? 'n/a'}`);
    await mapWindow.close();
  } catch (error) {
    record('Map window entry loads', false, error.message);
  }

  const fatalConsole = onlineConsoleErrors.filter((msg) => !/favicon|googletagmanager|gtag|analytics|ERR_INTERNET_DISCONNECTED/i.test(msg));
  record('No fatal console errors (online)', fatalConsole.length === 0, fatalConsole.slice(0, 3).join(' | ') || 'none');
  record('No uncaught page errors (online)', onlinePageErrors.length === 0, onlinePageErrors.slice(0, 3).join(' | ') || 'none');

  await page.close();
}

async function main() {
  console.log(`Preview smoke against ${BASE}\n`);

  try {
    await httpSmoke();
  } catch (error) {
    record('HTTP smoke', false, error.message);
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    await browserSmoke(browser);
  } catch (error) {
    record('Browser smoke', false, error.message);
  } finally {
    await browser?.close();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\nSummary: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log('Failed checks:');
    failed.forEach((f) => console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`));
    process.exit(1);
  }
}

main();
