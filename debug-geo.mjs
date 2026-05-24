import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, headless: 'new' });
const ctx = browser.defaultBrowserContext();
await ctx.overridePermissions('http://localhost:3000', ['geolocation']);
const page = await browser.newPage();
await page.setGeolocation({ latitude: 43.6426, longitude: -79.3871 });
await page.setViewport({ width: 1440, height: 900 });
page.on('console', m => console.log('[page]', m.text()));
page.on('pageerror', e => console.log('[err]', e.message));
await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
await page.click('#useMyLocBtn');
await new Promise(r => setTimeout(r, 6000));
const info = await page.evaluate(() => {
  const d = document.getElementById('zoneDistrict');
  const f = document.querySelector('.zone-map-frame');
  return {
    districtDisplay: d.style.display,
    districtInner: d.innerHTML.slice(0, 300),
    districtRect: (() => { const r = d.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })(),
    frameRect: (() => { const r = f.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })(),
    frameOverflow: getComputedStyle(f).overflow,
    framePosition: getComputedStyle(f).position,
    districtPosition: getComputedStyle(d).position,
    districtZIndex: getComputedStyle(d).zIndex,
    districtVisibility: getComputedStyle(d).visibility,
    districtOpacity: getComputedStyle(d).opacity,
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
