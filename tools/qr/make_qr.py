#!/usr/bin/env python3
"""
Self-owned QR codes for evanmurrayjones.com.

The idea: the QR code encodes a short link on YOUR OWN domain
(https://evanmurrayjones.com/go/<slug>) that redirects to wherever you want.
Because you host the redirect, the QR code:
  * never expires (no third-party subscription to lapse),
  * costs nothing (GitHub Pages is free),
  * stays reprintable forever (the printed code never changes),
  * can be re-pointed anytime (edit the redirect, re-push — same QR still works).

Usage:
  tools/qr/.venv/bin/python tools/qr/make_qr.py <slug> <destination-url> [--label "..."]
     [--color "#8a3b2e"] [--logo path/to/logo.png]

Example:
  tools/qr/.venv/bin/python tools/qr/make_qr.py evan https://evanmurrayjones.com --label "My site"

Then `git add go && git commit && git push`. The QR (go/<slug>/qr.png) is ready to print.
To change where it points later: re-run with the same slug and a new URL, re-push.
"""
import argparse, html, json, re, sys
from datetime import date
from pathlib import Path

import qrcode
from qrcode.constants import ERROR_CORRECT_H
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers.pil import RoundedModuleDrawer

REPO = Path(__file__).resolve().parents[2]
BASE = "https://evanmurrayjones.com"
GO = REPO / "go"

REDIRECT_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Redirecting…</title>
<link rel="canonical" href="{dest_attr}" />
<meta http-equiv="refresh" content="0; url={dest_attr}" />
<meta name="robots" content="noindex" />
<script>location.replace({dest_js});</script>
<style>
  :root {{ color-scheme: light dark; }}
  body {{ margin:0; min-height:100vh; display:grid; place-items:center;
         font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
         background:#faf7f4; color:#2a2422; }}
  @media (prefers-color-scheme: dark) {{ body {{ background:#17130f; color:#efe7df; }} }}
  .box {{ text-align:center; padding:2rem; }}
  a {{ color:#8a3b2e; }}
</style>
</head>
<body>
  <div class="box">
    <p>Redirecting…</p>
    <p>If nothing happens, <a href="{dest_attr}">continue here &rarr;</a></p>
  </div>
</body>
</html>
"""


def make_redirect_page(slug: str, dest: str) -> Path:
    d = GO / slug
    d.mkdir(parents=True, exist_ok=True)
    page = REDIRECT_TEMPLATE.format(dest_attr=html.escape(dest, quote=True),
                                    dest_js=json.dumps(dest))
    (d / "index.html").write_text(page, encoding="utf-8")
    return d / "index.html"


def make_qr(slug: str, color: str, logo: str | None) -> Path:
    short_url = f"{BASE}/go/{slug}"
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, box_size=16, border=4)
    qr.add_data(short_url)
    qr.make(fit=True)
    if logo:
        img = qr.make_image(image_factory=StyledPilImage,
                            module_drawer=RoundedModuleDrawer(),
                            embeded_image_path=logo)
    else:
        img = qr.make_image(fill_color=color, back_color="white")
    out = GO / slug / "qr.png"
    img.save(out)
    return out


def update_manifest(slug: str, dest: str, label: str):
    GO.mkdir(exist_ok=True)
    mpath = GO / "_manifest.json"
    data = json.loads(mpath.read_text()) if mpath.exists() else {}
    data[slug] = {"destination": dest, "label": label,
                  "short_url": f"{BASE}/go/{slug}", "updated": date.today().isoformat()}
    mpath.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description="Make a self-owned, never-expiring QR code.")
    ap.add_argument("slug", help="url-safe id, e.g. 'evan' -> evanmurrayjones.com/go/evan")
    ap.add_argument("destination", help="where the QR should send people (full URL)")
    ap.add_argument("--label", default="", help="human label for your records")
    ap.add_argument("--color", default="#000000", help="QR fill color (default black = most scannable)")
    ap.add_argument("--logo", default=None, help="path to a center logo PNG (optional)")
    a = ap.parse_args()

    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", a.slug):
        sys.exit("slug must be lowercase letters, numbers, and dashes only")
    if not a.destination.startswith(("http://", "https://")):
        sys.exit("destination must start with http:// or https://")

    make_redirect_page(a.slug, a.destination)
    qr = make_qr(a.slug, a.color, a.logo)
    update_manifest(a.slug, a.destination, a.label or a.slug)

    print(f"  slug:        {a.slug}")
    print(f"  QR encodes:  {BASE}/go/{a.slug}   (this never changes)")
    print(f"  redirects to {a.destination}   (change anytime, re-push)")
    print(f"  QR image:    {qr}")
    print(f"  page:        {GO / a.slug / 'index.html'}")
    print("\nNext: git add go && git commit -m 'qr: " + a.slug + "' && git push")


if __name__ == "__main__":
    main()
