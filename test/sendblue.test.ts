import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractYouTubeUrl,
  isLikeTapback,
  samePhone,
  isAfter,
} from "../src/sms/sendblue.ts";

test("extractYouTubeUrl finds common YouTube link shapes", () => {
  assert.equal(
    extractYouTubeUrl("here it is https://www.youtube.com/watch?v=dQw4w9WgXcQ thanks"),
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  );
  assert.equal(extractYouTubeUrl("https://youtu.be/dQw4w9WgXcQ"), "https://youtu.be/dQw4w9WgXcQ");
  assert.equal(
    extractYouTubeUrl("check https://youtube.com/shorts/abc123XYZ_"),
    "https://youtube.com/shorts/abc123XYZ_",
  );
  assert.equal(extractYouTubeUrl("no link here"), null);
  assert.equal(extractYouTubeUrl("https://vimeo.com/12345"), null);
});

test("isLikeTapback matches a Liked quote of the approval text", () => {
  const approval = "I found: How Claude Code Works. Tapback thumbs-up to save it to Notion.";
  assert.equal(isLikeTapback(`Liked “${approval}”`, approval), true);
  assert.equal(isLikeTapback("Liked an image", approval), false); // doesn't quote approval
  assert.equal(isLikeTapback("yes please", approval), false);
});

test("samePhone compares by last 10 digits", () => {
  assert.equal(samePhone("+15555550199", "5555550199"), true);
  assert.equal(samePhone("(555) 555-0199", "+1 555 555 0199"), true);
  assert.equal(samePhone("+15555550199", "+15555550100"), false);
  assert.equal(samePhone("", "5555550199"), false);
});

test("isAfter tolerates missing/invalid timestamps", () => {
  assert.equal(isAfter("2026-06-06T12:00:00Z", "2026-06-06T11:00:00Z"), true);
  assert.equal(isAfter("2026-06-06T10:00:00Z", "2026-06-06T11:00:00Z"), false);
  assert.equal(isAfter("garbage", "2026-06-06T11:00:00Z"), true);
  assert.equal(isAfter("2026-06-06T10:00:00Z", ""), true);
});
