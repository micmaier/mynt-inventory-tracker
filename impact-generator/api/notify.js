/**
 * Vercel Serverless Function: POST /api/notify
 * Nimmt die E-Mail-Adresse + Opt-In des Herunterladenden entgegen und schickt
 * eine Benachrichtigung an info@mynthome.de (über Resend). Der RESEND_API_KEY
 * bleibt serverseitig (Vercel Environment Variable) und gelangt nie zum Client.
 */
const { sendNotification, isValidEmail } = require('../lib/sendNotification');

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return await new Promise(function (resolve) {
    let raw = '';
    req.on('data', function (c) { raw += c; });
    req.on('end', function () {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { resolve({}); }
    });
    req.on('error', function () { resolve({}); });
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const body = await readJsonBody(req);
  const email = String(body.email || '').trim();
  const consent = String(body.consent) === '1' || body.consent === true;

  if (!isValidEmail(email)) {
    res.status(400).json({ ok: false, error: 'invalid-email' });
    return;
  }
  if (!consent) {
    res.status(400).json({ ok: false, error: 'consent-required' });
    return;
  }

  const info = {
    email,
    liter: body.liter,
    coats: body.coats,
    qm: body.qm,
    logo: !!body.logo,
  };

  try {
    const result = await sendNotification(info);
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    // Fehler beim Versand darf den Download nicht blockieren – Client lädt trotzdem.
    console.error('Benachrichtigung fehlgeschlagen:', err.message);
    res.status(200).json({ ok: false, error: 'mail-failed' });
  }
};
