import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = process.argv[2] || 'http://localhost:3000';
const outDir = path.join(__dirname, 'temporary screenshots');

function nextFile(label) {
  const existing = fs.readdirSync(outDir).filter(f => f.startsWith('screenshot-'));
  const nums = existing.map(f => parseInt(f.match(/screenshot-(\d+)/)?.[1] || '0', 10));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return path.join(outDir, `screenshot-${next}-${label}.png`);
}
const clip = { x: 0, y: 0, width: 390, height: 230 };

const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  headless: 'new',
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise(r => setTimeout(r, 400));

async function shot(label) {
  const f = nextFile(label);
  await page.screenshot({ path: f, clip });
  console.log(`Saved: ${f}`);
}

await shot('s1-closed');
await page.hover('#lockBtn');
await new Promise(r => setTimeout(r, 350));
await shot('s2-hover-bloom');
await page.click('#lockBtn');
await new Promise(r => setTimeout(r, 200));
await shot('s3-mid-unlock');
await new Promise(r => setTimeout(r, 800));
await shot('s4-open');
await page.click('#lockBtn');
await new Promise(r => setTimeout(r, 600));
await shot('s5-reclosed');

await browser.close();
