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
page.on('pageerror', e => console.log('[err]', e.message));
await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

// FIX 1: hero with particles — full viewport width capture
await page.waitForFunction(() => document.querySelectorAll('#heroParticles .hero-particle').length >= 40, {timeout:8000}).catch(()=>{});
await new Promise(r => setTimeout(r, 1200));
const fix1 = path.join(outDir, `screenshot-${next++}-fix1-hero-fullwidth.png`);
const heroRect = await page.evaluate(() => {
  const r = document.getElementById('home').getBoundingClientRect();
  return { x: 0, y: 0, width: window.innerWidth, height: r.bottom };
});
await page.screenshot({ path: fix1, clip: heroRect });
console.log(`Saved: ${fix1}`);

const particleInfo = await page.evaluate(() => {
  const parts = document.querySelectorAll('#heroParticles .hero-particle');
  const container = document.getElementById('heroParticles');
  return { count: parts.length, containerWidth: container.offsetWidth, viewportWidth: window.innerWidth };
});
console.log('FIX1 particle state:', JSON.stringify(particleInfo));

// FIX 2: hover a carousel card
await page.evaluate(() => document.querySelector('#svcTrack').scrollIntoView({block:'center'}));
await new Promise(r => setTimeout(r, 400));
const card = await page.$('.svc-card:not(.svc-cta)');
const box = await card.boundingBox();
await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
await new Promise(r => setTimeout(r, 500));

const fix2 = path.join(outDir, `screenshot-${next++}-fix2-carousel-hover.png`);
const cRect = await page.evaluate(() => {
  const r = document.querySelector('.svc-card:not(.svc-cta)').getBoundingClientRect();
  return { x: Math.max(0,r.x-20), y: r.y + window.scrollY - 30, width: r.width + 40, height: 110 };
});
await page.screenshot({ path: fix2, clip: cRect, captureBeyondViewport: true });
console.log(`Saved: ${fix2}`);

// FIX 3: pricing copy
const fix3 = path.join(outDir, `screenshot-${next++}-fix3-pricing-copy.png`);
const pricingRect = await page.evaluate(() => {
  // Locate by text content
  const headings = Array.from(document.querySelectorAll('div')).filter(d =>
    d.textContent.trim().startsWith('TRANSPARENT PRICING') ||
    d.textContent.trim().startsWith('FAIR PRICE')
  );
  const h = headings[0];
  const box = h?.closest('div[style*="background:#0f0f10"]');
  if (!box) return null;
  const r = box.getBoundingClientRect();
  return { x: Math.max(0,r.x-20), y: r.y + window.scrollY - 20, width: r.width + 40, height: r.height + 40 };
});
if (pricingRect) {
  await page.screenshot({ path: fix3, clip: pricingRect, captureBeyondViewport: true });
  console.log(`Saved: ${fix3}`);
}
const pricingText = await page.evaluate(() => {
  const el = document.querySelector('div[style*="background:#0f0f10"][style*="padding:20px 22px"]');
  return el ? el.textContent.replace(/\s+/g,' ').trim() : null;
});
console.log('FIX3 pricing text:', pricingText);

await browser.close();
