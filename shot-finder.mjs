import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'temporary screenshots');
const existing = fs.readdirSync(outDir).filter(f => f.startsWith('screenshot-'));
const nums = existing.map(f => parseInt(f.match(/screenshot-(\d+)/)?.[1] || '0', 10));
let next = (nums.length ? Math.max(...nums) : 0) + 1;
const browser = await puppeteer.launch({ executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
await page.evaluate(() => document.querySelector('[data-finder="home"]').scrollIntoView({block:'center'}));
await new Promise(r => setTimeout(r, 500));
const file = path.join(outDir, `screenshot-${next++}-finder-new-icons.png`);
const rect = await page.evaluate(() => {
  const tiles = document.querySelectorAll('.finder-tile');
  const first = tiles[0].getBoundingClientRect();
  const last = tiles[tiles.length - 1].getBoundingClientRect();
  return {
    x: Math.max(0, first.x - 20),
    y: first.y + window.scrollY - 20,
    width: (last.x + last.width - first.x) + 40,
    height: first.height + 40
  };
});
await page.screenshot({ path: file, clip: rect, captureBeyondViewport: true });
console.log(`Saved: ${file}`);
await browser.close();
