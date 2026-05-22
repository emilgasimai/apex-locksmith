import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'temporary screenshots');
const existing = fs.readdirSync(outDir).filter(f => f.startsWith('screenshot-'));
const nums = existing.map(f => parseInt(f.match(/screenshot-(\d+)/)?.[1] || '0', 10));
let next = (nums.length ? Math.max(...nums) : 0) + 1;

async function shot(el, name) {
  const file = path.join(outDir, `screenshot-${next++}-${name}.png`);
  await el.screenshot({ path: file });
  console.log(`Saved: ${file}`);
}

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

// --- Test 1: ZIP — invalid input ---
await page.click('#zipInput');
await page.type('#zipInput', '12345', { delay: 25 });
await page.click('#zipForm button[type="submit"]');
await new Promise(r => setTimeout(r, 250));
await shot(await page.$('#zipForm'), 'zip-invalid');

// --- Test 2: ZIP — covered (typed lowercase, no space) ---
await page.evaluate(() => { document.getElementById('zipInput').value = ''; });
await page.click('#zipInput');
await page.type('#zipInput', 'm5v1a1', { delay: 25 });
await page.click('#zipForm button[type="submit"]');
await new Promise(r => setTimeout(r, 250));
await shot(await page.$('#zipForm'), 'zip-covered');

// --- Test 3: contact form — invalid submit ---
await page.click('#contactPhone');
await page.type('#contactPhone', '4165', { delay: 25 });
await page.click('#contactPostal');
await page.type('#contactPostal', 'XX', { delay: 25 });
await page.click('#contactForm button[type="submit"]');
await new Promise(r => setTimeout(r, 250));
await shot(await page.$('#contactForm'), 'form-invalid');

// --- Test 4: contact form — valid submit (success state) ---
await page.evaluate(() => {
  ['contactName','contactPhone','contactPostal'].forEach(id => {
    const i = document.getElementById(id);
    i.value = '';
    i.classList.remove('invalid');
    const e = document.getElementById(id + '-error');
    if (e) e.classList.remove('show');
  });
});
await page.click('#contactName');
await page.type('#contactName', 'Emil Test', { delay: 18 });
await page.click('#contactPhone');
await page.type('#contactPhone', '4165550100', { delay: 18 });
await page.click('#contactPostal');
await page.type('#contactPostal', 'm5v1a1', { delay: 18 });
await page.click('#contactForm button[type="submit"]');
await new Promise(r => setTimeout(r, 400));
await shot(await page.$('#contactForm'), 'form-success');

await browser.close();
