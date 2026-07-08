# Mynt Impact Generator

Generator für den mehrseitigen Mynt Impact Report (deutsch, A4 Hochformat).
Web-Dashboard mit Live-Vorschau aller 4 Seiten + PDF-Download in Druckqualität —
**optisch 1:1 identisch mit der Original-PDF**.

Die App ist **statisch** (läuft komplett im Browser): die PDF-Erzeugung passiert
client-seitig (jsPDF), server-seitig gibt es nur **eine** kleine Funktion für die
E-Mail-Benachrichtigung. Damit deploybar auf **Vercel** (wie der Inventory Tracker) –
siehe [DEPLOY.md](DEPLOY.md).

## Lokal starten (Entwicklung / Team-Test)

Voraussetzung: Node.js ≥ 18

```bash
cd impact-generator
npm install     # nur Express (für den lokalen Dev-Server) – kein Chromium mehr
npm start
```

Dann im Browser öffnen: **http://localhost:3000**

Der lokale Server (`server.js`) liefert die statischen Dateien und stellt denselben
Endpunkt `POST /api/notify` bereit wie die Vercel-Funktion. Für den echten Mailversand
muss `mail-config.json` mit dem Resend-Key gefüllt sein (siehe unten); ohne Key läuft
alles weiter, Downloads werden nur in `downloads.log` protokolliert.

## Bedienung

1. **Liter gestrichener Farbe** eingeben (Standard: 100).
2. **Anzahl Anstriche** wählen (1 oder 2).
3. **Fläche in m²** wird automatisch berechnet (1 Anstrich: Liter × 9; 2 Anstriche: Liter × 9 ÷ 2)
   und kann manuell überschrieben werden („auf Formelwert zurücksetzen" macht das rückgängig).
4. **Eigenes Logo** (optional, PNG/JPG, max. 8 MB): erscheint unten links im blauen
   Partner-Footer auf den Seiten 2–4 – fester Slot (70 × 60 pt), proportional eingepasst,
   ragt nie über den Slot hinaus. Bleibt rein im Browser (kein Upload).
5. Die Live-Vorschau rechts zeigt das komplette Dokument (alle 4 Seiten).
6. **PDF herunterladen** erfordert eine gültige E-Mail-Adresse **und** das Opt-In-Häkchen;
   das PDF wird vollständig im Browser erzeugt (A4 hoch, 4 Seiten).

## Download-Benachrichtigung (E-Mail-Gate + Opt-In)

- Der Download erfordert eine gültige E-Mail-Adresse **und** die aktivierte
  Opt-In-Checkbox (Einwilligung zur Übermittlung an info@mynthome.de).
- Beim Download ruft der Browser `POST /api/notify` auf; die Funktion schickt eine
  Benachrichtigung an info@mynthome.de. Versand über **Resend** (derselbe Dienst wie
  beim Inventory Tracker) – es wird nichts vom Postfach info@mynthome.de aus versendet.
- Konfiguration:
  - **Vercel (Produktion):** Environment Variables `RESEND_API_KEY`, `RESEND_FROM`,
    `NOTIFY_TO` setzen (siehe [DEPLOY.md](DEPLOY.md)).
  - **Lokal:** `mail-config.json` (aus `mail-config.example.json`) mit denselben Werten.
    Test: `npm run test:mail`.
- Ein Mailfehler blockiert den Download nie.

## Wie die 1:1-Treue funktioniert

- Die 4 Originalseiten sind hochauflösende Renderings der Original-PDF
  (`public/assets/page1..4.png`). Seiten 1, 3, 4 sind damit pixelidentisch.
- Auf **Seite 2** werden die 6 dynamischen Werte exakt an den Original-Positionen
  gezeichnet – dieselbe Spezifikation (`PDF_SPEC` in `calc.js`) für Live-Vorschau
  (DOM-Overlays) und PDF (Canvas). Kartenfarben: Creme `#fbf6f2`, Rosa `#f5c9de`,
  Blau `#407ab9`, Navy `#2e384b`; Schrift Inter.
- Die Metrik **„[X] Bäume gepflanzt"** erscheint nur in der Web-Vorschau und wird im
  PDF bewusst nicht gezeichnet.
- Hinweis: Im PDF sind die Seiten Bilder (Text nicht selektierbar) – optisch 1:1.

## Neue Vorlagen-Version einspielen

```bash
npm install --no-save puppeteer   # nur für dieses Dev-Werkzeug (keine Laufzeit-Abhängigkeit)
node tools/extract-assets.js "C:/Pfad/zur/neuen Impact Report.pdf"
```

Erneuert `public/assets/page1..4.png`. Bei geändertem Seite-2-Layout die Positionen
in `calc.js` (`PDF_SPEC`) und die Overlay-Boxen in `public/report.html` anpassen.

## Struktur

```
impact-generator/
├── api/
│   └── notify.js             Vercel-Funktion: E-Mail-Benachrichtigung (Resend)
├── lib/
│   └── sendNotification.js   gemeinsame Mail-Logik (Funktion + lokaler Server)
├── public/                   → wird von Vercel als statische Seite ausgeliefert
│   ├── index.html            Dashboard: Eingaben, Logo, E-Mail/Opt-In, Live-Vorschau
│   ├── report.html           4-seitige Vorlage (nur Live-Vorschau)
│   ├── calc.js               Berechnungslogik + PDF-Spezifikation (PDF_SPEC)
│   ├── pdf-client.js         Client-seitige PDF-Erzeugung (jsPDF)
│   ├── vendor/jspdf.umd.min.js
│   └── assets/               page1..4.png – Original-Renderings
├── tools/
│   ├── extract-assets.js     Original-PDF → public/assets/
│   └── test-mail.js          Testmail über Resend
├── server.js                 lokaler Dev-Server (nur lokal; Vercel nutzt api/)
├── vercel.json
└── package.json
```

## Deployment

Siehe **[DEPLOY.md](DEPLOY.md)** – Schritt-für-Schritt für Vercel + Subdomain
`impact.mynthome.de` und Einbindung in die PayloadCMS-Seite.
