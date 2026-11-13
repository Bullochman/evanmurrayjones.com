/*
 * codegen.js — client-side QR code + 1D barcode generator for EvanMurrayJones.com
 * ----------------------------------------------------------------------------
 * Pure vanilla JS, no build step. Exposes a global `window.CodeGen`.
 *
 * REQUIRED <script> TAGS — the host page MUST include these BEFORE codegen.js
 * (exact cdnjs URLs, verified HTTP 200 on 2026-11-13, both well over two weeks old):
 *
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js"></script>
 *   <script src="qr/codegen.js"></script>
 *
 * Globals those libraries provide:
 *   - qrcodejs  -> window.QRCode   (QR codes; renders a <canvas>, supports color + correctLevel H)
 *   - JsBarcode -> window.JsBarcode (1D barcodes: CODE128, EAN13, UPC, CODE39, ITF, MSI, pharmacode, codabar...)
 * ----------------------------------------------------------------------------
 */
(function () {
  'use strict';

  // --- small helpers ---------------------------------------------------------

  // Clear every child node of an element.
  function clearEl(el) {
    if (!el || !el.nodeType) {
      throw new Error('CodeGen: a valid container element is required.');
    }
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  // Throw if the expected library global isn't present yet.
  function requireGlobal(name, friendly) {
    if (typeof window[name] === 'undefined' || window[name] === null) {
      throw new Error(friendly + ' library not loaded (missing global "' + name + '"). ' +
        'Make sure the cdnjs <script> tag is included before codegen.js.');
    }
    return window[name];
  }

  // --- QR codes --------------------------------------------------------------

  /**
   * Render a QR code for `text` into container `el` (cleared first).
   * opts: { size=512, dark='#000000', light='#ffffff', ecLevel='H' }
   * ecLevel one of 'L','M','Q','H'. Returns the <canvas> element used.
   */
  function renderQR(el, text, opts) {
    opts = opts || {};
    var QR = requireGlobal('QRCode', 'QR');

    if (text === undefined || text === null || String(text).length === 0) {
      throw new Error('CodeGen.renderQR: `text` must be a non-empty string.');
    }

    var size = opts.size || 512;
    var dark = opts.dark || '#000000';
    var light = opts.light || '#ffffff';
    var ecName = (opts.ecLevel || 'H').toUpperCase();

    var levelMap = {
      L: QR.CorrectLevel.L,
      M: QR.CorrectLevel.M,
      Q: QR.CorrectLevel.Q,
      H: QR.CorrectLevel.H
    };
    if (!(ecName in levelMap)) {
      throw new Error('CodeGen.renderQR: ecLevel must be one of L, M, Q, H (got "' + ecName + '").');
    }

    clearEl(el);

    try {
      // qrcodejs renders into `el`, creating a <canvas> (and a fallback <img>).
      new QR(el, {
        text: String(text),
        width: size,
        height: size,
        colorDark: dark,
        colorLight: light,
        correctLevel: levelMap[ecName]
      });
    } catch (err) {
      throw new Error('CodeGen.renderQR: failed to render QR code — ' + (err && err.message ? err.message : err));
    }

    // Grab the canvas qrcodejs just created. Hide the duplicate <img> it also adds
    // so only the canvas is visible in the container.
    var canvas = el.querySelector('canvas');
    if (!canvas) {
      throw new Error('CodeGen.renderQR: no canvas produced (browser may lack canvas support).');
    }
    var img = el.querySelector('img');
    if (img) {
      img.style.display = 'none';
    }
    return canvas;
  }

  // --- 1D barcodes -----------------------------------------------------------

  // Formats offered to a dropdown. `value` is passed straight to JsBarcode.
  var barcodeFormats = [
    { value: 'CODE128', label: 'Code 128 (any text/numbers)' },
    { value: 'EAN13',   label: 'EAN-13 (product, 12-13 digits)' },
    { value: 'EAN8',    label: 'EAN-8 (product, 7-8 digits)' },
    { value: 'UPC',     label: 'UPC-A (product, 11-12 digits)' },
    { value: 'CODE39',  label: 'Code 39 (letters, digits, few symbols)' },
    { value: 'ITF14',   label: 'ITF-14 (shipping, 13-14 digits)' },
    { value: 'MSI',     label: 'MSI (digits only)' },
    { value: 'pharmacode', label: 'Pharmacode (number 3-131070)' },
    { value: 'codabar', label: 'Codabar (digits + - $ : / . +)' }
  ];

  /**
   * Render a 1D barcode for `data` into container `el` (cleared first).
   * opts: { format='CODE128', lineColor='#000000', background='#ffffff', displayValue=true }
   * Throws a clear Error if `data` is invalid for the chosen format.
   * Returns the <canvas> element used.
   */
  function renderBarcode(el, data, opts) {
    opts = opts || {};
    var JB = requireGlobal('JsBarcode', 'Barcode (JsBarcode)');

    if (data === undefined || data === null || String(data).length === 0) {
      throw new Error('CodeGen.renderBarcode: `data` must be a non-empty string.');
    }

    var format = opts.format || 'CODE128';
    var lineColor = opts.lineColor || '#000000';
    var background = opts.background || '#ffffff';
    var displayValue = opts.displayValue !== false; // default true

    clearEl(el);

    // Render into a fresh canvas so toPNG is trivial and high-resolution.
    var canvas = document.createElement('canvas');
    el.appendChild(canvas);

    // JsBarcode calls a `valid` callback with false when the data doesn't fit
    // the chosen symbology (e.g. EAN13 needs 12-13 digits). Capture that so we
    // can throw a clean Error instead of leaving a silently-empty canvas.
    var validationFailed = false;
    try {
      JB(canvas, String(data), {
        format: format,
        lineColor: lineColor,
        background: background,
        displayValue: displayValue,
        margin: 10,
        width: 2,      // bar width multiplier — crisp output
        height: 100,
        valid: function (isValid) {
          if (!isValid) { validationFailed = true; }
        }
      });
    } catch (err) {
      // JsBarcode throws for unknown formats and some invalid inputs.
      clearEl(el);
      throw new Error('CodeGen.renderBarcode: "' + data + '" is not valid for format ' +
        format + ' — ' + (err && err.message ? err.message : err));
    }

    if (validationFailed) {
      clearEl(el);
      throw new Error('CodeGen.renderBarcode: "' + data + '" is not valid data for format ' +
        format + '. Check the format requirements (e.g. EAN-13 needs 12-13 digits, UPC-A needs 11-12 digits).');
    }

    return canvas;
  }

  // --- PNG export ------------------------------------------------------------

  /**
   * Return a PNG dataURL for a QR <canvas> or a barcode <canvas>/<svg> element.
   * - <canvas>: returns canvas.toDataURL('image/png') directly (sync, but wrapped in a Promise).
   * - <svg>: serialize + draw onto an offscreen canvas, then export (async).
   * Always returns a Promise<string> so callers can treat it uniformly.
   */
  function toPNG(elOrCanvas) {
    return new Promise(function (resolve, reject) {
      try {
        if (!elOrCanvas || !elOrCanvas.nodeType) {
          throw new Error('CodeGen.toPNG: expected a canvas or svg element.');
        }

        var tag = (elOrCanvas.tagName || '').toLowerCase();

        if (tag === 'canvas') {
          resolve(elOrCanvas.toDataURL('image/png'));
          return;
        }

        if (tag === 'svg') {
          // Determine pixel dimensions from attributes or layout box.
          var w = parseInt(elOrCanvas.getAttribute('width'), 10) ||
                  Math.ceil(elOrCanvas.getBoundingClientRect().width) || 300;
          var h = parseInt(elOrCanvas.getAttribute('height'), 10) ||
                  Math.ceil(elOrCanvas.getBoundingClientRect().height) || 150;

          var svgString = new XMLSerializer().serializeToString(elOrCanvas);
          // Ensure the XML namespace is present for standalone rendering.
          if (svgString.indexOf('xmlns') === -1) {
            svgString = svgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
          }

          var svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
          var url = URL.createObjectURL(svgBlob);
          var img = new Image();

          img.onload = function () {
            try {
              var canvas = document.createElement('canvas');
              canvas.width = w;
              canvas.height = h;
              var ctx = canvas.getContext('2d');
              // White backdrop so transparent SVGs export cleanly.
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, w, h);
              ctx.drawImage(img, 0, 0, w, h);
              URL.revokeObjectURL(url);
              resolve(canvas.toDataURL('image/png'));
            } catch (e) {
              URL.revokeObjectURL(url);
              reject(new Error('CodeGen.toPNG: failed to rasterize SVG — ' + (e && e.message ? e.message : e)));
            }
          };
          img.onerror = function () {
            URL.revokeObjectURL(url);
            reject(new Error('CodeGen.toPNG: failed to load serialized SVG image.'));
          };
          img.src = url;
          return;
        }

        // Fallback: maybe a container wrapping a canvas/svg.
        var inner = elOrCanvas.querySelector && (elOrCanvas.querySelector('canvas') || elOrCanvas.querySelector('svg'));
        if (inner) {
          resolve(toPNG(inner));
          return;
        }

        throw new Error('CodeGen.toPNG: element is neither a canvas nor an svg (got <' + tag + '>).');
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  // --- download --------------------------------------------------------------

  /**
   * Trigger a browser download of `dataURL` saved as `filename`.
   * Works in modern Chrome/Safari via a synthetic <a download> click.
   */
  function download(dataURL, filename) {
    if (!dataURL || typeof dataURL !== 'string') {
      throw new Error('CodeGen.download: a dataURL string is required.');
    }
    var name = filename || 'code.png';
    try {
      var a = document.createElement('a');
      a.href = dataURL;
      a.download = name;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      // Clean up on the next tick so the click has a chance to register.
      setTimeout(function () {
        if (a.parentNode) { a.parentNode.removeChild(a); }
      }, 0);
    } catch (err) {
      throw new Error('CodeGen.download: failed to start download — ' + (err && err.message ? err.message : err));
    }
  }

  // --- public API ------------------------------------------------------------

  window.CodeGen = {
    renderQR: renderQR,
    renderBarcode: renderBarcode,
    toPNG: toPNG,
    download: download,
    barcodeFormats: barcodeFormats
  };
})();
