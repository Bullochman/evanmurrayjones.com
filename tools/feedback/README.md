# Feedback engine

`collect.py` pulls QR Code Studio feedback (voice or typed → emailed to
evan@evanmurrayjones.com → bullochman0@gmail.com, subject "QR tool feedback from…"),
de-dupes by feedback ID, clusters similar requests, and writes a ranked summary.

- **Output (local, gitignored):** `feedback/SUMMARY.md` (ranked "most-asked first"),
  `feedback/items.jsonl` (raw), `feedback/_state.json` (seen IDs), `feedback/_collector.log`.
- **Runs automatically:** launchd `com.emj.qrfeedback` every 4h + on login.
  Uses the Watson venv python (has Gmail libs).
- **Run manually:** `/Users/evanjones/claudecode/watson-personal-assistant/.venv/bin/python tools/feedback/collect.py`
- **Unschedule:** `launchctl unload ~/Library/LaunchAgents/com.emj.qrfeedback.plist`

Feedback stays private (the `feedback/` folder is gitignored, never published).
