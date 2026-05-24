import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = process.argv[2] || 'http://localhost:3000';
const label = process.argv[3] || 'contact';
const viewport = process.argv[4] || 'desktop';
const hover = process.argv[5] === 'hover';

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  phone:   { width: 390,  height: 844  },
};
const vp = VIEWPORTS[viewport] || VIEWPORTS.desktop;

const outDir = path.join(__dirname, 'temporary screenshots');
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
await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
await page.evaluate(() => {
  document.querySelector('#contact').scrollIntoView({ block: 'start' });
});
await new Promise(r => setTimeout(r, 400));
if (hover) {
  const btn = await page.$('.btn-msg-outline');
  if (btn) await btn.hover();
  await new Promise(r => setTimeout(r, 300));
}
const el = await page.$('#contact');
await el.screenshot({ path: outFile });
await browser.close();
console.log(`Saved: ${outFile}`);
