# Architecture

codex/claude code is the **control agent**. This repo provides only skills and CLI/API
primitives — no separate agent runtime, scheduler, or workflow brain. The activation surface is
natural language; the CLIs emit JSON so the control agent can parse results.

## Components

| Primitive | Entry | Responsibility |
|---|---|---|
| `call-fred` | `bin/call-fred.ts` (client) + `bin/call-daemon.ts` (daemon) | Background daemon: `init`/`place`/`listen`/`steer`/`status`/`hangup`/`teardown` over a Twilio + Gemini Live bridge |
| `sendblue-api` | `bin/sendblue-api.ts` | Send/read iMessage, read YouTube link, tapback gate |
| `understand-video` | `bin/understand-video.ts` | Gemini YouTube video understanding |
| `save-technical-reading` | `bin/save-technical-reading.ts` | Notion Technical Reading write |

Shared: `src/config.ts` (env validation, no secret logging), `src/log.ts` (event evidence),
`src/output.ts` (JSON output + exit codes).

## Sequence

```
Fred            codex/claude code         this repo's CLIs            external
 │  /demo  ───────────▶│                                                  │
 │                     │  call-fred init  (starts background daemon)      │
 │                     │  call-fred place ─▶ Twilio call + Gemini Live ─▶ │  (phone rings)
 │ ◀═══════ voice ═════╪═══════════════════════════════════════════════▶ │
 │ (talking)           │  call-fred listen ─▶ new transcript events ◀──── │  (poll, incremental)
 │                     │  call-fred steer "confirm you'll watch it" ─▶ /steer ─▶│ (text into live audio)
 │ "I'll text it"      │  ◀── sms_handoff_detected event                  │
 │ (call stays live; agent never self-hangs — operator hangs up when Fred asks)
 │                     │                                                  │
 │  SMS: youtu.be/… ──────────────────────────────────────────────────▶ │  Sendblue
 │                     │  sendblue wait-for-link ─▶ GET /api/v2/messages ▶│
 │                     │  ◀── { url }                                     │
 │                     │  sendblue send "understanding…" ─▶ POST send ───▶│
 │                     │  understand-video <url> ─▶ Gemini video ────────▶│
 │                     │  ◀── { title, summary, … }                       │
 │ ◀── "I found: T 👍?" │  sendblue send <approval> ─────────────────────▶│
 │  👍 tapback ───────────────────────────────────────────────────────▶ │
 │                     │  sendblue wait-for-tapback ─▶ GET messages ─────▶│
 │                     │  ◀── { approved:true }                           │
 │                     │  save-technical-reading ─▶ Notion pages.create ─▶│  Notion
 │ ◀── "Saved: <url>"  │  sendblue send <confirmation> ─────────────────▶│
```

## Audio bridge

- Inbound: Twilio base64 mulaw 8 kHz → decode → resample 8→16 kHz → Gemini PCM16 16 kHz
  (`sendRealtimeInput({ audio })`).
- Outbound: Gemini PCM16 24 kHz → resample 24→8 kHz → mulaw encode → Twilio base64 mulaw 8 kHz.
- Hangup is deferred behind a Twilio `mark` echo so the goodbye audio fully plays.

## Background daemon (init / place / listen / steer)

`call-fred init` spawns a **detached daemon** (`bin/call-daemon.ts`) that owns the long-lived
HTTP+WSS server and an in-memory map of call sessions keyed by call id. The control agent never
babysits a foreground process — it drives the daemon over HTTP:

- `place` → pre-warms a Gemini Live session, creates the Twilio call (call id rides as a Stream
  `<Parameter>`), returns `{ id }` immediately.
- `listen` → returns only events appended since the agent's last `listen` (incremental pointer
  per session), so the agent polls across turns. `--follow` streams NDJSON until `ended`.
- `steer` / `status` / `hangup` address a session by id (defaulting to the active call).
- The call ends two ways: the **voice agent** calls its `end_call` tool when Fred explicitly asks
  to hang up (it never ends a call just because the objective is done), or the **operator** runs
  `hangup`. Both routes funnel through the same drain path — the actual hangup is deferred behind
  a Twilio `mark` echo so a just-spoken goodbye plays out before the line closes. Letting the voice
  agent hang up on request matters because the control agent stops polling `listen` once it moves
  to the SMS phase, so a spoken "hang up" would otherwise never reach it.
- Runtime state (`pid`, `port`) lives in `logs/daemon.json`; `teardown` kills the daemon.

This mirrors outreach-cli's `init`/`place`/`listen` lifecycle.

## Steering Gemini Live (not delegating to it)

Gemini Live is multimodal on input, so the control agent steers the live audio conversation by
injecting text — it does **not** hand the call off to an autonomous voice persona:

- **Transcript out** — `LiveServerContent.inputTranscription` (Fred) and `outputTranscription`
  (agent) are buffered per session as `transcript` events, surfaced by `listen`.
- **Steer in** — `POST /steer { id, text }` calls `session.sendRealtimeInput({ text })`, the
  realtime text channel interleaved with the audio (no turn barrier). Gemini phrases the note in
  its own voice. `node bin/call-fred.ts steer "<note>"` is the thin client.
- The system instruction tells Live to treat these as private director notes (never read aloud).

(`sendClientContent({ turns, turnComplete })` — ordered text turns — is the alternative for
verbatim/prefill steering; the demo uses nudge-only via the realtime channel.)

## Tapback detection

Sendblue does not expose structured reactions. A thumbs-up arrives as a normal inbound
`service: "iMessage"` message whose `content` starts with `Liked ` and quotes the approval text.
We match by sender + timestamp-after-approval + the `Liked "…"` prefix; a `yes` reply is the
documented fallback.
