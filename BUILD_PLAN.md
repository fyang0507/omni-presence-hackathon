# Parallel Build Plan

## North Star

Build skills and CLI/API primitives that let codex/claude code run the demo from natural language. Fred should be able to type `/demo`; codex/claude code then calls Fred, monitors Sendblue through the API, understands the YouTube video, waits for tapback approval, and saves it to Notion.

Do not build a separate autonomous agent or require JSON workflow input. CLI commands may return structured output for codex/claude code to parse, but the demo interface is conversational.

## Shared Command Style

Each track should expose one small CLI and one matching `skills/<name>/SKILL.md`.

Use simple commands with safe defaults:

- `call-fred --objective "..."`
- `sendblue-api messages --inbound`
- `sendblue-api send "$DEMO_USER_PHONE" "..."`
- `sendblue-api wait-for-tapback --message-handle <handle> --reaction like`
- `understand-video <youtube-url>`
- `save-technical-reading <youtube-url> --title ... --notes ...`

Every command should support `--dry-run`, print secret-free output, and fail with a plain next-action hint.

## Track A: Foundation, CLIs, And Skill Skeletons

Owner outcome: a minimal Node/TypeScript repo with executable CLIs and agent-facing skill docs.

Tasks:

- Scaffold `package.json`, TypeScript, and `bin/` command entrypoints.
- Implement `src/config.ts` that loads `.env`, validates only the variables needed by the invoked command, and never logs secret values.
- Create skill folders: `skills/demo`, `skills/call-fred`, `skills/understand-video`, `skills/save-technical-reading`.
- Add a small Sendblue API CLI/helper because the official Sendblue CLI does not expose tapback readback.
- Add a small shared event log for demo evidence.
- Add `--dry-run` behavior to every command.

Acceptance:

- A future codex/claude code agent can read `skills/demo/SKILL.md` and know how to run the natural-language demo.
- `npm run check` passes.
- Each command can run in dry-run mode without external writes.

## Track B: `call-fred` Voice Skill And CLI

Owner outcome: codex/claude code can place the call to Fred and capture the natural-language SMS handoff.

Tasks:

- Build Twilio outbound call creation using `DEMO_USER_PHONE` and `TWILIO_FROM_NUMBER`.
- Build HTTP endpoints for Twilio status callbacks and TwiML.
- Build a WSS `/media-stream` endpoint for `<Connect><Stream>`.
- Implement the Twilio mulaw 8 kHz to Gemini PCM 16 kHz inbound bridge.
- Implement the Gemini PCM 24 kHz to Twilio mulaw 8 kHz outbound bridge.
- Give Gemini Live a concise system instruction: ask what is on Fred's mind, recognize the YouTube-by-SMS handoff, and finish politely.
- Emit a clear terminal event when Fred asks the agent to monitor SMS for the link.

Acceptance:

- Dry-run prints the call target, prompt, and TwiML shape without placing a call.
- Live smoke call can greet Fred and identify the phrase "I'll send it by SMS" or equivalent.
- The call ends only after final spoken audio drains.

## Track C: Sendblue API Messaging And Tapback Approval

Owner outcome: codex/claude code can use Sendblue's API for inbound link reading, status updates, and tapback-gated confirmation.

Tasks:

- Implement a narrow `sendblue-api` helper or equivalent subcommands in this repo. This is not an agent; it is a thin API primitive required because the official CLI cannot read tapbacks.
- Verify account access using `SENDBLUE_API_KEY_ID`, `SENDBLUE_API_SECRET_KEY`, `SENDBLUE_FROM_NUMBER`, and `SENDBLUE_DEFAULT_TO`.
- Use `GET /api/v2/messages` to read recent inbound messages.
- Filter results to Fred's verified number and extract the first new YouTube URL after the call handoff.
- Send status updates with `POST /api/send-message`, for example link received, video understanding started, and video understanding finished.
- After video understanding, send an approval message: `I found: <title>. Tapback thumbs-up to save it to Notion.`
- Capture that approval message's `message_handle`.
- Detect Fred's thumbs-up tapback before running `save-technical-reading`. A live test showed Sendblue exposes an iMessage thumbs-up tapback through `GET /api/v2/messages` as a normal inbound message whose content starts with `Liked “...original approval message...”`.
- Match tapback approval by sender, timestamp after approval message, `service: "iMessage"`, and `content` beginning with `Liked ` while quoting the approval text. Fall back to plain `reply yes` approval only if tapback delivery is delayed.
- Use `POST /api/send-message` for the saved confirmation after the Notion save succeeds.

Acceptance:

- A Sendblue API preflight confirms credentials, sender number, and verified recipient.
- codex/claude code can read inbound messages with `GET /api/v2/messages`.
- codex/claude code can send progress/status messages with `POST /api/send-message`.
- A thumbs-up tapback message gates the Notion write; fallback `yes` is explicitly a demo contingency, not the primary path.

## Track D: `understand-video` Gemini Skill And CLI

Owner outcome: codex/claude code can pass a YouTube URL to Gemini video understanding and receive a concise artifact suitable for Notion.

Tasks:

- Implement Gemini client using `GEMINI_API_KEY`.
- Pass public YouTube URLs directly to Gemini.
- Prompt for natural, compact output: title, short summary, key topics, and estimated watch time.
- Keep output easy for codex/claude code to read; JSON is acceptable as command output, but do not require Fred to supply JSON input.
- Handle private/unlisted/unsupported videos with a typed failure and a URL-only fallback recommendation.

Acceptance:

- A public YouTube URL returns a useful title and compact understanding note.
- Unsupported videos produce a clear fallback path.
- Tests cover happy path and malformed model response handling with mocked Gemini calls.

## Track E: `save-technical-reading` Notion Skill And CLI

Owner outcome: codex/claude code can save the video artifact into the target Notion Technical Reading database.

Tasks:

- Implement a minimal Notion SDK client with `NOTION_API_KEY`.
- Use `TECHNICAL_READING_DATA_SOURCE_ID` from env, with the Notion URL recorded in `NOTION_TECHNICAL_READING_URL`.
- Validate required properties before write.
- Create a page with title, `Status: Not started`, optional `Expected Reading Time`, URL body block, and compact video notes when present.
- Return the Notion page URL.

Acceptance:

- Preflight says whether Notion is ready and which target will be used.
- Dry-run prints a secret-free write preview.
- Live write creates one row in the target Notion surface and returns its URL.

## Track F: `demo` Skill Runbook

Owner outcome: a natural-language codex/claude code playbook for `/demo`.

Tasks:

- Write `skills/demo/SKILL.md` as the control script codex/claude code follows.
- Include Fred's expected spoken line: "I have a YouTube video I'm interested in but can't view right now. I'll text it to you."
- Define the handoff: after call output indicates SMS monitoring is needed, poll Sendblue API messages until the YouTube URL arrives.
- Define the save path: Sendblue API URL -> status update -> `understand-video` -> approval message -> thumbs-up tapback or fallback yes -> `save-technical-reading` -> Sendblue API saved confirmation.
- Add troubleshooting for no SMS, invalid URL, Gemini unsupported video, tapback event delay, and Notion write failure.

Acceptance:

- Another codex/claude code agent can run the full demo from the skill without asking Fred for command syntax.
- The runbook preserves natural-language interaction and hides IDs/flags from the user unless debugging is needed.

## Track G: Demo Polish And Evidence

Owner outcome: a crisp hackathon runbook and proof artifacts.

Tasks:

- Write `README.md` with setup, dry-run, live demo commands, tunnel requirements, and troubleshooting.
- Add `docs/demo-script.md` with Fred's spoken line, SMS text, and expected outcome.
- Add `docs/architecture.md` with a compact sequence diagram showing codex/claude code as the control agent.
- Add fixture data for a sample YouTube URL and mocked Gemini/Notion outputs.

Acceptance:

- A fresh agent can read `AGENTS.md` plus `skills/demo/SKILL.md` and run dry-run in under five minutes.
- Live run evidence includes the call event, SMS link, video title, approval tapback or fallback approval text, Notion page URL, and saved confirmation message.

## Merge Order

1. Track A lands first with command skeletons and skill folders.
2. Tracks B, C, D, and E build independently against their CLI boundaries.
3. Track F chains the finished tools in natural language.
4. Track G documents the final demo and evidence.

## Risk Register

- Sendblue CLI does not expose tapback readback. Mitigation: use `GET /api/v2/messages` and parse inbound `Liked “...”` iMessage records for approval.
- Twilio tunnel URL may be stale. Mitigation: keep `TWILIO_WEBHOOK_BASE_URL` configurable and print webhook URLs at startup.
- Gemini Live model names can move. Mitigation: centralize model IDs in `.env` and fail with the model name in the error.
- YouTube URL input is preview and only supports public videos. Mitigation: fall back to URL-only Notion bookmark with a clear warning.
- Notion database IDs drift. Mitigation: keep the target URL and `TECHNICAL_READING_DATA_SOURCE_ID` in env, and provide a preflight check before live writes.
