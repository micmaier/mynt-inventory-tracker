/**
 * Client-seitige PDF-Erzeugung (ersetzt den früheren Puppeteer-Server).
 *
 * Prinzip identisch zur Vorschau: die 4 Original-Seiten (assets/page1..4.png)
 * werden als Vollseiten-Bilder in ein A4-PDF gelegt; auf Seite 2 werden die
 * dynamischen Werte exakt an den Original-Positionen (calc.js → PDF_SPEC) auf
 * ein Canvas gezeichnet, ein optionales Kunden-Logo kommt in den Footer-Slot
 * (Seiten 2–4). Der Baum-Wert wird bewusst NICHT gezeichnet und ist damit –
 * wie gefordert – im PDF nicht enthalten.
 */
(function (global) {
  'use strict';

  var imgCache = {};
  function loadImage(src) {
    if (imgCache[src]) return imgCache[src];
    imgCache[src] = new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Bild konnte nicht geladen werden: ' + src)); };
      img.src = src;
    });
    return imgCache[src];
  }

  function drawContain(ctx, img, slotPx) {
    var scale = Math.min(slotPx.w / img.naturalWidth, slotPx.h / img.naturalHeight);
    var w = img.naturalWidth * scale;
    var h = img.naturalHeight * scale;
    ctx.drawImage(img, slotPx.x + (slotPx.w - w) / 2, slotPx.y + (slotPx.h - h) / 2, w, h);
  }

  /**
   * @param {object} opts { liter, coats, qm, logoDataUrl, filename }
   * @returns {Promise<void>}  löst nach dem Auslösen des Downloads auf
   */
  async function generate(opts) {
    var MI = global.MyntImpact;
    var spec = MI.PDF_SPEC;
    var disp = MI.computeDisplay(opts.liter, opts.coats, opts.qm);

    // Schriften müssen vor dem Zeichnen auf Canvas geladen sein
    if (document.fonts && document.fonts.load) {
      await Promise.all([
        document.fonts.load('500 98px Inter'),
        document.fonts.load('600 32px Inter'),
      ]).catch(function () {});
      await document.fonts.ready;
    }

    var pageImgs = await Promise.all([1, 2, 3, 4].map(function (n) {
      return loadImage('assets/page' + n + '.png');
    }));
    var logoImg = opts.logoDataUrl ? await loadImage(opts.logoDataUrl) : null;

    var jsPDFctor = (global.jspdf && global.jspdf.jsPDF) || global.jsPDF;
    var doc = new jsPDFctor({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    var PW = doc.internal.pageSize.getWidth();
    var PH = doc.internal.pageSize.getHeight();

    for (var i = 0; i < pageImgs.length; i++) {
      var pageNo = i + 1;
      var img = pageImgs[i];
      var canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      var fx = img.naturalWidth / spec.pagePt.w;
      var fy = img.naturalHeight / spec.pagePt.h;

      var emailLinkRect = null;

      if (pageNo === 2) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';
        spec.fields.forEach(function (f) {
          // 1) Originalzahl mit Kartenfarbe überdecken
          ctx.fillStyle = f.bg;
          ctx.fillRect(f.cover.x * fx, f.cover.y * fy, f.cover.w * fx, f.cover.h * fy);
          // 2) dynamischen Wert an der Original-Baseline zeichnen
          ctx.fillStyle = f.color;
          ctx.font = f.weight + ' ' + (f.size * fy) + 'px Inter, sans-serif';
          ctx.fillText(disp[f.key], f.x * fx, f.baseline * fy);
        });

        // Rechtlicher Hinweis (Wortlaut aus calc.js) – letzte Zeile endet mit
        // der E-Mail-Adresse, die unterstrichen und (unten) verlinkt wird.
        var D = MI.DISCLAIMER;
        ctx.fillStyle = D.pdf.color;
        ctx.font = '400 ' + (D.pdf.size * fy) + 'px Inter, sans-serif';
        D.lines.forEach(function (line, li) {
          var baseY = (D.pdf.firstBaseline + li * D.pdf.lineHeight) * fy;
          ctx.fillText(line, D.pdf.x * fx, baseY);
          if (li === D.lines.length - 1) {
            var prefixW = ctx.measureText(line).width;
            var emailW = ctx.measureText(D.email).width;
            ctx.fillText(D.email, D.pdf.x * fx + prefixW, baseY);
            // Unterstreichung als Link-Affordanz
            ctx.fillRect(D.pdf.x * fx + prefixW, baseY + 1.5 * fy, emailW, 0.6 * fy);
            // Rechteck (in pt) für die spätere PDF-Link-Annotation merken
            emailLinkRect = {
              x: D.pdf.x + prefixW / fx,
              y: D.pdf.firstBaseline + li * D.pdf.lineHeight - D.pdf.size,
              w: emailW / fx,
              h: D.pdf.size + 3,
            };
          }
        });
      }

      if (logoImg && (pageNo === 2 || pageNo === 3 || pageNo === 4)) {
        var s = spec.logoSlot;
        drawContain(ctx, logoImg, { x: s.x * fx, y: s.y * fy, w: s.w * fx, h: s.h * fy });
      }

      if (i > 0) doc.addPage();
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, PW, PH, undefined, 'FAST');

      // Klickbarer mailto-Link auf der E-Mail-Adresse des Hinweises (Seite 2).
      // Seiten-pt → A4-pt umrechnen (595.5 → 595.28).
      if (emailLinkRect) {
        var lx = PW / spec.pagePt.w;
        var ly = PH / spec.pagePt.h;
        doc.link(emailLinkRect.x * lx, emailLinkRect.y * ly, emailLinkRect.w * lx, emailLinkRect.h * ly,
          { url: 'mailto:' + MI.DISCLAIMER.email });
      }
    }

    var literSafe = String(opts.liter).replace(/[^\d]/g, '') || 'X';
    doc.save(opts.filename || ('Mynt-Impact-Report-' + literSafe + 'L.pdf'));
  }

  global.MyntPdf = { generate: generate };
})(window);
