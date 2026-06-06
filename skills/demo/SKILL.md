---
name: demo
description: Control script for the omni-presence demo. codex/claude code chains the call, Sendblue API, Gemini video understanding, tapback approval, and Notion save — all from natural language.
---

# demo — omni-presence control runbook

You (codex/claude code) are the control agent. Fred triggers this with `/demo` or a
natural-language request. Run the steps below in order. Keep talking to Fred in plain
language — never ask him for JSON, IDs, or command flags.

All commands print a JSON object with `ok` and a `nextAction`/`hint`. Parse stdout; the
event log lands in `logs/demo-events.jsonl`.

## Preflight (silent, before you start)

```bash
node bin/call-fred.ts init               # start the background voice daemon (port in logs/daemon.json)
node bin/sendblue-api.ts preflight
node bin/save-technical-reading.ts preflight
```

**Tunnel — do this before placing the call.** Twilio reaches the daemon's media stream and status
callbacks through the public tunnel in `TWILIO_WEBHOOK_BASE_URL` (a reserved ngrok domain). If the
ngrok process isn't running, the domain answers nothing: the REST call still rings Fred's phone, but
the moment he picks up, Twilio's `<Connect><Stream>` can't open the audio bridge, so the call drops
immediately. Always confirm the tunnel is live, and restart it on the SAME reserved domain if it's down:

```bash
BASE=$(grep -E '^TWILIO_WEBHOOK_BASE_URL=' .env | cut -d= -f2-)   # e.g. https://<sub>.ngrok-free.dev
# 1) Is the tunnel reachable from the outside (Twilio's view)?
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/health"          # want 200
# 2) If not 200 (or `pgrep -fl ngrok` shows nothing), bring it back up on the SAME domain:
ngrok http 8080 \
  --domain="$(printf '%s' "$BASE" | sed -E 's#^https?://##; s#/.*$##')" \
  --log=stdout > logs/ngrok.log 2>&1 &
# 3) Re-check until `curl "$BASE/health"` returns 200 before placing the call.
```

The daemon's port (the `8080` in `ngrok http <port>`) is recorded in `logs/daemon.json`. The tunnel
is live only when `"$BASE/health"` returns `200` — verify that, not just that a process exists.

If any preflight step fails, tell Fred what's missing in one sentence and stop. The Notion target
already has its schema (Name / Status / Expected Reading Time) established — the demo assumes it's
ready.

## Step 1 — Call Fred (and steer)

The daemon runs the call in the background; you `place` it, then `listen` for the live transcript
and `steer` Gemini Live as needed:

```bash
node bin/call-fred.ts place --objective "Check in with Fred and capture the YouTube-by-SMS handoff."
# -> { "id": "call_ab12cd34", ... }   (remember the id)
```

Then poll the transcript across turns (each `listen` returns only new events):

```bash
node bin/call-fred.ts listen --id <id>
```

When you see a `transcript` event where Fred says he'll text the link, you can nudge Gemini:

```bash
node bin/call-fred.ts steer "Fred's sending the link by text — confirm you'll watch it later" --id <id>
```

You don't *have* to steer — Gemini also self-detects the handoff (`note_sms_handoff` tool →
`sms_handoff_detected` event in the `listen` stream).

**The agent never hangs up just because the objective is done.** Once you see
`sms_handoff_detected` (or Fred clearly says he'll text the link), proceed to Step 2 — keep the
call live in the background while you work the SMS phase. The call ends one of two ways: Fred tells
the *voice agent* on the phone to hang up (it calls `end_call` itself → `end_call_requested` then
`call_ended` in the stream), or you run `hangup` from the control side (see Step 6). You don't have
to keep polling `listen` during the SMS phase — the voice agent can close the call on Fred's spoken
request without you.

Fred's expected spoken line: *"I have a YouTube video I'm interested in but can't view right
now. I'll text it to you."*

If no `sms_handoff_detected` appears, just proceed — the link poll in Step 2 is the real gate.

## Step 2 — Watch SMS for the YouTube link

Record the current time as the `--since` boundary, then poll:

```bash
node bin/sendblue-api.ts wait-for-link --since "<iso-timestamp-just-before-this-step>"
```

Returns `{ "url": "https://youtu.be/...", ... }`. If it times out, ask Fred to resend and
re-run with an earlier `--since`.

## Step 3 — Acknowledge, then understand the video

Send a short status update, then run Gemini video understanding:

```bash
node bin/sendblue-api.ts send "Got the link — understanding the video now."
node bin/understand-video.ts "<url-from-step-2>"
```

Returns `{ "title", "summary", "topics", "estimatedWatchMinutes" }`. If it exits with code 3
(`unsupported: true`), the video is private/unlisted — tell Fred, and fall back to a URL-only
save in Step 5 (use a short title derived from the URL).

## Step 4 — Ask for tapback approval

Send the approval message and remember its exact text (you'll match the `Liked "…"` quote):

```bash
APPROVAL="I found: <title>. Tapback thumbs-up to save it to Notion."
node bin/sendblue-api.ts send "$APPROVAL"
node bin/sendblue-api.ts wait-for-tapback --approval-text "$APPROVAL" --since "<iso-just-before-send>"
```

Returns `{ "approved": true, "via": "tapback" | "reply" }`. Tapback is the primary path; a
plain `yes` reply is the explicit fallback if tapback delivery is delayed. Do **not** save
until this returns `approved: true`.

## Step 5 — Save to Notion

```bash
node bin/save-technical-reading.ts "<url>" --title "<title>" \
  --notes "<one-line summary>" --reading-minutes <estimatedWatchMinutes>
```

Returns `{ "pageUrl": "https://www.notion.so/..." }`. For the unsupported-video fallback,
omit `--notes`/`--reading-minutes` and use a URL-derived title.

## Step 6 — Confirm back to Fred

```bash
node bin/sendblue-api.ts send "Saved \"<title>\" to your Technical Reading in Notion: <pageUrl>"
```

Then tell Fred in chat: the title you saved and the Notion URL.

The call may still be live. There are two ways it ends, and you should handle both:

- **Fred tells the voice agent on the phone** (e.g. "you can hang up now") — the agent says a
  quick goodbye and hangs up itself. You'll see `end_call_requested` → `call_ended` if you
  `listen`/`status`. Nothing for you to do on the call side.
- **You end it from the control side** — run `hangup` (it drains a spoken goodbye first):

```bash
node bin/call-fred.ts hangup     # optionally `steer "say a quick goodbye"` first; hangup drains it
```

Either way, once the call has ended, stop the daemon:

```bash
node bin/call-fred.ts teardown
```

The agent never hangs up just because the demo is finished — only on Fred's explicit spoken
request or your `hangup`.

## Troubleshooting

- **No SMS handoff detected on the call** — proceed to Step 2 anyway; the link poll is the gate.
- **No SMS link arrives** — resend prompt to Fred; re-run `wait-for-link` with earlier `--since`.
- **Invalid / non-YouTube URL** — `understand-video` exits 1; ask Fred for a public YouTube link.
- **Gemini unsupported video** (exit 3) — URL-only Notion save with a short title; warn Fred.
- **Tapback delayed** — `wait-for-tapback` also accepts a `yes` reply as fallback.
- **Notion write fails** — run `save-technical-reading preflight`; check `NOTION_API_KEY` and
  `TECHNICAL_READING_DATA_SOURCE_ID`.
- **Call rings, but hangs up the instant Fred picks up** — the ngrok tunnel is almost certainly
  down. Tell: the dead call has **no `call_started` / `twilio_status` events** in
  `logs/demo-events.jsonl` (Twilio couldn't reach the daemon for the media stream *or* status
  callback). REST dialing still works without the tunnel, so the phone rings; the bridge only fails
  on pickup. Fix: re-run the **Tunnel** preflight above (restart ngrok on the reserved domain, wait
  for `"$BASE/health"` → 200), then `place` again. The daemon stays healthy — only the tunnel died.
- **Twilio call won't connect at all** — confirm `TWILIO_FROM_NUMBER` is a Twilio-owned number
  *different* from `DEMO_USER_PHONE`, and that `TWILIO_WEBHOOK_BASE_URL` points at a live tunnel
  to this machine (see the Tunnel preflight).
- **`place`/`listen`/`steer` say "Cannot reach the call daemon"** — run `call-fred init` first;
  if it's wedged, `call-fred teardown` then `init` again.

Every command supports `--dry-run` (or, for the daemon, a safe `init`) for rehearsal.
