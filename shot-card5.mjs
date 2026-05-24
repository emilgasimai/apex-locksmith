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
// Scroll carousel track so card 05 is visible
await page.evaluate(() => {
  const track = document.getElementById('svcTrack');
  track.scrollIntoView({ block: 'center' });
});
await new Promise(r => setTimeout(r, 400));
// Find card 05 (safe) — 5th .svc-slide
await page.evaluate(() => {
  const slides = document.querySelectorAll('#svcTrack .svc-slide');
  const track = document.getElementById('svcTrack');
  const slide = slides[4]; // 5th = safes
  track.scrollLeft = slide.offsetLeft - 20;
});
await new Promise(r => setTimeout(r, 600));
const file = path.join(outDir, `screenshot-${next++}-carousel-right.png`);
const rect = await page.evaluate(() => {
  const r = document.getElementById('svcTrack').getBoundingClientRect();
  return { x: Math.max(0, r.x - 20), y: r.y + window.scrollY - 20, width: r.width + 40, height: r.height + 40 };
});
await page.screenshot({ path: file, clip: rect, captureBeyondViewport: true });
console.log(`Saved: ${file}`);
await browser.close();
