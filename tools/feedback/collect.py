#!/usr/bin/env python3
"""
QR Code Studio — automatic feedback collector & improvement ranker.

Users give feedback inside the tool (voice or typed). That feedback emails
evan@evanmurrayjones.com -> forwards to bullochman0@gmail.com with the subject
"QR tool feedback from <name>". This script pulls those emails, de-duplicates
them, clusters similar requests, and writes a ranked summary into feedback/
so improvements surface themselves ("X% of people asked for this").

The feedback/ folder is LOCAL ONLY (gitignored) — it's Evan's private triage,
not published to the site. Runs unattended on a schedule (launchd).
"""
import json, re, sys, pathlib, datetime, difflib

WATSON = pathlib.Path.home() / "claudecode" / "watson-personal-assistant"
sys.path.insert(0, str(WATSON))
from watson.services import gmail_transport as gm  # noqa: E402

ACCOUNT = "bullochman0@gmail.com"
REPO = pathlib.Path(__file__).resolve().parents[2]
OUT = REPO / "feedback"
OUT.mkdir(exist_ok=True)
ITEMS = OUT / "items.jsonl"
STATE = OUT / "_state.json"
SUMMARY = OUT / "SUMMARY.md"

CLUSTER_THRESHOLD = 0.6  # text-similarity ratio to group two feedbacks together


def load_seen():
    try:
        return set(json.loads(STATE.read_text()).get("seen", []))
    except Exception:
        return set()


def save_seen(seen):
    STATE.write_text(json.dumps({"seen": sorted(seen)}, indent=2))


def _grab(body, label, nxt):
    m = re.search(re.escape(label) + r"\s*(.*?)(?=" + nxt + r"|$)", body, re.S | re.I)
    return (m.group(1).strip() if m else "")


def parse_body(body):
    transcript = _grab(body, "Feedback:", r"Category:")
    category = (_grab(body, "Category:", r"Page:") or "other").lower().split()[0] if _grab(body, "Category:", r"Page:") else "other"
    page = _grab(body, "Page:", r"When:")
    when = _grab(body, "When:", r"ID:")
    fid = _grab(body, "ID:", r"$")
    return transcript, category, page, when, fid


def collect():
    try:
        results = gm.search(ACCOUNT, query='subject:"QR tool feedback"', limit=100)
    except Exception as e:
        print(f"[feedback] gmail search failed: {e}", file=sys.stderr)
        return []
    seen = load_seen()
    new_items = []
    for r in results:
        try:
            full = gm.read(ACCOUNT, r["id"])
        except Exception:
            continue
        body = full.get("body", "") or ""
        transcript, category, page, when, fid = parse_body(body)
        key = fid or r["id"]
        if key in seen:
            continue
        seen.add(key)
        subj = r.get("subject", "")
        mm = re.search(r"from\s+(.+)$", subj, re.I)
        who = mm.group(1).strip() if mm else ""
        item = {
            "key": key,
            "transcript": transcript or body[:500],
            "category": category,
            "page": page,
            "when": when or r.get("date_iso", ""),
            "user": who,
            "email_id": r["id"],
            "collected": datetime.datetime.now().isoformat(timespec="seconds"),
        }
        new_items.append(item)
    if new_items:
        with ITEMS.open("a") as f:
            for it in new_items:
                f.write(json.dumps(it) + "\n")
    save_seen(seen)
    return new_items


def load_all():
    items = []
    if ITEMS.exists():
        for line in ITEMS.read_text().splitlines():
            line = line.strip()
            if line:
                try:
                    items.append(json.loads(line))
                except Exception:
                    pass
    return items


def _norm(t):
    return re.sub(r"[^a-z0-9 ]", " ", (t or "").lower()).strip()


def cluster(items):
    clusters = []
    for it in items:
        n = _norm(it["transcript"])
        placed = False
        for c in clusters:
            if difflib.SequenceMatcher(None, n, _norm(c["rep"])).ratio() >= CLUSTER_THRESHOLD:
                c["items"].append(it)
                placed = True
                break
        if not placed:
            clusters.append({"items": [it], "rep": it["transcript"]})
    clusters.sort(key=lambda c: len(c["items"]), reverse=True)
    return clusters


def write_summary(items, clusters, new_count):
    total = len(items)
    by_cat = {}
    for it in items:
        by_cat[it["category"]] = by_cat.get(it["category"], 0) + 1
    L = ["# QR Code Studio — Feedback Summary", ""]
    L.append(f"_Updated {datetime.datetime.now():%Y-%m-%d %H:%M} · {total} total · {new_count} new this run_")
    L.append("")
    if total == 0:
        L.append("No feedback yet. When someone uses the mic (or types) in the tool and sends it, "
                 "it lands here automatically — grouped by theme and ranked by how many people asked.")
    else:
        L.append("## By type")
        for k, v in sorted(by_cat.items(), key=lambda x: -x[1]):
            L.append(f"- **{k}** — {v}")
        L.append("")
        L.append("## Top requests — most-asked first")
        L.append("")
        for i, c in enumerate(clusters, 1):
            cnt = len(c["items"])
            pct = round(100 * cnt / total)
            who_word = "person" if cnt == 1 else "people"
            L.append(f"### {i}. {c['rep'][:120]}")
            L.append(f"**{cnt} {who_word} ({pct}%)**")
            for it in c["items"][:5]:
                who = it.get("user") or "someone"
                when = (it.get("when") or "")[:10]
                L.append(f"- _{who}, {when}_ · [{it['category']}] {it['transcript'][:220]}")
            L.append("")
    SUMMARY.write_text("\n".join(L))


def main():
    new = collect()
    items = load_all()
    clusters = cluster(items)
    write_summary(items, clusters, len(new))
    print(f"[feedback] {len(new)} new, {len(items)} total -> {SUMMARY}")


if __name__ == "__main__":
    main()
