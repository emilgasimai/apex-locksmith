import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'temporary screenshots');
const existing = fs.readdirSync(outDir).filter(f => f.startsWith('screenshot-'));
const nums = existing.map(f => parseInt(f.match(/screenshot-(\d+)/)?.[1] || '0', 10));
const next = (nums.length ? Math.max(...nums) : 0) + 1;

const browser = await puppeteer.launch({ executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, headless: 'new' });
const ctx = browser.defaultBrowserContext();
// Explicitly DENY geolocation
await ctx.clearPermissionOverrides();
// Don't grant geolocation; the page will see a permission-denied (or unsupported) error.
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
await page.click('#useMyLocBtn');
await new Promise(r => setTimeout(r, 1500));

const sideFile = path.join(outDir, `screenshot-${next}-geo-denied.png`);
const sideRect = await page.evaluate(() => {
  const r = document.querySelector('.hero-side').getBoundingClientRect();
  return { x: r.x - 10, y: r.y - 10, width: r.width + 20, height: r.height + 20 };
});
await page.screenshot({ path: sideFile, clip: sideRect });
console.log(`Saved: ${sideFile}`);
await browser.close();
