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
node bin/call-fred.ts init               # start the background voice daemon
node bin/sendblue-api.ts preflight
node bin/save-technical-reading.ts preflight
```

If any fails, tell Fred what's missing in one sentence and stop. The Notion target already has its
schema (Name / Status / Expected Reading Time) established — the demo assumes it's ready.

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

**The agent never hangs up on its own.** Once you see `sms_handoff_detected` (or Fred clearly
says he'll text the link), proceed to Step 2 — keep the call live in the background. Fred decides
when to end it; you only run `hangup` when he tells you to (see Step 6). Keep `listen`-ing
occasionally so you can react if Fred says something else.

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

The call is still live — the agent does not hang up on its own. **Leave it open until Fred tells
you he's done** (e.g. "you can hang up now"). When he does, end the call and stop the daemon:

```bash
node bin/call-fred.ts hangup     # optionally `steer "say a quick goodbye"` first; hangup drains it
node bin/call-fred.ts teardown
```

## Troubleshooting

- **No SMS handoff detected on the call** — proceed to Step 2 anyway; the link poll is the gate.
- **No SMS link arrives** — resend prompt to Fred; re-run `wait-for-link` with earlier `--since`.
- **Invalid / non-YouTube URL** — `understand-video` exits 1; ask Fred for a public YouTube link.
- **Gemini unsupported video** (exit 3) — URL-only Notion save with a short title; warn Fred.
- **Tapback delayed** — `wait-for-tapback` also accepts a `yes` reply as fallback.
- **Notion write fails** — run `save-technical-reading preflight`; check `NOTION_API_KEY` and
  `TECHNICAL_READING_DATA_SOURCE_ID`.
- **Twilio call won't connect** — confirm `TWILIO_FROM_NUMBER` is a Twilio-owned number
  *different* from `DEMO_USER_PHONE`, and that `TWILIO_WEBHOOK_BASE_URL` points at a live tunnel
  to this machine.
- **`place`/`listen`/`steer` say "Cannot reach the call daemon"** — run `call-fred init` first;
  if it's wedged, `call-fred teardown` then `init` again.

Every command supports `--dry-run` (or, for the daemon, a safe `init`) for rehearsal.
