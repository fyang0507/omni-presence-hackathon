# Demo Script

The whole demo is natural language. Fred never types JSON, IDs, or flags.

## 1. Trigger

Fred (in codex/claude code): `/demo`

## 2. The call

codex/claude code calls Fred. The agent greets him and asks what's on his mind.

**Fred's spoken line:**

> "I have a YouTube video I'm interested in but can't view right now. I'll text it to you."

The agent says something like *"Got it — text me the link and I'll take care of it,"* then ends
the call.

## 3. The text

**Fred's SMS / iMessage to the agent's Sendblue number:**

> https://www.youtube.com/watch?v=dQw4w9WgXcQ

## 4. Status updates (agent → Fred)

> Got the link — understanding the video now.

…then, after Gemini understanding:

> I found: **<title>**. Tapback thumbs-up to save it to Notion.

## 5. Approval

**Fred** long-presses the approval message and taps **👍 (thumbs-up)**.

Sendblue surfaces this as a normal inbound iMessage whose content begins with
`Liked "I found: <title>. Tapback thumbs-up to save it to Notion."`. A plain `yes` reply is the
fallback if the tapback is delayed.

## 6. Save + confirm (agent → Fred)

> Saved "<title>" to your Technical Reading in Notion: https://www.notion.so/...

## Expected evidence (`logs/demo-events.jsonl`)

`call_placed` → `call_started` → `sms_handoff_detected` → `call_ended` →
`waiting_for_link` → `link_received` → `sms_sent` (ack) → `understand_video_started` →
`understand_video_finished` → `sms_sent` (approval) → `waiting_for_tapback` →
`tapback_approved` → `notion_saved` → `sms_sent` (confirmation).
