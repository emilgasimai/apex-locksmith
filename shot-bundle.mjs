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
page.on('pageerror', e => console.log('[err]', e.message));

// ====== FIX 1 — carousel: hover border + cursor ======
await page.setViewport({ width: 1440, height: 900 });
await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
await page.evaluate(() => document.querySelector('#svcTrack').scrollIntoView({block:'center'}));
await new Promise(r => setTimeout(r, 400));
const trackCursor = await page.evaluate(() => getComputedStyle(document.getElementById('svcTrack')).cursor);
const cardCursor = await page.evaluate(() => getComputedStyle(document.querySelector('.svc-card:not(.svc-cta)')).cursor);
const userSelect = await page.evaluate(() => getComputedStyle(document.getElementById('svcTrack')).userSelect);
console.log('FIX1 cursor states:', { track: trackCursor, card: cardCursor, userSelect });

// drag test: simulate drag and check scrollLeft changed
const initialScroll = await page.evaluate(() => document.getElementById('svcTrack').scrollLeft);
const trackBox = await (await page.$('#svcTrack')).boundingBox();
await page.mouse.move(trackBox.x + 300, trackBox.y + trackBox.height/2);
await page.mouse.down();
await page.mouse.move(trackBox.x + 100, trackBox.y + trackBox.height/2, { steps: 10 });
await new Promise(r => setTimeout(r, 200));
const dragCursor = await page.evaluate(() => getComputedStyle(document.getElementById('svcTrack')).cursor);
const draggingClass = await page.evaluate(() => document.getElementById('svcTrack').classList.contains('dragging'));
await page.mouse.up();
await new Promise(r => setTimeout(r, 300));
const finalScroll = await page.evaluate(() => document.getElementById('svcTrack').scrollLeft);
console.log('FIX1 drag results:', { initialScroll, finalScroll, scrolled: finalScroll !== initialScroll, dragCursor, draggingClass });

// Reset scroll
await page.evaluate(() => document.getElementById('svcTrack').scrollLeft = 0);
await new Promise(r => setTimeout(r, 200));

// Hover screenshot
const card = await page.$('.svc-card:not(.svc-cta)');
const cBox = await card.boundingBox();
await page.mouse.move(cBox.x + cBox.width/2, cBox.y + cBox.height/2);
await new Promise(r => setTimeout(r, 500));
const f1 = path.join(outDir, `screenshot-${next++}-bundle-fix1-carousel-hover.png`);
const f1rect = await page.evaluate(() => {
  const r = document.querySelector('.svc-card:not(.svc-cta)').getBoundingClientRect();
  return { x: Math.max(0,r.x-20), y: r.y + window.scrollY - 30, width: r.width + 40, height: 130 };
});
await page.screenshot({ path: f1, clip: f1rect, captureBeyondViewport: true });
console.log(`Saved: ${f1}`);

// ====== FIX 2 — mobile menu ======
await page.setViewport({ width: 390, height: 844 });
await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 500));

// Capture: hero with menu CLOSED
const f2closed = path.join(outDir, `screenshot-${next++}-bundle-fix2-menu-closed.png`);
await page.screenshot({ path: f2closed, clip: { x: 0, y: 0, width: 390, height: 600 } });
console.log(`Saved: ${f2closed}`);

// Snapshot the hero headline Y position before opening
const heroYBefore = await page.evaluate(() => document.querySelector('#home h1').getBoundingClientRect().top);

// Open menu
await page.click('#lockBtn');
await new Promise(r => setTimeout(r, 700));
const heroYAfter = await page.evaluate(() => document.querySelector('#home h1').getBoundingClientRect().top);
const menuBg = await page.evaluate(() => getComputedStyle(document.getElementById('mobileMenu')).backgroundColor);
const menuPos = await page.evaluate(() => getComputedStyle(document.getElementById('mobileMenu')).position);
console.log('FIX2 menu open results:', { heroYBefore, heroYAfter, didPushDown: heroYBefore !== heroYAfter, menuBg, menuPos });

const f2open = path.join(outDir, `screenshot-${next++}-bundle-fix2-menu-open.png`);
await page.screenshot({ path: f2open, clip: { x: 0, y: 0, width: 390, height: 600 } });
console.log(`Saved: ${f2open}`);

// ====== FIX 3 — Owner-Operated text ======
await page.setViewport({ width: 1440, height: 900 });
await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
await page.evaluate(() => document.getElementById('about').scrollIntoView({block:'center'}));
await new Promise(r => setTimeout(r, 500));
const ownerText = await page.evaluate(() => {
  const p = document.querySelector('#about p.font-body');
  return p ? p.textContent.trim() : null;
});
console.log('FIX3 owner text:', ownerText);
const f3 = path.join(outDir, `screenshot-${next++}-bundle-fix3-owner-operated.png`);
const ownerRect = await page.evaluate(() => {
  const r = document.getElementById('about').getBoundingClientRect();
  return { x: Math.max(0,r.x), y: r.y + window.scrollY, width: r.width, height: 380 };
});
await page.screenshot({ path: f3, clip: ownerRect, captureBeyondViewport: true });
console.log(`Saved: ${f3}`);

// ====== FIX 4 — pricing info icon + tooltip ======
await page.evaluate(() => document.querySelector('.price-card').scrollIntoView({block:'center'}));
await new Promise(r => setTimeout(r, 400));
const infoBtn = await page.$('.price-info');
const ibox = await infoBtn.boundingBox();
await page.mouse.move(ibox.x + ibox.width/2, ibox.y + ibox.height/2);
await new Promise(r => setTimeout(r, 400));
const tooltipShown = await page.evaluate(() => {
  const tt = document.querySelector('.price-info-tooltip');
  return { opacity: getComputedStyle(tt).opacity, text: tt.textContent.trim().slice(0,40) };
});
console.log('FIX4 tooltip state:', tooltipShown);
const f4 = path.join(outDir, `screenshot-${next++}-bundle-fix4-pricing-tooltip.png`);
const priceRect = await page.evaluate(() => {
  const r = document.querySelector('.price-card').getBoundingClientRect();
  return { x: Math.max(0,r.x-20), y: r.y + window.scrollY - 20, width: r.width + 40, height: r.height + 180 };
});
await page.screenshot({ path: f4, clip: priceRect, captureBeyondViewport: true });
console.log(`Saved: ${f4}`);

await browser.close();
