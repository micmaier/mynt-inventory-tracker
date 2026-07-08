/**
 * Rendert die Seiten einer (Original-)Report-PDF als hochauflösende PNGs
 * nach public/assets/page1..N.png – Basis für die 1:1-Darstellung.
 *
 * Reines Entwickler-Werkzeug (nur nötig, wenn eine neue Vorlage kommt).
 * Puppeteer ist KEINE Laufzeit-Abhängigkeit der App mehr – vor Benutzung
 * einmalig installieren:  npm install --no-save puppeteer
 *
 * Verwendung:  node tools/extract-assets.js "C:/Pfad/zur/Impact Report.pdf"
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const PDF = process.argv[2];
const OUT = path.join(__dirname, '..', 'public', 'assets');
const SCALE = 3; // 3x = ~216 dpi, ausreichend für Druckqualität

if (!PDF || !fs.existsSync(PDF)) {
  console.error('Bitte Pfad zur PDF angeben: node tools/extract-assets.js "C:/.../report.pdf"');
  process.exit(1);
}

(async () => {
  const b64 = fs.readFileSync(PDF).toString('base64');
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('about:blank');

  const pages = await page.evaluate(async (b64, scale) => {
    const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
    const raw = atob(b64);
    const data = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);
    const doc = await pdfjs.getDocument({
      data,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/',
    }).promise;

    const out = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const p = await doc.getPage(n);
      const vp = p.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      await p.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      out.push(canvas.toDataURL('image/png'));
    }
    return out;
  }, b64, SCALE);

  pages.forEach((durl, i) => {
    const buf = Buffer.from(durl.split(',')[1], 'base64');
    fs.writeFileSync(path.join(OUT, `page${i + 1}.png`), buf);
    console.log(`assets/page${i + 1}.png geschrieben (${(buf.length / 1024).toFixed(0)} KB)`);
  });

  await browser.close();
  console.log('Fertig. Hinweis: Overlay-Positionen in report.html ggf. anpassen, falls sich das Layout von Seite 2 geändert hat.');
})().catch(e => { console.error(e); process.exit(1); });
