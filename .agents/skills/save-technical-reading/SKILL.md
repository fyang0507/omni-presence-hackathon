---
name: save-technical-reading
description: Save a video artifact into the target Notion Technical Reading database, with a preflight and dry-run.
---

# save-technical-reading

Creates one row in the target Notion Technical Reading data source. Discovers the live schema
first, maps onto the title / status / reading-time properties, stores the source URL as a
bookmark block in the page body, and returns the new page URL.

## Commands

Preflight (does Notion accept the credentials, and what target/properties will be used):

```bash
node bin/save-technical-reading.ts preflight
```

Save:

```bash
node bin/save-technical-reading.ts "<youtube-url>" \
  --title "<title>" --notes "<one-line summary>" --reading-minutes <n>
```

Options:
- `--title <text>` — page title (Gemini-derived; falls back to a placeholder).
- `--notes <text>` — compact video-understanding note, added as a paragraph block.
- `--reading-minutes <n>` — sets the number property if the schema has one.
- `--status <text>` — defaults to `Not started`.
- `--dry-run` — print the secret-free `pages.create` request preview without writing.

## Output

```json
{ "ok": true, "title": "...", "pageId": "...", "pageUrl": "https://www.notion.so/..." }
```

## Notes

- Uses `TECHNICAL_READING_DATA_SOURCE_ID` (live value on 2026-06-06:
  `3619782c-4f4a-804a-9670-000be28dec1a`) and writes with `parent.data_source_id` (newer Notion
  API; falls back to `database_id` if the schema is a classic database).
- The source URL is the durable artifact — stored as a bookmark block in the page body.
- Requires `NOTION_API_KEY` and `TECHNICAL_READING_DATA_SOURCE_ID`.
