import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeYouTubeUrl,
  parseModelJson,
  understandVideo,
  UnsupportedVideoError,
} from "../src/video/gemini.ts";

test("parseModelJson reads a clean response", () => {
  const a = parseModelJson(
    JSON.stringify({
      title: "How Transformers Work",
      summary: "A clear intro.",
      topics: ["attention", "embeddings"],
      estimatedWatchMinutes: 12,
    }),
  );
  assert.equal(a.title, "How Transformers Work");
  assert.deepEqual(a.topics, ["attention", "embeddings"]);
  assert.equal(a.estimatedWatchMinutes, 12);
});

test("parseModelJson salvages JSON wrapped in prose/fences", () => {
  const raw = "Sure!\n```json\n{\"title\":\"X\",\"summary\":\"s\",\"topics\":[]}\n```";
  const a = parseModelJson(raw);
  assert.equal(a.title, "X");
  assert.equal(a.estimatedWatchMinutes, null);
});

test("parseModelJson throws on missing title and on non-JSON", () => {
  assert.throws(() => parseModelJson(JSON.stringify({ summary: "no title" })));
  assert.throws(() => parseModelJson("totally not json"));
});

test("normalizeYouTubeUrl removes tracking params before Gemini sees the URL", () => {
  assert.equal(
    normalizeYouTubeUrl("https://www.youtube.com/watch?v=v1ATn30ybBs&pp=ygUJYmV0YXdvcmtz"),
    "https://www.youtube.com/watch?v=v1ATn30ybBs",
  );
  assert.equal(
    normalizeYouTubeUrl("https://youtu.be/v1ATn30ybBs?si=abc."),
    "https://www.youtube.com/watch?v=v1ATn30ybBs",
  );
});

test("understandVideo uses the injected generate seam (happy path)", async () => {
  let seenUrl = "";
  const artifact = await understandVideo("https://youtu.be/abc", {
    apiKey: "test",
    model: "gemini-3.5-flash",
    generate: async (url) => {
      seenUrl = url;
      return JSON.stringify({ title: "T", summary: "s", topics: ["a"], estimatedWatchMinutes: 5 });
    },
  });
  assert.equal(artifact.title, "T");
  assert.equal(seenUrl, "https://www.youtube.com/watch?v=abc");
});

test("understandVideo propagates UnsupportedVideoError from the generate seam", async () => {
  await assert.rejects(
    understandVideo("https://youtu.be/private", {
      apiKey: "test",
      model: "gemini-3.5-flash",
      generate: async () => {
        throw new UnsupportedVideoError("Gemini could not access this video: private");
      },
    }),
    UnsupportedVideoError,
  );
});
