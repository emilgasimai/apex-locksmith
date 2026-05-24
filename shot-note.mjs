import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'temporary screenshots');
const existing = fs.readdirSync(outDir).filter(f => f.startsWith('screenshot-'));
const nums = existing.map(f => parseInt(f.match(/screenshot-(\d+)/)?.[1] || '0', 10));
let next = (nums.length ? Math.max(...nums) : 0) + 1;

const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  headless: 'new',
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

// Helper: clip the contact form area (with toast space below it)
async function shotForm(label) {
  const file = path.join(outDir, `screenshot-${next++}-${label}.png`);
  const rect = await page.evaluate(() => {
    const f = document.getElementById('contactForm').getBoundingClientRect();
    return {
      x: Math.max(0, f.x - 20),
      y: f.y + window.scrollY - 20,
      width: Math.min(window.innerWidth - 0, f.width + 40),
      height: f.height + 160, // include possible toast at bottom
    };
  });
  await page.screenshot({ path: file, clip: rect, captureBeyondViewport: true });
  console.log(`Saved: ${file}`);
}

// Helper: clip viewport (for toast which is position:fixed)
async function shotViewport(label) {
  const file = path.join(outDir, `screenshot-${next++}-${label}.png`);
  await page.screenshot({ path: file });
  console.log(`Saved: ${file}`);
}

// Scroll the contact form into view and focus the textarea
await page.evaluate(() => document.getElementById('contactNote').scrollIntoView({block:'center'}));
await new Promise(r => setTimeout(r, 400));

const inject = async (text) => page.evaluate((t) => {
  const el = document.getElementById('contactNote');
  // Use the native setter so React-style listeners don't matter; dispatch input event
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(el, t);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, text);

// State A — empty (default counter)
await inject('');
await shotForm('note-A-empty');

// State B — 100 non-space chars (default color)
await inject('a'.repeat(100));
await shotForm('note-B-100');

// State C — 180 non-space chars (yellow threshold)
await inject('a'.repeat(180));
await shotForm('note-C-180-warn');

// State D — 230 non-space chars (red threshold)
await inject('a'.repeat(230));
await shotForm('note-D-230-danger');

// State E — try to push to 300 non-space chars → truncates + fires toast
await inject('a'.repeat(300));
// Capture the viewport so the fixed-position toast at the bottom is visible
await new Promise(r => setTimeout(r, 200));
// Scroll so the toast region is visible at viewport bottom (toast is fixed so it's always at the viewport)
await shotViewport('note-E-overflow-toast');

// Allow the toast to fade away
await new Promise(r => setTimeout(r, 3000));

// State F — confirm value was truncated to exactly 250 non-space chars
const final = await page.evaluate(() => {
  const v = document.getElementById('contactNote').value;
  return { value: v, len: v.length, nonSpace: v.replace(/\s/g,'').length };
});
console.log('After overflow:', final);

// State G — verify spaces don't count: type 250 chars + many trailing spaces
await inject('a'.repeat(250) + '     ');
const spaceCheck = await page.evaluate(() => {
  const v = document.getElementById('contactNote').value;
  return { len: v.length, nonSpace: v.replace(/\s/g,'').length };
});
console.log('Spaces test:', spaceCheck);
await shotForm('note-G-spaces-ok');

await browser.close();
