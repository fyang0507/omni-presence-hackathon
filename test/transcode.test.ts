import { test } from "node:test";
import assert from "node:assert/strict";
import { resample, twilioToGemini, geminiToTwilio } from "../src/voice/transcode.ts";

test("resample upsamples and downsamples to the expected length", () => {
  const input = Int16Array.from([0, 100, 200, 300]);
  assert.equal(resample(input, 8000, 16000).length, 8);
  assert.equal(resample(input, 24000, 8000).length, 1);
  assert.equal(resample(input, 8000, 8000), input); // identity
});

test("twilioToGemini upsamples mulaw 8k to PCM16 16k base64", () => {
  // 160 bytes of mulaw 8k (20ms frame) -> 320 samples PCM16 16k = 640 bytes.
  const mulaw = Buffer.alloc(160, 0xff).toString("base64");
  const out = Buffer.from(twilioToGemini(mulaw), "base64");
  assert.equal(out.byteLength, 640);
});

test("geminiToTwilio downsamples PCM16 24k to mulaw 8k base64", () => {
  // 240 samples PCM16 24k (10ms) -> 80 samples mulaw 8k = 80 bytes.
  const pcm = Buffer.alloc(240 * 2, 0).toString("base64");
  const out = Buffer.from(geminiToTwilio(pcm), "base64");
  assert.equal(out.byteLength, 80);
});
