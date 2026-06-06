---
name: understand-video
description: Turn a public YouTube URL into a concise reading/watch artifact using Gemini video understanding.
---

# understand-video

Passes a public YouTube URL directly to Gemini video understanding (`GEMINI_VIDEO_MODEL`,
default `gemini-3.5-flash`) and returns a compact artifact suitable for Notion.

## Command

```bash
node bin/understand-video.ts "<youtube-url>"
```

Options:
- `--dry-run` — validate the URL and print the plan without calling Gemini.

## Output (success)

```json
{ "ok": true, "url": "...", "title": "...", "summary": "...",
  "topics": ["..."], "estimatedWatchMinutes": 12 }
```

## Output (unsupported video, exit code 3)

Private/unlisted/unavailable videos return:

```json
{ "ok": false, "unsupported": true, "url": "...",
  "error": { "message": "...", "hint": "..." },
  "fallback": { "title": null, "useUrlOnly": true } }
```

When you see this, save a URL-only Notion bookmark with a short title derived from the URL.

## Notes

- YouTube URL input is a Gemini preview feature and supports **public** videos only.
- Invalid/non-YouTube URLs exit with code 1 and a plain hint.
- Requires `GEMINI_API_KEY`.
