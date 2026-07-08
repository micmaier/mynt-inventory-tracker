/**
 * Testet die Resend-Konfiguration ohne einen Download auszulösen.
 * Verwendung:  node tools/test-mail.js
 */
const fs = require('fs');
const path = require('path');

let cfg = {
  resendApiKey: process.env.RESEND_API_KEY || '',
  from: process.env.RESEND_FROM || 'Mynt Impact Generator <onboarding@resend.dev>',
  notifyTo: process.env.NOTIFY_TO || 'info@mynthome.de',
};
try {
  const fileCfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'mail-config.json'), 'utf8'));
  for (const k of ['resendApiKey', 'from', 'notifyTo']) {
    if (fileCfg[k] && !/^HIER-/.test(fileCfg[k])) cfg[k] = fileCfg[k];
  }
} catch (e) { /* nur Umgebungsvariablen */ }

if (!/^re_/.test(cfg.resendApiKey)) {
  console.error('Kein gültiger Resend-API-Key gefunden.');
  console.error('Bitte in mail-config.json bei "resendApiKey" den RESEND_API_KEY des Inventory Trackers eintragen');
  console.error('(Vercel-Dashboard → Inventory-Tracker-Projekt → Settings → Environment Variables).');
  process.exit(1);
}

(async () => {
  console.log(`Sende Testmail über Resend als "${cfg.from}" an ${cfg.notifyTo} ...`);
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${cfg.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: cfg.from,
      to: [cfg.notifyTo],
      subject: 'Testmail: Mynt Impact Generator',
      text: 'Diese Testmail bestätigt: Die Download-Benachrichtigungen des Impact Generators funktionieren.\n\nGesendet am ' + new Date().toLocaleString('de-DE'),
    }),
  });
  const body = await resp.text();
  if (resp.ok) {
    console.log('ERFOLG! Resend hat die Mail angenommen:', body);
    console.log('Jetzt den Server neu starten (npm start), damit auch die Download-Mails gesendet werden.');
  } else {
    console.error(`FEHLGESCHLAGEN (HTTP ${resp.status}):`, body);
    if (resp.status === 401) {
      console.error('→ API-Key ungültig. Bitte den RESEND_API_KEY aus Vercel exakt kopieren.');
    } else if (/domain is not verified|from/i.test(body)) {
      console.error('→ Die Absenderadresse ("from") ist bei Resend nicht verifiziert.');
      console.error('  Denselben Wert wie RESEND_FROM des Inventory Trackers verwenden.');
    }
    process.exit(1);
  }
})().catch(e => { console.error('FEHLGESCHLAGEN:', e.message); process.exit(1); });
