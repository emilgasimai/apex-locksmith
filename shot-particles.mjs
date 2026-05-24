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
page.on('console', m => { if (m.type() !== 'log') console.log('[page]', m.type(), m.text()); });
page.on('pageerror', e => console.log('[err]', e.message));
await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

// Wait for particles to mount + a frame of motion
await page.waitForFunction(
  () => document.querySelectorAll('#heroParticles .hero-particle').length >= 20,
  { timeout: 8000 }
).catch(() => console.log('particles did not reach 20 in time'));
await new Promise(r => setTimeout(r, 1200));

// Report particle state
const info = await page.evaluate(() => {
  const parts = document.querySelectorAll('#heroParticles .hero-particle');
  const pulses = document.querySelectorAll('#heroParticles .hero-particle.pulse');
  const samples = Array.from(parts).slice(0, 4).map(p => {
    const cs = getComputedStyle(p);
    const inner = p.querySelector('.hero-particle-spin');
    return {
      transform: p.style.transform,
      opacity: p.style.opacity,
      size: p.style.width,
      hasPulse: p.classList.contains('pulse'),
      spinDuration: inner?.style.animationDuration,
      spinDirection: inner?.style.animationDirection,
      svgPresent: !!p.querySelector('svg'),
      computedZIndex: cs.zIndex,
    };
  });
  // Check stacking — make sure hero content is above particles
  const grid = document.querySelector('#home > .hero-grid');
  const containerZ = getComputedStyle(document.getElementById('heroParticles')).zIndex;
  const gridZ = grid ? getComputedStyle(grid).zIndex : null;
  return { total: parts.length, pulseCount: pulses.length, containerZ, gridZ, samples };
});
console.log(JSON.stringify(info, null, 2));

// Test interactivity — click TAP TO CALL hero button to ensure it's still clickable
const heroBtn = await page.$('#heroCallBtn');
const heroBox = await heroBtn.boundingBox();
const elAtPoint = await page.evaluate(({x, y}) => {
  const el = document.elementFromPoint(x, y);
  return { tag: el?.tagName, id: el?.id, cls: el?.className };
}, { x: heroBox.x + heroBox.width / 2, y: heroBox.y + heroBox.height / 2 });
console.log('elementFromPoint at TAP TO CALL:', JSON.stringify(elAtPoint));

const file1 = path.join(outDir, `screenshot-${next++}-hero-particles-desktop.png`);
const rect = await page.evaluate(() => {
  const r = document.getElementById('home').getBoundingClientRect();
  return { x: 0, y: 0, width: window.innerWidth, height: r.bottom };
});
await page.screenshot({ path: file1, clip: rect });
console.log(`Saved: ${file1}`);

// Mobile
await page.setViewport({ width: 390, height: 844, isMobile: true });
await new Promise(r => setTimeout(r, 800));
const file2 = path.join(outDir, `screenshot-${next++}-hero-particles-mobile.png`);
await page.screenshot({ path: file2, fullPage: true });
console.log(`Saved: ${file2}`);

await browser.close();
