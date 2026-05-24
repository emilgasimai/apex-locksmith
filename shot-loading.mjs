import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = process.argv[2] || 'http://localhost:3000';
const label = process.argv[3] || 'loading';
const viewport = process.argv[4] || 'desktop';

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  phone:   { width: 390,  height: 844  },
};
const vp = VIEWPORTS[viewport] || VIEWPORTS.desktop;

const outDir = path.join(__dirname, 'temporary screenshots');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const existing = fs.readdirSync(outDir).filter(f => f.startsWith('screenshot-'));
const nums = existing.map(f => parseInt(f.match(/screenshot-(\d+)/)?.[1] || '0', 10));
const next = (nums.length ? Math.max(...nums) : 0) + 1;
const outFile = path.join(outDir, `screenshot-${next}-${label}.png`);

const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  headless: 'new',
});
const page = await browser.newPage();
await page.setViewport(vp);
// Go and wait only for DOM, NOT networkidle (so overlay is still visible).
await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
// Loading overlay has already self-hidden by now; click the dev Test button
// to re-trigger it, then capture mid-animation.
await page.click('#testLoadingBtn');
await new Promise(r => setTimeout(r, 900));
await page.screenshot({ path: outFile });
await browser.close();
console.log(`Saved: ${outFile}`);
