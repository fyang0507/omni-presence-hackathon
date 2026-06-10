# Omni-Presence Demo Voiceover Script

This is the self-contained recording script for the public demo video. It is designed so the audience never has to listen to voiceover and live call audio at the same time.

Core punchline:

> Do not let your agent sit in a textbox. It should meet you wherever you are.

Architecture visual candidates:

- `docs/assets/omni-presence-architecture-theme-02-dark-console.png`
- `docs/assets/omni-presence-architecture-theme-03-poster-cards.png`

## Audio Plan

Rule: voiceover explains meaning; live call audio proves the demo.

- Use voiceover over silent or low-volume screen footage.
- Stop voiceover completely during the live phone exchange.
- Add captions for live speakers: `Agent on phone` and `Fred`.
- After the spoken handoff, lower or mute call audio and return to voiceover.
- Use voiceover for SMS, tapback, Gemini, Notion, and architecture explanation.
- If the live call runs long, keep only one clean excerpt and use a jump cut.

## Full Script

Target length: 90-120 seconds.

### 0:00-0:07 - Cold Open

On screen: Codex/Claude Code. Fred types `/demo`. Phone begins ringing.

Voiceover:

> Most people still think of Codex as a coding agent. I wanted to see what happens if it becomes the control plane for my day.

On-screen caption:

> Codex as a real-world agent control plane

### 0:07-0:18 - Setup

On screen: call daemon/status view, then phone call UI.

Voiceover:

> I trigger one natural-language command. Codex starts the voice skill, calls me through Twilio, and asks what is on my mind.

Audio direction: finish the voiceover before the agent speaks. Then switch to live call audio only.

### 0:18-0:34 - Live Call Proof

On screen: phone call UI plus live transcript if available.

Live audio only:

Agent on phone:

> Hey Fred. What is on your mind?

Fred:

> I have a YouTube video I am interested in, but I cannot watch it right now. I will text it to you.

Agent on phone:

> Got it. Send me the link and I will understand it, then ask before saving anything.

Audio direction: end or duck live call audio here. Do not continue narration until this exchange is complete.

### 0:34-0:47 - Channel Handoff

On screen: Fred sends a YouTube link by SMS/iMessage.

Voiceover:

> The important part is the handoff. I do not paste the link back into chat. The agent moves with me across channels.

On-screen caption:

> Voice call -> SMS link -> video understanding -> tapback approval -> Notion save

### 0:47-1:02 - Understanding

On screen: Sendblue status message, then compact Gemini video understanding result.

Agent SMS:

> Got the link. Understanding the video now.

Voiceover:

> Codex watches the Sendblue channel through the API, detects the YouTube link, and passes it to Gemini video understanding.

On-screen caption:

> Existing agent + custom skills + CLI primitives

### 1:02-1:20 - Approval Gate

On screen: approval SMS/iMessage, then Fred long-presses and taps thumbs-up.

Agent SMS:

> I found: <title>. Tapback thumbs-up to save it to Notion.

Voiceover:

> This is the design choice I care about. The agent can do useful work, but it cannot write into my knowledge base until I approve it.

On screen: thumbs-up tapback appears.

Voiceover:

> Sendblue exposes the tapback as an inbound iMessage event, so Codex can treat approval as a real signal.

### 1:20-1:34 - Save

On screen: Notion Technical Reading page appears with title, status, source URL, and compact notes.

Voiceover:

> After the tapback, Codex saves the artifact into Notion with the title, source URL, reading status, and a compact note.

Agent SMS:

> Saved "<title>" to your Technical Reading in Notion: <pageUrl>

### 1:34-1:50 - Architecture Reveal

On screen: the selected architecture visual from `docs/assets/`.

Voiceover:

> The point is not that I built another agent. The point is that I extended the agents I already use. Skills describe the workflow. Small CLIs expose reliable actions. Codex or Claude Code orchestrates the whole thing from natural language.

On-screen caption:

> Do not build another brain unless you need one. Give your existing agent better hands.

### 1:50-2:05 - Closing Thesis

On screen: final Notion page, then architecture visual or repo glimpse.

Voiceover:

> This is what I mean by omni-presence agents. Most agent demos still assume the agent lives in one chat window. But real work does not happen in one chat window. I want agents that can meet me by phone, text, browser, repo, and workspace.
>
> Do not let your agent sit in a textbox. It should meet you wherever you are.

On-screen caption:

> Do not let your agent sit in a textbox.

## Short Cutdown Script

Target length: 15-25 seconds.

On screen: rapid cuts of `/demo`, phone ringing, SMS link, tapback, Notion save.

Voiceover:

> I made Codex do something that feels less like coding assistance and more like a personal control plane. I type `/demo`; it calls me, listens for a YouTube-by-text handoff, watches iMessage, understands the video with Gemini, asks for a thumbs-up tapback, and saves it to Notion only after approval.
>
> Do not let your agent sit in a textbox. It should meet you wherever you are.

## Alternate Closing Lines

Use one, depending on the platform:

> Agents should not be trapped in textboxes. They should meet you wherever you are: phone, SMS, browser, repo, calendar, and Notion.

> The next frontier is not only smarter agents. It is agents with better surfaces: voice, SMS, approval loops, and tools that fit into real life.

> Do not build agents that wait inside a textbox. Build agents that can meet you wherever the work actually happens.

## Editing Checklist

- First 3 seconds show the surprising moment: `/demo` causes a phone call.
- Live call audio never overlaps with voiceover.
- Captions identify `Agent on phone` vs `Fred`.
- Terminal footage is brief and used only as proof.
- Phone/SMS/tapback footage is large enough to read on mobile.
- Architecture visual appears after the viewer understands the live workflow.
- Closing line lands after the Notion save, not before.
