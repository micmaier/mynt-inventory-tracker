/**
 * Lokaler Dev-Server für den Mynt Impact Generator.
 *
 * In Produktion läuft die App als statische Seite auf Vercel; die
 * E-Mail-Benachrichtigung übernimmt dort die Serverless-Funktion
 * api/notify.js. Dieser Server dient nur dem lokalen Testen (npm start)
 * und dem Team-Tunnel: er liefert die statischen Dateien und stellt
 * denselben Endpunkt POST /api/notify bereit.
 *
 * Die PDF-Erzeugung passiert vollständig im Browser (public/pdf-client.js) –
 * hier wird kein Puppeteer/Chromium mehr benötigt.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const { sendNotification, isValidEmail } = require('./lib/sendNotification');

// Lokal: mail-config.json in Umgebungsvariablen übernehmen (Vercel nutzt echte Env-Vars)
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'mail-config.json'), 'utf8'));
  if (cfg.resendApiKey && !/^HIER-/.test(cfg.resendApiKey)) process.env.RESEND_API_KEY = cfg.resendApiKey;
  if (cfg.from && !/^HIER-/.test(cfg.from)) process.env.RESEND_FROM = cfg.from;
  if (cfg.notifyTo) process.env.NOTIFY_TO = cfg.notifyTo;
} catch (e) { /* keine mail-config.json – Env-Vars/Defaults gelten */ }

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/notify', async (req, res) => {
  const email = String(req.body.email || '').trim();
  const consent = String(req.body.consent) === '1' || req.body.consent === true;

  if (!isValidEmail(email)) return res.status(400).json({ ok: false, error: 'invalid-email' });
  if (!consent) return res.status(400).json({ ok: false, error: 'consent-required' });

  const info = { email, liter: req.body.liter, coats: req.body.coats, qm: req.body.qm, logo: !!req.body.logo };

  // Protokoll (lokal) – auf Vercel nicht persistent, daher nur hier
  const line = `${new Date().toISOString()}  ${info.email}  opt-in=ja liter=${info.liter} coats=${info.coats} qm=${info.qm || '(auto)'} logo=${info.logo ? 'ja' : 'nein'}\n`;
  fs.appendFile(path.join(__dirname, 'downloads.log'), line, () => {});

  try {
    const result = await sendNotification(info);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('Benachrichtigung fehlgeschlagen:', err.message);
    res.status(200).json({ ok: false, error: 'mail-failed' });
  }
});

app.listen(PORT, () => {
  const active = /^re_/.test(process.env.RESEND_API_KEY || '');
  console.log('');
  console.log('  Mynt Impact Generator (lokaler Dev-Server) läuft:');
  console.log(`  →  http://localhost:${PORT}`);
  console.log(active
    ? `  E-Mail-Benachrichtigung aktiv (Resend) → ${process.env.NOTIFY_TO || 'info@mynthome.de'}`
    : '  Hinweis: kein Resend-API-Key – Downloads werden nur in downloads.log protokolliert.');
  console.log('');
});
