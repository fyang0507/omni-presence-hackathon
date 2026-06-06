# Omni-Presence Agent Hackathon Context

## Project Goal

Build a hackathon demo of an omni-presence agent experience where codex/claude code is the control agent. This repo should provide agent skills and CLI primitives, not a standalone agent, scheduler, or workflow brain.

The intended trigger is natural language, for example Fred uses `/demo`. After that, codex/claude code should use the skills/CLI in this repo to call Fred, listen for the handoff, monitor the Sendblue channel through the API, understand the YouTube link with Gemini video understanding, wait for tapback approval, and save the artifact into Notion.

Build from scratch for speed and clarity. Reference repos are allowed for credentials, CLI design lessons, and proven edge cases, but avoid porting their implementation wholesale.

## Demo Narrative

1. Fred triggers `/demo`.
2. codex/claude code calls Fred at `DEMO_USER_PHONE` (from `.env`).
3. The voice skill asks what is on Fred's mind.
4. Fred says he has a YouTube video he is interested in but is not able to view now.
5. Fred says he will send the link by SMS and asks the agent to monitor the SMS channel.
6. codex/claude code uses the Sendblue API to watch for a YouTube link from Fred.
7. codex/claude code sends a short Sendblue status update that it received the link and is understanding the video.
8. codex/claude code passes the YouTube URL to the Gemini video understanding skill (use gemini-3.5-flash).
9. codex/claude code sends a confirmation message with the proposed title/summary and asks Fred to tapback thumbs-up to save it to Notion.
10. Fred tapbacks thumbs-up on the confirmation message.
11. codex/claude code observes the approval through Sendblue, then calls the Notion Technical Reading skill/CLI to create the row in the target Notion database.
12. codex/claude code sends a final saved confirmation with the Notion page URL.

The user-facing workflow should be natural language. Do not make Fred provide JSON, IDs, or command flags during the demo.

## Product Boundary

This repo owns reusable skills and CLI tools only:

- `call-fred`: place and manage the Twilio + Gemini Live call.
- `understand-video`: turn a public YouTube URL into a concise reading/watch artifact.
- `save-notion`: save the artifact to Notion.
- `demo`: a skill/runbook that tells codex/claude code how to chain the call CLI, Sendblue API helper, Gemini video skill, tapback approval, and Notion save skill from natural language.

codex/claude code owns orchestration. The repo may expose machine-readable CLI output so codex/claude code can parse it, but the public activation surface is natural language, not a JSON schema or a separate agent runtime.

## Required Capabilities

- Voice call: Twilio Programmable Voice plus bidirectional Media Streams.
- Realtime voice model: Gemini Live API.
- SMS/iMessage: Sendblue API. The Sendblue team confirmed the CLI does not support tapback readback, and tapback approval is part of the demo.
- Video understanding: Gemini API video understanding, especially public YouTube URL input.
- Artifact store: Notion integration writing to the target Technical Reading database.

## Local Reference Repos

- Outreach reference: `/Users/fredy/Google Drive/My Drive/Projects/outreach-cli`
- Notion reference: `/Users/fredy/Google Drive/My Drive/Projects/ntn-gateway`

Use the Outreach repo for lessons about Twilio Media Streams, Gemini Live connection shape, call lifecycle, transcript logging, audio transcoding, and CLI ergonomics. Use `ntn-gateway` for Notion credential names, Gateway-first schema discovery, and Technical Reading conventions.

## Environment

This workspace has a local `.env` with relevant values copied from reference repos and Arc/Sendblue dashboard state. It is intentionally gitignored.

Key variables:

- `DEMO_USER_PHONE`, `DEMO_USER_PHONE_DISPLAY`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_WEBHOOK_BASE_URL`
- `GEMINI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GEMINI_LIVE_MODEL`, `GEMINI_VIDEO_MODEL`
- `NOTION_API_KEY`, `NTN_GATEWAY_PAGE_ID`, `NTN_GATEWAY_DATA_REPO`, `TECHNICAL_READING_DATA_SOURCE_ID`, `NOTION_TECHNICAL_READING_URL`
- `SENDBLUE_FROM_NUMBER`, `SENDBLUE_DEFAULT_TO`, `SENDBLUE_ACCOUNT_EMAIL`, `SENDBLUE_ACCOUNT`, `SENDBLUE_COMPANY_ID`
- `SENDBLUE_API_KEY_ID`, `SENDBLUE_API_SECRET_KEY`, `SENDBLUE_API_API_KEY`, `SENDBLUE_API_API_SECRET`

Sendblue account details were pulled from the Arc dashboard on 2026-06-06. The local `.env` includes the API key ID, API secret key, assigned Sendblue sender number, and verified demo recipient. A live send test corrected the assigned Sendblue sender number to the dashboard line.

## External API Notes

- Twilio Media Streams can stream raw call audio over WebSockets and supports bidirectional streams for AI chatbot style calls. Use `<Connect><Stream>` for the bidirectional path.
- Twilio outbound audio sent back over the stream must be base64 `audio/x-mulaw` at 8000 Hz with no file header bytes. Track playback with Twilio `mark` messages before ending a call so goodbyes do not get clipped.
- Gemini Live API uses a stateful WSS connection. Current docs list input audio as raw 16-bit PCM at 16 kHz and output audio as raw 16-bit PCM at 24 kHz, so the bridge needs Twilio mulaw 8 kHz to Gemini PCM 16 kHz inbound, then Gemini PCM 24 kHz to Twilio mulaw 8 kHz outbound.
- Gemini video understanding currently accepts public YouTube URLs directly. The docs mark YouTube URL input as preview; private and unlisted videos are not supported.
- Use the Sendblue API directly for SMS/iMessage status updates, inbound link reading, and tapback approval. CLI use is no longer preferred because the Sendblue team confirmed tapbacks are not exposed there.
- Tapback approval is the intended demo affordance: after video understanding, send a message like `I found: <title>. Tapback thumbs-up to save it to Notion.` Save only after Fred's thumbs-up tapback is observed.
- Sendblue tapback investigation: a live thumbs-up tapback from Fred appeared in `GET /api/v2/messages` as a normal inbound iMessage record, not as a structured reaction field. The approval content began with `Liked “...original approval message...”`. For the demo, detect thumbs-up approval by matching a new inbound `service: "iMessage"` message from Fred whose `content` starts with `Liked ` and quotes the approval message text. Keep `reply yes` as a fallback only if tapback delivery is delayed.

## Notion Target

Target Notion database/page view:

```text
https://app.notion.com/p/fredyang0507/3779782c4f4a80989851de7327c03295?v=3779782c4f4a80ca9e1c000cf3581d66&source=copy_link
```

For Technical Reading saves:

- Preflight Notion access before the demo.
- Use `TECHNICAL_READING_DATA_SOURCE_ID` from env. Live discovery on 2026-06-06 found `3619782c-4f4a-804a-9670-000be28dec1a`.
- Create a page with `Status: Not started`.
- Use a concise, Gemini-derived title unless Fred provides a better title.
- Put the source URL in the page body as the durable artifact.
- Include a compact video-understanding note only when it helps the demo show what happened.

## Suggested Repo Shape

```text
bin/
  call-fred.js
  understand-video.js
  save-technical-reading.js
skills/
  demo/SKILL.md
  call-fred/SKILL.md
  understand-video/SKILL.md
  save-technical-reading/SKILL.md
src/
  config.ts
  voice/
  sms/
  video/
  notion/
docs/
  demo-script.md
  architecture.md
```

## Done Definition

The hackathon MVP is done when codex/claude code can respond to `/demo` by:

1. Calling Fred.
2. Understanding that Fred will send a YouTube link by SMS.
3. Using the Sendblue API to read the SMS link.
4. Sending SMS/iMessage status updates while Gemini understands the video.
5. Asking Fred to approve the Notion save with a thumbs-up tapback.
6. Saving it to the Notion target only after approval.
7. Reporting the saved title and Notion URL back to Fred in natural language.
