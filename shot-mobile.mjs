import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'temporary screenshots');
const existing = fs.readdirSync(outDir).filter(f => f.startsWith('screenshot-'));
const nums = existing.map(f => parseInt(f.match(/screenshot-(\d+)/)?.[1] || '0', 10));
const start = (nums.length ? Math.max(...nums) : 0) + 1;

const browser = await puppeteer.launch({ executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, headless: 'new' });
const ctx = browser.defaultBrowserContext();
await ctx.overridePermissions('http://localhost:3000', ['geolocation']);
const page = await browser.newPage();
await page.setGeolocation({ latitude: 43.6426, longitude: -79.3871 });
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 600));

// 1. Full page mobile (no click)
const fpFile = path.join(outDir, `screenshot-${start}-mobile-closed-full.png`);
await page.screenshot({ path: fpFile, fullPage: true });
console.log(`Saved: ${fpFile}`);

// 2. Mobile expanded — scroll to zone check, click, screenshot
await page.evaluate(() => document.getElementById('useMyLocBtn').scrollIntoView({block:'center'}));
await new Promise(r => setTimeout(r, 400));
await page.click('#useMyLocBtn');
await page.waitForFunction(
  () => document.getElementById('zoneDistrict')?.style.display === 'flex',
  { timeout: 15000 }
).catch(() => console.log('district not visible in time'));
await new Promise(r => setTimeout(r, 1200));

const openFile = path.join(outDir, `screenshot-${start + 1}-mobile-open.png`);
const sideRect = await page.evaluate(() => {
  const r = document.getElementById('zipForm').getBoundingClientRect();
  return { x: 0, y: r.y + window.scrollY - 10, width: window.innerWidth, height: r.height + 30 };
});
await page.screenshot({ path: openFile, clip: sideRect, captureBeyondViewport: true });
console.log(`Saved: ${openFile}`);
await browser.close();
