#!/usr/bin/env node
import { Command } from "commander";
import { requireEnv, optionalEnv } from "../src/config.ts";
import { run, outputJson, fail, EXIT } from "../src/output.ts";
import { logEvent } from "../src/log.ts";
import {
  SendblueClient,
  extractYouTubeUrl,
  isLikeTapback,
  samePhone,
  isAfter,
  sleep,
  type SendblueCreds,
} from "../src/sms/sendblue.ts";

function creds(): SendblueCreds {
  const env = requireEnv(["SENDBLUE_API_KEY_ID", "SENDBLUE_API_SECRET_KEY"]);
  return { keyId: env.SENDBLUE_API_KEY_ID, secretKey: env.SENDBLUE_API_SECRET_KEY };
}

function defaultTo(): string {
  return optionalEnv("DEMO_USER_PHONE") || optionalEnv("SENDBLUE_DEFAULT_TO");
}

const program = new Command();
program
  .name("sendblue-api")
  .description("Thin Sendblue API helper: send status messages, read inbound links, gate on tapback.");

// --- preflight -----------------------------------------------------------
program
  .command("preflight")
  .description("Confirm Sendblue credentials, sender number, and verified recipient.")
  .option("--dry-run", "Show the config without calling Sendblue", false)
  .action((opts: { dryRun: boolean }) =>
    run(async () => {
      const from = optionalEnv("SENDBLUE_FROM_NUMBER");
      const to = defaultTo();
      if (opts.dryRun) {
        outputJson({ ok: true, dryRun: true, from, to, credentials: "present-if-set" });
        return;
      }
      const client = new SendblueClient(creds());
      const messages = await client.listMessages({ limit: 1 });
      outputJson({
        ok: true,
        from,
        to,
        recentMessageCount: messages.length,
        note: "Credentials accepted by Sendblue.",
      });
    }),
  );

// --- send ----------------------------------------------------------------
program
  .command("send")
  .description("Send an SMS/iMessage status update.")
  .argument("[to]", "Recipient number (defaults to DEMO_USER_PHONE)")
  .argument("[message]", "Message text (if `to` is omitted, pass the message as the only argument)")
  .option("--dry-run", "Print the message without sending", false)
  .action((toArg: string | undefined, messageArg: string | undefined, opts: { dryRun: boolean }) =>
    run(async () => {
      // Accept both `send "<message>"` and `send +1555... "<message>"`.
      const to = toArg && toArg.startsWith("+") ? toArg : defaultTo();
      const realMessage = toArg && !toArg.startsWith("+") ? toArg : messageArg;
      const from = optionalEnv("SENDBLUE_FROM_NUMBER") || undefined;
      if (!to) fail(EXIT.INPUT_ERROR, "No recipient given and DEMO_USER_PHONE is unset.");
      if (!realMessage) fail(EXIT.INPUT_ERROR, "No message text given.", 'Usage: sendblue-api send [to] "<message>"');
      if (opts.dryRun) {
        outputJson({ ok: true, dryRun: true, to, from, content: realMessage });
        return;
      }
      const client = new SendblueClient(creds());
      const sent = await client.sendMessage({ to, content: realMessage, from });
      logEvent("sms_sent", { to, handle: sent.handle, status: sent.status });
      outputJson({ ok: true, to, handle: sent.handle, status: sent.status });
    }),
  );

// --- messages ------------------------------------------------------------
program
  .command("messages")
  .description("List recent messages.")
  .option("--inbound", "Only inbound messages", false)
  .option("--from <number>", "Filter to a sender (defaults to DEMO_USER_PHONE)")
  .option("--limit <n>", "Max messages", "25")
  .action((opts: { inbound: boolean; from?: string; limit: string }) =>
    run(async () => {
      const client = new SendblueClient(creds());
      const filterNum = opts.from ?? defaultTo();
      let messages = await client.listMessages({ limit: Number.parseInt(opts.limit, 10) });
      if (opts.inbound) messages = messages.filter((m) => !m.isOutbound);
      if (filterNum) messages = messages.filter((m) => samePhone(m.fromNumber, filterNum));
      outputJson({
        ok: true,
        count: messages.length,
        messages: messages.map((m) => ({
          date: m.date,
          from: m.fromNumber,
          service: m.service,
          isOutbound: m.isOutbound,
          handle: m.handle,
          content: m.content,
        })),
      });
    }),
  );

// --- wait-for-link -------------------------------------------------------
program
  .command("wait-for-link")
  .description("Poll inbound messages until Fred sends a YouTube URL.")
  .option("--from <number>", "Expected sender (defaults to DEMO_USER_PHONE)")
  .option("--since <iso>", "Ignore messages before this timestamp", new Date().toISOString())
  .option("--timeout <seconds>", "Give up after N seconds", "180")
  .option("--interval <seconds>", "Poll interval", "4")
  .action((opts: { from?: string; since: string; timeout: string; interval: string }) =>
    run(async () => {
      const client = new SendblueClient(creds());
      const from = opts.from ?? defaultTo();
      const deadline = Date.now() + Number.parseInt(opts.timeout, 10) * 1000;
      const intervalMs = Number.parseInt(opts.interval, 10) * 1000;
      logEvent("waiting_for_link", { from, since: opts.since });
      while (Date.now() < deadline) {
        const messages = await client.listMessages({ limit: 25 });
        for (const m of messages) {
          if (m.isOutbound) continue;
          if (from && !samePhone(m.fromNumber, from)) continue;
          if (!isAfter(m.date, opts.since)) continue;
          const url = extractYouTubeUrl(m.content);
          if (url) {
            logEvent("link_received", { url, from: m.fromNumber });
            outputJson({ ok: true, url, from: m.fromNumber, date: m.date, handle: m.handle });
            return;
          }
        }
        await sleep(intervalMs);
      }
      fail(
        EXIT.INFRA_ERROR,
        "Timed out waiting for a YouTube link.",
        "Ask Fred to (re)send the link, then re-run wait-for-link with an earlier --since.",
      );
    }),
  );

// --- wait-for-tapback ----------------------------------------------------
program
  .command("wait-for-tapback")
  .description("Poll for a thumbs-up tapback (with `reply yes` fallback) on the approval message.")
  .option("--approval-text <text>", "Text of the approval message to match the Liked quote", "")
  .option("--from <number>", "Expected sender (defaults to DEMO_USER_PHONE)")
  .option("--since <iso>", "Ignore messages before this timestamp", new Date().toISOString())
  .option("--timeout <seconds>", "Give up after N seconds", "180")
  .option("--interval <seconds>", "Poll interval", "4")
  .action(
    (opts: {
      approvalText: string;
      from?: string;
      since: string;
      timeout: string;
      interval: string;
    }) =>
      run(async () => {
        const client = new SendblueClient(creds());
        const from = opts.from ?? defaultTo();
        const deadline = Date.now() + Number.parseInt(opts.timeout, 10) * 1000;
        const intervalMs = Number.parseInt(opts.interval, 10) * 1000;
        logEvent("waiting_for_tapback", { from, since: opts.since });
        while (Date.now() < deadline) {
          const messages = await client.listMessages({ limit: 25 });
          for (const m of messages) {
            if (m.isOutbound) continue;
            if (from && !samePhone(m.fromNumber, from)) continue;
            if (!isAfter(m.date, opts.since)) continue;
            const content = m.content.trim();
            if (isLikeTapback(content, opts.approvalText)) {
              logEvent("tapback_approved", { via: "tapback", content });
              outputJson({ ok: true, approved: true, via: "tapback", content, date: m.date });
              return;
            }
            if (/^(yes|yep|yeah|approve(d)?|do it|save it)\b/i.test(content)) {
              logEvent("tapback_approved", { via: "reply", content });
              outputJson({ ok: true, approved: true, via: "reply", content, date: m.date });
              return;
            }
          }
          await sleep(intervalMs);
        }
        fail(
          EXIT.INFRA_ERROR,
          "Timed out waiting for thumbs-up approval.",
          "Ask Fred to tapback thumbs-up on the approval message, or reply 'yes'.",
        );
      }),
  );

program.parse();
