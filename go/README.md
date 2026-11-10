# Self-owned QR codes (`/go/`)

These are QR codes you **own forever**. Here's why they never expire:

A QR code is just a picture of a web address. There are two kinds:

- **Static** — the real address is baked into the pixels. Can't expire, but can't be changed either.
- **"Dynamic"** — the pixels point at a *short link* that forwards to the real address. You can
  change the destination anytime… but normally a company owns that short link, and if you stop
  paying them, they shut it off and the code dies.

**This folder makes you the company.** Each QR here encodes a link on *your own* domain
(`https://evanmurrayjones.com/go/<slug>`) that forwards to wherever you want. So you get the
best of both: changeable destination **and** nothing to expire, because nobody can turn off a
redirect you host yourself. Hosting is free (GitHub Pages), so it stays alive as long as the
site does — forever, by design.

## Make a new one

```bash
tools/qr/.venv/bin/python tools/qr/make_qr.py <slug> <destination-url> --label "what it's for"
# example:
tools/qr/.venv/bin/python tools/qr/make_qr.py card https://evanmurrayjones.com --label "Business card"
```

Then:

```bash
git add go && git commit -m "qr: card" && git push
```

The printable code is `go/<slug>/qr.png`. Print it, stick it anywhere — it works forever.

## Change where an existing code points

Re-run the same command with the **same slug** and a new URL, then push. The printed QR code
is untouched and keeps working — it just lands somewhere new. (This is the "dynamic" magic,
and it's free because you own the redirect.)

## Creative / branded codes

QR codes have error-correction built in, so you can style them and they still scan:

```bash
# colored:
tools/qr/.venv/bin/python tools/qr/make_qr.py card https://evanmurrayjones.com --color "#8a3b2e"
# with a logo in the middle (rounded dots, high error-correction):
tools/qr/.venv/bin/python tools/qr/make_qr.py card https://evanmurrayjones.com --logo assets/spectralux/icon.png
```

Keep good contrast (dark code on light background) and test-scan before printing a batch.

`_manifest.json` keeps a record of every code and where it currently points.
