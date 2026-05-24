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
page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') console.log('[' + m.type() + ']', m.text()); });

// ===== Task A — Owner-Operated background (desktop) =====
await page.setViewport({ width: 1440, height: 900 });
await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
await page.evaluate(() => document.getElementById('about').scrollIntoView({block:'center'}));
await new Promise(r => setTimeout(r, 600));
const aboutInfo = await page.evaluate(() => {
  const s = document.getElementById('about');
  const cs = getComputedStyle(s);
  const r = s.getBoundingClientRect();
  return {
    width: Math.round(r.width),
    viewportWidth: window.innerWidth,
    bgImage: cs.backgroundImage.slice(0, 80),
    bgSize: cs.backgroundSize,
    bgPos: cs.backgroundPosition,
    hasOverlay: !!s.querySelector('.about-overlay'),
    hasVignette: !!s.querySelector('.about-vignette'),
  };
});
console.log('Task A — about section:', aboutInfo);
const fA = path.join(outDir, `screenshot-${next++}-newbundle-A-owner-bg-desktop.png`);
const aboutRect = await page.evaluate(() => {
  const r = document.getElementById('about').getBoundingClientRect();
  return { x: 0, y: r.top + window.scrollY, width: window.innerWidth, height: r.height };
});
await page.screenshot({ path: fA, clip: aboutRect, captureBeyondViewport: true });
console.log(`Saved: ${fA}`);

// Task A — mobile
await page.setViewport({ width: 390, height: 844 });
await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
await page.evaluate(() => document.getElementById('about').scrollIntoView({block:'start'}));
await new Promise(r => setTimeout(r, 500));
const fAm = path.join(outDir, `screenshot-${next++}-newbundle-A-owner-bg-mobile.png`);
const aboutMRect = await page.evaluate(() => {
  const r = document.getElementById('about').getBoundingClientRect();
  return { x: 0, y: r.top + window.scrollY, width: window.innerWidth, height: Math.min(900, r.height) };
});
await page.screenshot({ path: fAm, clip: aboutMRect, captureBeyondViewport: true });
console.log(`Saved: ${fAm}`);

// ===== Task B — Footer =====
await page.setViewport({ width: 1440, height: 900 });
await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
await page.evaluate(() => document.querySelector('footer').scrollIntoView({block:'end'}));
await new Promise(r => setTimeout(r, 400));
const footerInfo = await page.evaluate(() => {
  const f = document.querySelector('footer');
  return {
    hasAreasLine: /Serving/.test(f.textContent),
    hasCopyright: /© 2025 APEX LOCKSMITH\. ALL RIGHTS RESERVED\./.test(f.textContent),
    areas: f.querySelector('.footer-areas')?.textContent.replace(/\s+/g,' ').trim().slice(0,180),
  };
});
console.log('Task B — footer:', footerInfo);
const fB = path.join(outDir, `screenshot-${next++}-newbundle-B-footer.png`);
const footerRect = await page.evaluate(() => {
  const r = document.querySelector('footer').getBoundingClientRect();
  return { x: 0, y: r.top + window.scrollY - 10, width: window.innerWidth, height: r.height + 20 };
});
await page.screenshot({ path: fB, clip: footerRect, captureBeyondViewport: true });
console.log(`Saved: ${fB}`);

// ===== Task C — Message FAB =====
await page.evaluate(() => window.scrollTo(0, 0));
await new Promise(r => setTimeout(r, 300));
// Move map / overlay aside if anything — just go to bottom of page where FABs live
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
await new Promise(r => setTimeout(r, 300));
const fabExists = await page.evaluate(() => !!document.getElementById('msgFab'));
console.log('Task C — msgFab exists:', fabExists);
// Closed state
const fC1 = path.join(outDir, `screenshot-${next++}-newbundle-C-msgfab-closed.png`);
await page.screenshot({ path: fC1, clip: { x: 1440 - 240, y: 900 - 280, width: 240, height: 280 } });
console.log(`Saved: ${fC1}`);
// Open it
await page.click('#msgFabToggle');
await new Promise(r => setTimeout(r, 400));
const openState = await page.evaluate(() => {
  const fab = document.getElementById('msgFab');
  const opts = fab.querySelector('.msg-fab-options');
  return {
    open: fab.classList.contains('open'),
    opacity: getComputedStyle(opts).opacity,
    waHref: fab.querySelector('.msg-fab-wa').getAttribute('href'),
    smsHref: fab.querySelector('.msg-fab-sms').getAttribute('href'),
  };
});
console.log('Task C — open state:', openState);
const fC2 = path.join(outDir, `screenshot-${next++}-newbundle-C-msgfab-open.png`);
await page.screenshot({ path: fC2, clip: { x: 1440 - 280, y: 900 - 320, width: 280, height: 320 } });
console.log(`Saved: ${fC2}`);

// ===== Task D — Particles =====
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForFunction(() => document.querySelectorAll('#heroParticles .hero-particle').length >= 60, {timeout:8000}).catch(()=>{});
await new Promise(r => setTimeout(r, 1200));
const partInfo = await page.evaluate(() => {
  const c = document.getElementById('heroParticles');
  const cs = getComputedStyle(c);
  const r = c.getBoundingClientRect();
  return {
    count: c.querySelectorAll('.hero-particle').length,
    containerWidth: Math.round(r.width),
    viewportWidth: window.innerWidth,
    height: Math.round(r.height),
    zIndex: cs.zIndex,
    left: Math.round(r.left),
  };
});
console.log('Task D — particles:', partInfo);
const fD = path.join(outDir, `screenshot-${next++}-newbundle-D-hero-particles.png`);
const heroRect = await page.evaluate(() => {
  const r = document.getElementById('home').getBoundingClientRect();
  return { x: 0, y: 0, width: window.innerWidth, height: Math.min(900, r.bottom) };
});
await page.screenshot({ path: fD, clip: heroRect });
console.log(`Saved: ${fD}`);

await browser.close();
