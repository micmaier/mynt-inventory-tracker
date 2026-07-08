# Deployment: Impact Generator unter impact.mynthome.de

Der Impact Generator ist eine **statische Web-App + eine Mail-Funktion** und wird
auf **Vercel** deployt – genau wie der Inventory Tracker. Danach läuft er unter
`impact.mynthome.de`, und in PayloadCMS wird nur noch ein Button/Link darauf gesetzt.

Es gibt zwei Rollen:

- **Teil A – Entwickler/Vercel-Admin** (einmalig, ~15 Min): deployen + Subdomain.
- **Teil B – Redaktion (PayloadCMS)**: Link/Button auf der Mynt-Seite setzen.

---

## Teil A · Vercel-Deployment (Person mit Vercel- + DNS-Zugriff)

### 1. Neues Vercel-Projekt anlegen

Der Code liegt im Unterordner `impact-generator/` des Repos `mynt-inventory-tracker`.

- Vercel-Dashboard → **Add New… → Project** → dasselbe Git-Repo importieren.
- **Wichtig – Root Directory:** auf `impact-generator` setzen (Edit → impact-generator).
- Framework Preset: **Other** (kein Framework; Vercel erkennt `public/` + `api/` automatisch).
- Build Command: leer lassen. Output Directory: leer lassen (Standard `public`).

> Alternativ per CLI im Ordner `impact-generator/`: `npx vercel` (Deploy-Vorschau)
> bzw. `npx vercel --prod` (Produktion).

### 2. Environment Variables setzen

Projekt → **Settings → Environment Variables** (Environment: Production + Preview):

| Name             | Wert                                                        |
|------------------|-------------------------------------------------------------|
| `RESEND_API_KEY` | derselbe Key wie beim Inventory Tracker (`re_…`)            |
| `RESEND_FROM`    | `Mynt Impact Generator <noreply@inventory.mynthome.de>`     |
| `NOTIFY_TO`      | `info@mynthome.de`                                           |

`RESEND_FROM` muss eine bei Resend **verifizierte** Domain sein – `inventory.mynthome.de`
ist bereits verifiziert. (Eine eigene Subdomain `impact.mynthome.de` als Absender ginge
auch, müsste aber erst in Resend per DNS verifiziert werden – nicht nötig.)

Nach dem Setzen der Variablen einmal **Redeploy** auslösen.

### 3. Subdomain impact.mynthome.de verbinden

- Projekt → **Settings → Domains** → `impact.mynthome.de` hinzufügen.
- Vercel zeigt den nötigen DNS-Eintrag an – i. d. R. ein **CNAME**:
  `impact` → `cname.vercel-dns.com`.
- Diesen CNAME beim DNS-Anbieter von mynthome.de anlegen. Nach der DNS-Propagierung
  (wenige Minuten bis ~1 h) ist die App live.

### 4. Funktionstest

Auf `https://impact.mynthome.de` öffnen, einen Report mit Test-E-Mail + Opt-In
herunterladen → PDF kommt, und an info@mynthome.de trifft eine Benachrichtigung ein.

---

## Teil B · Einbindung in die Mynt-Seite (PayloadCMS)

Da der Generator unter seiner eigenen Subdomain läuft, ist die Einbindung simpel und
erfordert **keinen** Code:

**Empfohlen – Button/Link:** In PayloadCMS eine Seite (z. B. `/impact-report`) oder einen
Menüpunkt anlegen mit einem Button „Impact Report erstellen", der auf
`https://impact.mynthome.de` verweist (am besten in neuem Tab / `target="_blank"`).

**Alternative – Einbettung per iframe:** Falls der Generator „innerhalb" der Seite
erscheinen soll, in einem Rich-Text-/HTML-Block:

```html
<iframe src="https://impact.mynthome.de"
        style="width:100%; height:1400px; border:0;"
        title="Mynt Impact Generator"></iframe>
```

> Hinweis: Ein Button/Link ist robuster als ein iframe – der PDF-Download und die
> mobile Darstellung funktionieren dort zuverlässiger. iframe nur nehmen, wenn die
> Einbettung optisch gewünscht ist.

### Variante mynthome.de/impact-generator (statt Subdomain)

Ein echter Unterpfad auf der Hauptdomain erfordert entweder eine Rewrite-/Proxy-Regel
auf der Hauptseite (Sache des Entwicklers) oder eben die iframe-Einbettung oben auf
einer CMS-Seite mit diesem Pfad. Die **Subdomain ist der einfachste Weg** und wird
empfohlen.

---

## Warum kein eigener Server nötig ist

Die PDF-Erzeugung läuft vollständig im Browser des Besuchers (jsPDF). Server-seitig
gibt es nur die Funktion `api/notify.js` für die E-Mail – die läuft als Vercel
Serverless Function. Kein Puppeteer/Chromium, kein Docker, keine laufende Instanz,
die gepflegt werden muss. Der `RESEND_API_KEY` bleibt in den Vercel-Env-Vars und
gelangt nie in den Browser.
