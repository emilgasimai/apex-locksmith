import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'temporary screenshots');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const existing = fs.readdirSync(outDir).filter(f => f.startsWith('screenshot-'));
const nums = existing.map(f => parseInt(f.match(/screenshot-(\d+)/)?.[1] || '0', 10));
const startNext = (nums.length ? Math.max(...nums) : 0) + 1;

const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  headless: 'new',
});
const ctx = browser.defaultBrowserContext();
await ctx.overridePermissions('http://localhost:3000', ['geolocation']);
const page = await browser.newPage();
// CN Tower / downtown Toronto coords
await page.setGeolocation({ latitude: 43.6426, longitude: -79.3871 });
await page.setViewport({ width: 1440, height: 900 });
await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise(r => setTimeout(r, 600));

// Click the Use My Location button
await page.click('#useMyLocBtn');
// Move mouse away so hover state on the button doesn't persist
await page.mouse.move(20, 20);
// Wait for map to expand + Nominatim to resolve (free API can be slow)
await page.waitForFunction(
  () => document.getElementById('zoneDistrict')?.style.display === 'flex',
  { timeout: 15000 }
).catch(() => console.log('district element did not appear in time'));
await new Promise(r => setTimeout(r, 800));

// Full hero region screenshot
const heroFile = path.join(outDir, `screenshot-${startNext}-geo-open-hero.png`);
const heroRect = await page.evaluate(() => {
  const r = document.getElementById('home').getBoundingClientRect();
  return { x: 0, y: r.y, width: window.innerWidth, height: r.bottom + 40 };
});
await page.screenshot({ path: heroFile, clip: heroRect });
console.log(`Saved: ${heroFile}`);

// Tight closeup on just the zone-check side, expanded to include any overflow
const sideFile = path.join(outDir, `screenshot-${startNext + 1}-geo-open-side.png`);
const sideRect = await page.evaluate(() => {
  const r = document.querySelector('.hero-side').getBoundingClientRect();
  return { x: r.x - 10, y: r.y - 10, width: r.width + 20, height: r.height + 20 };
});
await page.screenshot({ path: sideFile, clip: sideRect });
console.log(`Saved: ${sideFile}`);

await browser.close();
