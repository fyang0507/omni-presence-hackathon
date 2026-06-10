# Omni-Presence Demo Launch Plan

## Positioning

Core claim:

> Codex/Claude Code is not only a coding agent. It can be the control plane for your real-world agent skills.

Memorable punchline:

> Do not let your agent sit in a textbox. It should meet you wherever you are.

The demo should make three shifts obvious:

- From coding assistant to general-purpose control agent.
- From single chat box to omni-channel agent interaction.
- From building a new agent runtime to extending an existing agent with skills plus CLI primitives.

One-line hook:

> I made Codex call me, listen for a handoff, watch SMS, understand a YouTube video, wait for a tapback approval, and save the result to Notion.

Resume/activity-line version:

> Built an omni-presence agent demo where Codex/Claude Code orchestrates Twilio voice, Sendblue iMessage, Gemini video understanding, tapback approval, and Notion persistence through reusable skills and CLI primitives.

## Demo Video Script

Target length: 90-120 seconds.

Format: screen recording with a small face camera overlay, phone screen visible during the call/SMS/tapback moments, and terminal evidence briefly visible only when it proves orchestration.

Audio rule: do not run voiceover on top of live conversation. Treat the live call as the "proof" layer and the voiceover as the "meaning" layer. Use voiceover before and after live audio, then duck or fully mute narration during the actual spoken handoff.

Recommended edit pattern:

- Cold open with voiceover over silent/screen-only footage.
- Let the live phone call breathe for 8-12 seconds so viewers hear the agent and Fred.
- Use captions to clarify who is speaking: `Agent on phone` and `Fred`.
- After the live handoff, fade the call audio down and return to voiceover.
- For SMS/tapback/Notion steps, use voiceover plus on-screen captions; those steps do not need live audio.
- If the call goes long, use one clean excerpt and show `...` or a quick jump cut rather than preserving every second.

### 0:00-0:07 - Pattern Interrupt

On screen: Codex/Claude Code, Fred types `/demo`.

Voiceover:

> Most people still think of Codex as a coding agent. I wanted to see what happens if it becomes the control plane for my day.

On-screen caption:

> Codex as a real-world agent control plane

### 0:07-0:18 - The Call

On screen: phone rings, live transcript begins.

Voiceover:

> I trigger one natural-language command. Codex starts the voice skill, calls me through Twilio, and asks what is on my mind.

Audio direction: finish this voiceover before the agent speaks. Then switch to live call audio only.

Fred, spoken:

> I have a YouTube video I am interested in, but I cannot watch it right now. I will text it to you.

Agent, spoken:

> Got it. Send me the link and I will understand it, then ask before saving anything.

### 0:18-0:31 - Channel Handoff

On screen: iMessage/SMS to the Sendblue number with the YouTube link.

Voiceover:

> The important part is the handoff. I do not paste data back into chat. The agent moves with me across channels.

Audio direction: call audio should be muted or very low here. The viewer is now following the cross-channel transition, not the live conversation.

On-screen caption:

> Voice -> SMS -> AI video understanding -> Tapback approval -> Notion

### 0:31-0:48 - Understanding

On screen: Sendblue status message, then Codex running the video understanding step. Show compact JSON/result, not too much terminal.

Agent SMS:

> Got the link. Understanding the video now.

Voiceover:

> Codex watches the Sendblue channel through the API, detects the YouTube link, and passes it to Gemini video understanding.

On-screen caption:

> Existing agent + reusable skill + CLI primitive

### 0:48-1:07 - Approval

On screen: approval iMessage arrives.

Agent SMS:

> I found: <title>. Tapback thumbs-up to save it to Notion.

Voiceover:

> This is the part I care about. The agent does useful work, but it waits for human approval before touching my knowledge base.

On screen: long press, thumbs-up tapback.

Voiceover:

> Sendblue exposes the tapback as an inbound iMessage event, so Codex can treat approval as a real signal.

### 1:07-1:23 - Save

On screen: Notion Technical Reading page appears with title/status/source URL.

Voiceover:

> After the tapback, Codex saves the artifact into Notion with the title, source URL, reading status, and compact notes.

Agent SMS:

> Saved "<title>" to your Technical Reading in Notion: <pageUrl>

### 1:23-1:40 - Why This Matters

On screen: simple architecture diagram or split-screen of call, SMS, Gemini, Notion.

Voiceover:

> The point is not that I built another agent. The point is that I extended the agents I already use. Skills describe the workflow. CLIs expose reliable actions. Codex or Claude Code orchestrates the whole thing from natural language.

On-screen caption:

> Do not build another brain unless you need one. Give your existing agent better hands.

### 1:40-1:55 - Close

On screen: final saved page and repo/architecture glimpse.

Voiceover:

> This is what I mean by omni-presence agents. Most agent demos still assume the agent lives in one chat window. But real work does not happen in one chat window. I want agents that can meet me by phone, text, browser, repo, and workspace.
>
> Do not let your agent sit in a textbox. It should meet you wherever you are.

On-screen caption:

> Do not let your agent sit in a textbox.

## Short Cutdown Script

Target length: 15-25 seconds.

Voiceover:

> I made Codex do something that feels less like coding assistance and more like a personal control plane. I type `/demo`; it calls me, listens for a YouTube-by-text handoff, watches iMessage, understands the video with Gemini, asks for a thumbs-up tapback, and saves it to Notion only after approval. The trick is not a new agent runtime. It is skills plus custom CLIs that make Codex useful outside the chat box.

## X Launch Post

Post with native video, then a thread.

Main post:

> I built a small demo that changed how I think about Codex.
>
> It is not just a coding agent here. It calls me, listens for a handoff, watches iMessage for a YouTube link, understands the video with Gemini, waits for a thumbs-up tapback, then saves the artifact to Notion.
>
> Do not let your agent sit in a textbox. It should meet you wherever you are.

Thread follow-ups:

1. Most agent demos start by building a new agent. I wanted the opposite: keep Codex/Claude Code as the control agent, then give it better real-world capabilities.
2. The workflow is intentionally omni-channel: voice call for intent, SMS/iMessage for link handoff, tapback for approval, Notion for memory.
3. The important design choice is human approval. The agent can prepare the artifact, but it cannot write to Notion until I tap back thumbs-up.
4. Architecture: Twilio Media Streams + Gemini Live for voice, Sendblue API for iMessage/tapback, Gemini video understanding for public YouTube URLs, Notion API for Technical Reading.
5. My takeaway: agent development may be less about inventing another brain and more about giving the agents we already use durable skills, clean tool surfaces, and permissioned workflows.

## LinkedIn Launch Post

Use native video. Keep the first two lines strong before the fold.

> I built an omni-presence agent demo where Codex/Claude Code acts as the control plane across voice, SMS, video understanding, approval, and Notion.
>
> The punchline: do not let your agent sit in a textbox. It should meet you wherever you are.
>
> The demo flow:
>
> - I type `/demo`.
> - Codex calls me and asks what is on my mind.
> - I say I have a YouTube video I cannot watch right now and will text it.
> - Codex watches the Sendblue channel, receives the link, and understands the video with Gemini.
> - It sends me a proposed title/summary and asks for a thumbs-up tapback.
> - Only after approval, it saves the artifact to my Notion Technical Reading database.
>
> The broader idea: we may not always need to build a standalone agent. Sometimes the better engineering move is to extend the agents we already use with focused skills and reliable CLI primitives.
>
> This is the direction I am exploring as an Applied AI Engineer: agent workflows that are practical, permissioned, multi-channel, and grounded in tools people already use.
>
> Curious how other builders are thinking about this: are you building new agent runtimes, or extending existing agent surfaces?

## Reddit Post

Use a value-first post. Do not lead with hiring, resume, or "please watch my demo." Tailor to each community and read the rules first.

Suggested title:

> I tried using Codex as a real-world control agent instead of just a coding agent

Body:

> I built a small hackathon-style demo to test a pattern I have been thinking about: instead of building a standalone agent runtime, what if Codex/Claude Code orchestrates skills and CLI primitives across real tools?
>
> Flow:
>
> - I type `/demo`.
> - The agent calls me through Twilio and asks what is on my mind.
> - I say I have a YouTube video I cannot watch right now and will text it.
> - It watches Sendblue for the YouTube link.
> - It sends a status update, uses Gemini to understand the public YouTube URL, then asks me to tapback thumbs-up before saving.
> - Only after the tapback, it writes the artifact to my Notion Technical Reading database.
>
> What I found interesting is not the individual APIs. It is the product boundary: Codex remains the orchestration layer, while the repo only provides reusable skills and reliable CLI actions.
>
> This changed my mental model from "build an agent" to "give my existing agent better hands." Or, said another way: do not let your agent sit in a textbox. It should meet you wherever you are.
>
> I am curious whether others are taking this approach. Are you building standalone agent loops, or using existing coding agents as the control surface for real workflows?

Optional first comment:

> A few implementation details people may ask about: Twilio Media Streams for the call, Sendblue API for iMessage/tapback detection, Gemini Live/video understanding, and Notion API for persistence. The tapback gate matters because I did not want the agent writing into my knowledge base without explicit approval.

## Distribution Plan

### Before Posting

- Cut two videos: a 90-120 second full demo and a 15-25 second hook.
- Add captions burned into both videos.
- Put the most visual moment in the first 3 seconds: `/demo` -> phone ringing.
- Prepare one static architecture image for replies/comments.
- Prepare a short GitHub README or gist if the repo is public; otherwise prepare a concise architecture note.
- Pin a profile/activity tagline: "Applied AI Engineer exploring agent skills, tool surfaces, and omni-channel workflows."

### Day 1

- Post the native video on X first.
- Reply to your own X post with the architecture diagram and implementation details.
- Quote-post later with the line: "Do not build another brain unless you need one. Give your existing agent better hands."
- Use the punchline in one reply or quote-post: "Do not let your agent sit in a textbox. It should meet you wherever you are."
- Post on LinkedIn 2-4 hours after X, with more career framing and less internet-native sharpness.

### Day 2

- Post to one Reddit community only, tailored to its norms.
- Use the text post as the main artifact and add the video/repo link only when allowed.
- Spend the first hour answering comments with implementation details, tradeoffs, and failure modes.

### Day 3-5

- Publish a short technical follow-up: "How the tapback approval gate works" or "Why I used Codex as the control plane instead of building an agent runtime."
- DM or tag selectively only when there is a genuine connection: founders building agent infra, recruiters posting Applied AI roles, or engineers discussing tool-use agents.
- Add the demo to your resume/activity timeline as a project with concrete integrations and the human-in-the-loop design choice.

## Impact Notes

What will make this demo travel:

- It starts with a surprising visual: Codex makes a phone call.
- It solves a recognizable problem: "I cannot watch this now; capture it for me."
- It has a clear safety affordance: tapback approval before Notion write.
- It teaches a pattern: skills plus CLIs can extend an existing agent.
- It has a memorable thesis: agents should not be trapped in textboxes.
- It makes your role legible: Applied AI Engineer who can ship across APIs, UX, automation, and judgment boundaries.

Avoid:

- Making the video mostly terminal output.
- Overexplaining Twilio/Gemini details before viewers understand the user experience.
- Saying "autonomous agent" too much; the permissioned approval gate is more credible.
- Posting the exact same copy everywhere.
- Treating Reddit as a traffic source rather than a technical discussion forum.
