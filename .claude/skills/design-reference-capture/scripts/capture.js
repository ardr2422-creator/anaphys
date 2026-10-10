#!/usr/bin/env node
// Capture de sites de référence : captures desktop/mobile + plan des sections + jetons de design.
// node capture.js <dossier> <url> [url...]     |     node capture.js --find-product <url-accueil>
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PW || 'playwright');
const EXE = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BLOCK = /(google-analytics|googletagmanager|facebook\.net|hotjar|clarity\.ms|tiktok|snapchat|pinterest|doubleclick|klaviyo\.com\/onsite|jsdeliver\.cloud)/;
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };

async function prepare(page) {
  for (const label of ['Accepter', 'Tout accepter', 'Accept', 'Accept all', 'J\'accepte', 'OK', 'Got it']) {
    const b = page.getByRole('button', { name: label, exact: false }).first();
    if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); break; }
  }
  await page.evaluate(async () => {
    document.querySelectorAll('img[loading="lazy"]').forEach((i) => (i.loading = 'eager'));
    for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1200);
}

function outline() {
  const main = document.querySelector('main') || document.body;
  const pick = (el, s) => { const e = el.querySelector(s); if (!e) return null; const c = getComputedStyle(e); return { text: (e.innerText || '').trim().slice(0, 80), font: c.fontFamily.split(',')[0], size: c.fontSize, weight: c.fontWeight, color: c.color, bg: c.backgroundColor, radius: c.borderRadius, transform: c.textTransform, spacing: c.letterSpacing }; };
  const detect = (el) => {
    const t = [];
    if (el.querySelector('details, [aria-expanded]')) t.push('accordion');
    if (el.querySelector('[class*=review i], [class*=rating i], [class*=star i]')) t.push('reviews');
    if (el.querySelector('[class*=bundle i], [class*=offer i], [class*=subscription i], [class*=upsell i]')) t.push('bundle/offer');
    if (el.querySelector('table, [class*=compar i]')) t.push('comparison');
    if (el.querySelector('form[action*="/cart/add"]')) t.push('buy-box');
    if (el.querySelectorAll('img').length > 4) t.push('gallery/grid');
    if (el.querySelector('video')) t.push('video');
    return t;
  };
  const blocks = [...main.children].filter((e) => e.getBoundingClientRect().height > 40).map((e) => ({
    tag: e.tagName.toLowerCase(), cls: String(e.className).slice(0, 80), id: e.id,
    height: Math.round(e.getBoundingClientRect().height),
    heading: (e.querySelector('h1,h2,h3')?.innerText || '').trim().slice(0, 90),
    patterns: detect(e),
  }));
  const body = getComputedStyle(document.body);
  return {
    title: document.title, url: location.href,
    tokens: {
      bodyFont: body.fontFamily, bodySize: body.fontSize, bodyColor: body.color, bodyBg: body.backgroundColor,
      h1: pick(document, 'h1'), h2: pick(document, 'h2'), button: pick(document, 'button[type=submit], .button, button'),
      price: pick(document, '[class*=price i]'),
    },
    fixed: [...document.querySelectorAll('body *')].filter((e) => getComputedStyle(e).position === 'fixed' && e.offsetHeight > 30).slice(0, 6).map((e) => String(e.className).slice(0, 60)),
    blocks,
  };
}

(async () => {
  const args = process.argv.slice(2);
  const browser = await chromium.launch({ executablePath: EXE });
  if (args[0] === '--find-product') {
    const page = await (await browser.newContext()).newPage();
    await page.goto(args[1], { waitUntil: 'domcontentloaded', timeout: 60000 });
    const links = await page.$$eval('a[href*="/products/"]', (as) => [...new Set(as.map((a) => a.href.split('?')[0]))].slice(0, 10));
    console.log(links.join('\n'));
    await browser.close();
    return;
  }
  const [out, ...urls] = args;
  for (const url of urls) {
    const slug = url.replace(/^https?:\/\//, '').replace(/\W+/g, '_').slice(0, 80);
    const dir = path.join(out, slug); fs.mkdirSync(dir, { recursive: true });
    for (const [name, viewport] of Object.entries(VIEWPORTS)) {
      const ctx = await browser.newContext({ viewport, locale: 'fr-FR', isMobile: name === 'mobile', deviceScaleFactor: 1 });
      await ctx.route(BLOCK, (r) => r.abort());
      const page = await ctx.newPage();
      try {
        await page.goto(url, { waitUntil: 'load', timeout: 60000 });
        await prepare(page);
        await page.screenshot({ path: path.join(dir, `${name}-fold.png`) });
        await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
        if (name === 'desktop') fs.writeFileSync(path.join(dir, 'outline.json'), JSON.stringify(await page.evaluate(outline), null, 1));
        console.log(`${dir} ${name} ok`);
      } catch (e) { console.log(`${dir} ${name} ERREUR ${e.message.split('\n')[0]}`); }
      await ctx.close();
    }
  }
  await browser.close();
})();
