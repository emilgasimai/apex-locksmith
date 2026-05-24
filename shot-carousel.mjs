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
await page.evaluate(() => document.querySelector('#svcTrack').scrollIntoView({block:'center'}));
await new Promise(r => setTimeout(r, 600));

async function shotTrack(label) {
  const file = path.join(outDir, `screenshot-${next++}-${label}.png`);
  const rect = await page.evaluate(() => {
    const r = document.getElementById('svcTrack').getBoundingClientRect();
    return { x: Math.max(0, r.x - 20), y: r.y + window.scrollY - 20, width: r.width + 40, height: r.height + 40 };
  });
  await page.screenshot({ path: file, clip: rect, captureBeyondViewport: true });
  console.log(`Saved: ${file}`);
}

// Default state
await shotTrack('carousel-default');

async function shotTopOfFirstCard(label) {
  const file = path.join(outDir, `screenshot-${next++}-${label}.png`);
  const rect = await page.evaluate(() => {
    const r = document.querySelector('.svc-card:not(.svc-cta)').getBoundingClientRect();
    return { x: Math.max(0, r.x - 20), y: r.y + window.scrollY - 20, width: r.width + 40, height: 90 };
  });
  await page.screenshot({ path: file, clip: rect, captureBeyondViewport: true });
  console.log(`Saved: ${file}`);
}

// Hover first card
const card = await page.$('.svc-card:not(.svc-cta)');
const box = await card.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await new Promise(r => setTimeout(r, 600));
await shotTrack('carousel-hover');
await shotTopOfFirstCard('carousel-card-top-closeup');

// Get computed styles of the hovered card and svc-num
const styles = await page.evaluate(() => {
  const card = document.querySelector('.svc-card:not(.svc-cta)');
  const num = card.querySelector('.svc-num');
  const tag = card.querySelector('.svc-tag');
  const cs = getComputedStyle(card);
  const ns = getComputedStyle(num);
  return {
    cardBorder: cs.border,
    cardBorderTop: cs.borderTop,
    cardBorderTopWidth: cs.borderTopWidth,
    cardBorderTopColor: cs.borderTopColor,
    cardBoxShadow: cs.boxShadow,
    numBackground: ns.backgroundColor,
    numTop: ns.top,
    numLeft: ns.left,
    numHeight: num.offsetHeight,
    numBoundingTop: num.getBoundingClientRect().top - card.getBoundingClientRect().top,
    tagBackground: getComputedStyle(tag).backgroundColor,
  };
});
console.log(JSON.stringify(styles, null, 2));

await browser.close();
