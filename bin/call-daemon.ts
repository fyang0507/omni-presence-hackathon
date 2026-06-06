#!/usr/bin/env node
// Forked, detached daemon process. Not invoked directly — `call-fred init`
// spawns it. Reads PORT from env, serves the media-stream bridge + control API.
import { requireEnv } from "../src/config.ts";
import { CallDaemon } from "../src/voice/daemon.ts";
import { logEvent } from "../src/log.ts";

const env = requireEnv([
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "TWILIO_WEBHOOK_BASE_URL",
  "GEMINI_API_KEY",
  "GEMINI_LIVE_MODEL",
]);

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
const daemon = new CallDaemon({
  geminiApiKey: env.GEMINI_API_KEY,
  geminiModel: env.GEMINI_LIVE_MODEL,
  twilioAccountSid: env.TWILIO_ACCOUNT_SID,
  twilioAuthToken: env.TWILIO_AUTH_TOKEN,
  twilioFromNumber: env.TWILIO_FROM_NUMBER,
  webhookBaseUrl: env.TWILIO_WEBHOOK_BASE_URL,
});

await daemon.listen(port);
logEvent("daemon_started", { port });
process.stderr.write(`[call-daemon] listening on :${port}\n`);
