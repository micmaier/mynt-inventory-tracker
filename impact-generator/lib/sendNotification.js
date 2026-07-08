/**
 * Gemeinsame Benachrichtigungs-Logik – genutzt von der Vercel-Funktion
 * (api/notify.js) UND vom lokalen Dev-Server (server.js).
 *
 * Versand über Resend (derselbe Dienst wie beim Inventory Tracker), damit
 * NICHTS vom Postfach info@mynthome.de aus versendet werden muss. Empfänger
 * ist info@mynthome.de.
 *
 * Konfiguration über Umgebungsvariablen:
 *   RESEND_API_KEY  (Pflicht für echten Versand)
 *   RESEND_FROM     (verifizierter Absender, z. B. inventory.mynthome.de)
 *   NOTIFY_TO       (Standard: info@mynthome.de)
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isValidEmail(email) {
  return EMAIL_RE.test(String(email || '').trim());
}

async function sendNotification(info) {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.RESEND_FROM || 'Mynt Impact Generator <onboarding@resend.dev>';
  const to = process.env.NOTIFY_TO || 'info@mynthome.de';

  if (!/^re_/.test(apiKey)) {
    // Kein Key hinterlegt → nur protokollieren, kein Versand (kein Fehler)
    return { sent: false, skipped: 'no-api-key' };
  }

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Impact Report heruntergeladen: ${info.email}`,
      text:
        'Jemand hat den Mynt Impact Report heruntergeladen.\n\n' +
        `E-Mail:    ${info.email}\n` +
        `Opt-In:    ja (Einwilligung zur Übermittlung und Kontaktaufnahme erteilt)\n` +
        `Liter:     ${info.liter}\n` +
        `Anstriche: ${info.coats}\n` +
        `Fläche:    ${info.qm || 'automatisch berechnet'}\n` +
        `Logo:      ${info.logo ? 'ja' : 'nein'}\n` +
        `Zeitpunkt: ${new Date().toLocaleString('de-DE')}\n`,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Resend antwortete mit HTTP ${resp.status}: ${await resp.text()}`);
  }
  return { sent: true };
}

module.exports = { sendNotification, isValidEmail };
