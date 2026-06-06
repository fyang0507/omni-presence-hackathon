# Omni-Presence Agent — Skills & CLI Primitives

A hackathon demo where **codex/claude code is the control agent**. This repo provides agent
skills and small CLI/API primitives — not a standalone agent, scheduler, or workflow brain.

Fred types `/demo` in codex/claude code. The control agent then: calls Fred, listens for the
"I'll text you a YouTube link" handoff, watches the Sendblue channel for the link, understands
the video with Gemini, asks for a 👍 tapback, and saves the artifact to Notion.

See [`AGENTS.md`](AGENTS.md) for goal/boundary and [`skills/demo/SKILL.md`](skills/demo/SKILL.md)
for the control runbook.

## Primitives

| Command | What it does |
|---|---|
| `node bin/call-fred.ts init` | Start the background voice daemon (Twilio + Gemini Live bridge) |
| `node bin/call-fred.ts place` / `listen` / `steer` / `status` / `hangup` / `teardown` | Place a call, read the live transcript, steer Gemini mid-call, manage the daemon |
| `node bin/sendblue-api.ts` | Send/read iMessage, read the YouTube link, gate on tapback approval |
| `node bin/understand-video.ts` | Gemini video understanding for a public YouTube URL |
| `node bin/save-technical-reading.ts` | Create the Notion Technical Reading row |

Every command supports `--dry-run`, prints secret-free JSON, and fails with a plain next-action
hint. Demo evidence is appended to `logs/demo-events.jsonl`.

## Setup

```bash
npm install          # uses the public npm registry (see .npmrc)
cp .env.example .env # then fill in real values (already present locally)
npm run check        # typecheck + tests
```

Requires Node >= 22.6 (the CLIs run TypeScript directly via Node's type stripping).

## Dry-run rehearsal (no external calls)

```bash
node bin/call-fred.ts place --dry-run
node bin/understand-video.ts "https://youtu.be/dQw4w9WgXcQ" --dry-run
node bin/sendblue-api.ts send "Got the link — understanding the video now." --dry-run
node bin/save-technical-reading.ts "https://youtu.be/dQw4w9WgXcQ" --title "Test" --dry-run
node bin/sendblue-api.ts preflight --dry-run
```

## Live demo

1. **Tunnel.** Expose the local bridge so Twilio can reach `/media-stream`:
   ```bash
   ngrok http 8080
   ```
   Set `TWILIO_WEBHOOK_BASE_URL` to the public https URL.
2. **Preflight.**
   ```bash
   node bin/sendblue-api.ts preflight
   node bin/save-technical-reading.ts preflight
   ```
3. **Run the demo** via [`skills/demo/SKILL.md`](skills/demo/SKILL.md) — or, for a manual run,
   follow Steps 1–6 there.

## Environment

All secrets live in a gitignored `.env` (see [`.env.example`](.env.example) for the full list).
Config never logs secret values; the event log redacts secret-looking fields.

## Troubleshooting

- **Twilio call won't connect** — `TWILIO_FROM_NUMBER` must be a Twilio-owned number **different
  from** `DEMO_USER_PHONE` (both set in the gitignored `.env`).
- **`place`/`listen`/`steer` can't reach the daemon** — run `call-fred init` first. If wedged,
  `call-fred teardown` then `init` again. The daemon's port is recorded in `logs/daemon.json`.
- **Twilio can't reach the bridge** — `TWILIO_WEBHOOK_BASE_URL` is stale; restart the tunnel and
  update it. `call-fred` prints the media-stream URL at startup.
- **Gemini Live model moved** — set `GEMINI_LIVE_MODEL`; errors include the model name.
- **YouTube video unsupported** (private/unlisted) — `understand-video` exits 3; fall back to a
  URL-only Notion save.
- **Tapback delayed** — `wait-for-tapback` also accepts a `yes` reply as the documented fallback.
- **Notion write fails** — run the `save-technical-reading preflight`; verify `NOTION_API_KEY`
  and `TECHNICAL_READING_DATA_SOURCE_ID`.

## Layout

```
bin/    call-fred.ts  call-daemon.ts  sendblue-api.ts  understand-video.ts  save-technical-reading.ts
src/    config.ts  log.ts  output.ts  voice/ (daemon, runtime, geminiLive, transcode, call, prompt)  sms/  video/  notion/
skills/ demo/  call-fred/  understand-video/  save-technical-reading/
docs/   demo-script.md  architecture.md
test/   *.test.ts
fixtures/ sample-video.json
```
