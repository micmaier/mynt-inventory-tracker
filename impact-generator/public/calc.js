/**
 * Zentrale Berechnungslogik – wird vom Dashboard UND von der
 * Report-Vorlage (Vorschau + PDF) verwendet, damit die Zahlen
 * garantiert überall identisch sind.
 */
(function (global) {
  'use strict';

  /**
   * @param {number|string} liter   Liter gestrichener Mynt-Farbe
   * @param {1|2} coats             Anzahl Anstriche
   * @returns {object}              alle berechneten Kennzahlen (ungerundet)
   */
  function computeImpact(liter, coats) {
    const L = Math.max(0, Number(liter) || 0);
    const c = Number(coats) === 2 ? 2 : 1;

    // 1. m²-Berechnung (Standardwert vor manueller Übersteuerung)
    const qmAuto = c === 2 ? (L * 9) / 2 : L * 9;

    // 2. Liter Farbe konventionell
    const literKonventionell = (9 / 7) * L;

    // 3. Einsparung Liter
    const einsparungLiter = literKonventionell - L;

    // 5. + 6. Mikroplastik-Einsparpotenzial (Maximalwert / untere Grenze)
    const mikroplastikMax = literKonventionell * 0.28;
    const mikroplastikMin = literKonventionell * 0.07;

    // 7. Kombinierte Ocean-Bound-Plastik- & Baum-Logik (Rest-System)
    //    Je volle 10 Liter → 1 kg Ocean-Bound Plastik.
    //    Für den Rest: 1 Baum je volle 2,5 Liter.
    const oceanBoundKg = Math.floor(L / 10) * 1;
    const restLiter = L % 10;
    const baeume = Math.floor(restLiter / 2.5);

    // 8. Plastik gesamt (kg)
    const plastikGesamtKg = mikroplastikMax + oceanBoundKg;

    // 9. Äquivalent in Plastiktüten
    const plastiktueten = plastikGesamtKg * 50;

    return {
      liter: L,
      coats: c,
      qmAuto,
      literKonventionell,
      einsparungLiter,
      mikroplastikMax,
      mikroplastikMin,
      oceanBoundKg,
      restLiter,
      baeume,
      plastikGesamtKg,
      plastiktueten,
      // 4. CO2e: fixer Text, ändert sich nicht dynamisch
      co2Text: '45 % weniger CO₂e Emissionen',
    };
  }

  /** Deutsche Zahlenformatierung, z. B. 2300 → "2.300" */
  function fmtDE(n, maxDigits) {
    return Number(n).toLocaleString('de-DE', {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxDigits === undefined ? 0 : maxDigits,
    });
  }

  /**
   * Fertig formatierte Anzeige-Strings für Seite 2 – gemeinsame Quelle für
   * Live-Vorschau (report.html) UND PDF-Erzeugung (pdf-client.js), damit beide
   * garantiert dieselben Werte zeigen.
   * @param qmOverride  manueller m²-Wert (leer = Formelwert)
   */
  function computeDisplay(liter, coats, qmOverride) {
    const r = computeImpact(liter, coats);
    const qm = (qmOverride != null && String(qmOverride).trim() !== '')
      ? String(qmOverride).trim()
      : fmtDE(r.qmAuto);
    return {
      liter: fmtDE(r.liter) + ' L',
      qm: qm + ' m²',
      mikro: fmtDE(Math.round(r.mikroplastikMax)) + ' kg',
      ocean: fmtDE(r.oceanBoundKg) + ' kg',
      line46: fmtDE(Math.round(r.plastikGesamtKg)) + ' kg eingesparter Kunststoff entsprechen:',
      tueten: fmtDE(Math.round(r.plastiktueten)),
      baeume: fmtDE(r.baeume),
      raw: r,
    };
  }

  /**
   * PDF-Spezifikation für Seite 2. Alle Werte in Original-PDF-Punkten
   * (Seite 595.5 × 842.2 pt). baseline/x = alphabetische Original-Baseline
   * aus der PDF extrahiert; cover = deckende Fläche in Kartenfarbe, die die
   * Originalzahl überdeckt. So sitzt jeder dynamische Wert exakt an der
   * Stelle der Vorlage. Der Baum-Wert wird im PDF bewusst NICHT gezeichnet.
   */
  var CARD = { cream: '#fbf6f2', pink: '#f5c9de', blue: '#407ab9', navy: '#2e384b' };
  var PDF_SPEC = {
    pagePt: { w: 595.5, h: 842.2 },
    fields: [
      { key: 'liter',  x: 39.6,  baseline: 200.9, size: 32.5, weight: 500, color: CARD.navy,  bg: CARD.cream, cover: { x: 39.5,  y: 159, w: 148.5, h: 57 } },
      { key: 'qm',     x: 219.6, baseline: 200.9, size: 32.5, weight: 500, color: CARD.navy,  bg: CARD.cream, cover: { x: 219.8, y: 159, w: 161.2, h: 57 } },
      { key: 'mikro',  x: 224.2, baseline: 315.9, size: 32.5, weight: 500, color: CARD.navy,  bg: CARD.pink,  cover: { x: 224,   y: 296, w: 134.5, h: 40 } },
      { key: 'ocean',  x: 408.3, baseline: 315.9, size: 32.5, weight: 500, color: '#ffffff',  bg: CARD.blue,  cover: { x: 408,   y: 296, w: 134.5, h: 40 } },
      { key: 'line46', x: 227.2, baseline: 420.1, size: 10.5, weight: 600, color: CARD.navy,  bg: CARD.cream, cover: { x: 227,   y: 418, w: 248,   h: 14 } },
      { key: 'tueten', x: 226.3, baseline: 463.1, size: 32.5, weight: 500, color: CARD.navy,  bg: CARD.cream, cover: { x: 226,   y: 444, w: 124,   h: 33 } },
    ],
    // Optionaler Kunden-Logo-Slot (Seiten 2–4), unten links im blauen Footer
    logoSlot: { x: 27, y: 748, w: 70, h: 60 },
  };

  /**
   * Rechtlicher Hinweis – gemeinsame Quelle für Dashboard, Vorschau UND PDF,
   * damit der Wortlaut überall identisch ist. Auf Seite 2 (Zertifikat) wird
   * er im freien dunkelblauen Bereich zwischen Kennzahlen und Auszeichnungen
   * platziert (Position in Original-PDF-Punkten).
   */
  var DISCLAIMER = {
    lines: [
      'Dieser selbst erstellte Impact Report dient ausschließlich der eigenen Verwendung und ist kein offizielles Dokument für Werbezwecke.',
      'Für Werbezwecke gilt ausschließlich der direkt von Mynt ausgestellte Impact Report mit Unterschrift und gültiger Zertifikat-Nummer.',
      'Offiziellen Impact Report anfordern: ',
    ],
    email: 'info@mynthome.de',
    // Zeichenposition auf Seite 2 (pt): x, Baseline der 1. Zeile, Zeilenhöhe, Schriftgröße
    pdf: { x: 27, firstBaseline: 570, lineHeight: 10.5, size: 7.5, color: 'rgba(255,255,255,0.65)' },
  };

  global.MyntImpact = { computeImpact, fmtDE, computeDisplay, PDF_SPEC, DISCLAIMER };
})(typeof window !== 'undefined' ? window : globalThis);
