---
name: call-fred
description: Background voice daemon — place a Twilio + Gemini Live call to Fred, read the live transcript with `listen`, and steer Gemini mid-call with director notes.
---

# call-fred

Runs a **background daemon** that places outbound Twilio calls and bridges audio to the Gemini
Live API. The control agent drives it over a small HTTP control API — no foreground process to
babysit. Gemini Live runs the moment-to-moment voice; **the control agent steers it** with
director notes and reads the live transcript via `listen`. (Modeled on outreach-cli's
init/place/listen lifecycle.)

## Lifecycle

```bash
node bin/call-fred.ts init                       # start the background daemon (idempotent)
node bin/call-fred.ts place --objective "..."    # place a call; returns { id } immediately
node bin/call-fred.ts listen --id <id>           # pull NEW transcript/events since last listen
node bin/call-fred.ts steer "<note>" --id <id>   # inject a director note into the live call
node bin/call-fred.ts status --id <id>           # { status: ringing|in_progress|ended, ... }
node bin/call-fred.ts hangup --id <id>           # end the call
node bin/call-fred.ts teardown                   # stop the daemon
```

`--id` defaults to the active call, so for a single-call demo you can omit it. `place` is the
default command. `--port` defaults to 8080 (recorded in `logs/daemon.json` by `init`).

## Reading the transcript (`listen`)

`listen` returns only events that are new since your last `listen` call (incremental pointer),
so poll it across turns:

```json
{ "ok": true, "id": "call_ab12cd34", "status": "in_progress", "smsHandoff": false,
  "events": [
    { "ts": "...", "type": "call_started", "streamSid": "..." },
    { "ts": "...", "type": "transcript", "who": "agent", "text": "Hi Fred, what's on your mind?" },
    { "ts": "...", "type": "transcript", "who": "fred", "text": "I'll text you a YouTube link." },
    { "ts": "...", "type": "sms_handoff_detected", "summary": "..." }
  ] }
```

`--follow` streams events as NDJSON until the call ends (one blocking command instead of a poll
loop). Event types: `call_placed`, `call_started`, `transcript` (`{who:"fred"|"agent", text}`),
`steer_sent`, `sms_handoff_detected`, `end_call_requested`, `twilio_status`, `call_ended`.

The agent **never ends the call just because the objective is done** — it keeps the line open by
default. It hangs up only on Fred's explicit spoken request ("you can hang up now"), via its
`end_call` tool → `end_call_requested` then `call_ended`. The operator can also end it directly
with `hangup`. So don't wait for `status: "ended"` to move on; act on `sms_handoff_detected`. You
don't have to keep polling once you're in the SMS phase — the voice agent can close the call on
Fred's spoken request without you.

## Steering mid-call (nudge)

```bash
node bin/call-fred.ts steer "Fred mentioned the link — confirm you'll watch it later"
```

POSTs to the daemon, which calls `session.sendRealtimeInput({ text })` on the live Gemini
session — the realtime text channel, interleaved with the audio (no turn barrier). Gemini folds
it into the conversation in its own voice and never reads the note aloud.

## How it works

1. `init` spawns a detached daemon serving `/media-stream` (WSS), `/place`, `/listen`, `/steer`,
   `/status`, `/hangup`, `/health`, `/call-status/:id`.
2. `place` pre-connects (warms) a Gemini Live session, then creates the Twilio call with inline
   TwiML opening a bidirectional `<Connect><Stream>` carrying the call id as a `<Parameter>`.
3. When the media stream connects, the daemon binds it to the session by call id and greets.
4. Audio bridge: Twilio mulaw 8 kHz ⇄ Gemini PCM16 16 kHz (in) / 24 kHz (out).
5. Transcript (`inputTranscription`/`outputTranscription`) and lifecycle are buffered per
   session for `listen`; the `note_sms_handoff` tool fires the handoff event. The agent has no
   hangup tool — an operator `hangup` is deferred behind a Twilio `mark` so a (steered) goodbye
   drains before the line drops.

## Requirements

- Env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`,
  `TWILIO_WEBHOOK_BASE_URL`, `GEMINI_API_KEY`, `GEMINI_LIVE_MODEL`, `DEMO_USER_PHONE`.
- `TWILIO_WEBHOOK_BASE_URL` must be a public tunnel (ngrok) to this machine's daemon port.
- `TWILIO_FROM_NUMBER` must be a Twilio-owned number, different from `DEMO_USER_PHONE`.
