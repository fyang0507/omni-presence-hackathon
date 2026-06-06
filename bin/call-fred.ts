#!/usr/bin/env node
import { Command } from "commander";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { requireEnv, optionalEnv } from "../src/config.ts";
import { run, outputJson, EXIT, fail } from "../src/output.ts";
import { buildSystemInstruction } from "../src/voice/prompt.ts";
import { buildTwiml, mediaStreamUrl } from "../src/voice/call.ts";
import {
  writeRuntime,
  readRuntime,
  clearRuntime,
  daemonBaseUrl,
  daemonHealthy,
} from "../src/voice/runtime.ts";

const here = dirname(fileURLToPath(import.meta.url));
const daemonEntry = resolve(here, "call-daemon.ts");
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const DEFAULT_OBJECTIVE =
  "Check in with Fred, ask what's on his mind, and capture the YouTube-by-SMS handoff.";

async function callDaemon(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  port?: number,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${daemonBaseUrl(port)}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).catch((err: unknown) => {
    fail(
      EXIT.INFRA_ERROR,
      `Cannot reach the call daemon: ${err instanceof Error ? err.message : String(err)}`,
      "Run `call-fred init` first (it starts the background daemon).",
    );
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

const program = new Command();
program
  .name("call-fred")
  .description(
    "Background voice daemon for the demo. `init` once, then `place` a call, `listen` for the " +
      "live transcript, and `steer` Gemini Live with director notes. No foreground process to babysit.",
  );

// --- init ----------------------------------------------------------------
program
  .command("init")
  .description("Start the background call daemon (idempotent).")
  .option("--port <number>", "Port for the bridge + control API", "8080")
  .action((opts: { port: string }) =>
    run(async () => {
      const port = Number.parseInt(opts.port, 10);
      // Fail fast on missing creds before forking a detached process.
      requireEnv([
        "TWILIO_ACCOUNT_SID",
        "TWILIO_AUTH_TOKEN",
        "TWILIO_FROM_NUMBER",
        "TWILIO_WEBHOOK_BASE_URL",
        "GEMINI_API_KEY",
        "GEMINI_LIVE_MODEL",
      ]);

      if (await daemonHealthy(port)) {
        const rt = readRuntime();
        outputJson({ ok: true, alreadyRunning: true, port, pid: rt?.pid ?? null });
        return;
      }

      // spawn (not fork) so there's no IPC channel keeping this launcher alive.
      const child = spawn(process.execPath, [daemonEntry], {
        detached: true,
        stdio: "ignore",
        env: { ...process.env, PORT: String(port) },
      });
      child.unref();

      // Poll /health until the daemon answers.
      for (let i = 0; i < 50; i++) {
        if (await daemonHealthy(port)) {
          writeRuntime({ pid: child.pid ?? -1, port, startedAt: new Date().toISOString() });
          outputJson({
            ok: true,
            started: true,
            pid: child.pid,
            port,
            mediaStreamUrl: mediaStreamUrl(optionalEnv("TWILIO_WEBHOOK_BASE_URL", "")),
            nextAction: "call-fred place --objective \"...\"",
          });
          return;
        }
        await sleep(200);
      }
      fail(EXIT.INFRA_ERROR, "Daemon did not become healthy in time.", "Check creds and port availability.");
    }),
  );

// --- place ---------------------------------------------------------------
program
  .command("place", { isDefault: true })
  .description("Place a call via the daemon. Returns immediately with a call id.")
  .option("--objective <text>", "What the call should accomplish", DEFAULT_OBJECTIVE)
  .option("--to <number>", "Override recipient (defaults to DEMO_USER_PHONE)")
  .option("--port <number>", "Daemon port", undefined)
  .option("--dry-run", "Print the call plan without placing a call", false)
  .action((opts: { objective: string; to?: string; port?: string; dryRun: boolean }) =>
    run(async () => {
      const port = opts.port ? Number.parseInt(opts.port, 10) : undefined;
      if (opts.dryRun) {
        const wsUrl = mediaStreamUrl(optionalEnv("TWILIO_WEBHOOK_BASE_URL", "https://<tunnel>"));
        outputJson({
          ok: true,
          dryRun: true,
          plan: {
            to: opts.to ?? optionalEnv("DEMO_USER_PHONE", "<DEMO_USER_PHONE>"),
            from: optionalEnv("TWILIO_FROM_NUMBER", "<TWILIO_FROM_NUMBER>"),
            objective: opts.objective,
            geminiModel: optionalEnv("GEMINI_LIVE_MODEL", "<GEMINI_LIVE_MODEL>"),
            mediaStreamUrl: wsUrl,
            twiml: buildTwiml(wsUrl, "call_<id>"),
            systemInstructionPreview: buildSystemInstruction(opts.objective).slice(0, 240) + "…",
          },
        });
        return;
      }
      const { status, json } = await callDaemon(
        "POST",
        "/place",
        { objective: opts.objective, to: opts.to },
        port,
      );
      if (status !== 200 || !json.ok) fail(EXIT.INFRA_ERROR, `place failed: ${json.error ?? status}`);
      outputJson({
        ok: true,
        id: json.id,
        callSid: json.callSid,
        nextAction: `call-fred listen --id ${json.id}  (poll until status:ended)`,
      });
    }),
  );

// --- listen --------------------------------------------------------------
program
  .command("listen")
  .description("Pull new transcript/events since the last listen (incremental).")
  .option("--id <id>", "Call id (defaults to the active call)")
  .option("--port <number>", "Daemon port", undefined)
  .option("--follow", "Keep polling and print NDJSON until the call ends", false)
  .action((opts: { id?: string; port?: string; follow: boolean }) =>
    run(async () => {
      const port = opts.port ? Number.parseInt(opts.port, 10) : undefined;
      const q = opts.id ? `?id=${encodeURIComponent(opts.id)}` : "";
      if (!opts.follow) {
        const { status, json } = await callDaemon("GET", `/listen${q}`, undefined, port);
        if (status !== 200) fail(EXIT.INFRA_ERROR, `listen failed: ${json.error ?? status}`);
        outputJson(json);
        return;
      }
      // Follow mode: stream events as NDJSON until the call ends.
      for (;;) {
        const { status, json } = await callDaemon("GET", `/listen${q}`, undefined, port);
        if (status !== 200) fail(EXIT.INFRA_ERROR, `listen failed: ${json.error ?? status}`);
        for (const ev of (json.events as unknown[]) ?? []) process.stdout.write(JSON.stringify(ev) + "\n");
        if (json.status === "ended") return;
        await sleep(1500);
      }
    }),
  );

// --- steer ---------------------------------------------------------------
program
  .command("steer")
  .description("Send a director note to the live call (Gemini phrases it in its own voice).")
  .argument("<text>", "The director note, e.g. \"confirm you'll watch it and wrap up\"")
  .option("--id <id>", "Call id (defaults to the active call)")
  .option("--port <number>", "Daemon port", undefined)
  .action((text: string, opts: { id?: string; port?: string }) =>
    run(async () => {
      const port = opts.port ? Number.parseInt(opts.port, 10) : undefined;
      const { status, json } = await callDaemon("POST", "/steer", { text, id: opts.id }, port);
      if (status !== 200 || !json.ok) fail(EXIT.INFRA_ERROR, `steer rejected: ${json.error ?? status}`);
      outputJson(json);
    }),
  );

// --- status --------------------------------------------------------------
program
  .command("status")
  .description("Show the current state of a call.")
  .option("--id <id>", "Call id (defaults to the active call)")
  .option("--port <number>", "Daemon port", undefined)
  .action((opts: { id?: string; port?: string }) =>
    run(async () => {
      const port = opts.port ? Number.parseInt(opts.port, 10) : undefined;
      const q = opts.id ? `?id=${encodeURIComponent(opts.id)}` : "";
      const { status, json } = await callDaemon("GET", `/status${q}`, undefined, port);
      if (status !== 200) fail(EXIT.INFRA_ERROR, `status failed: ${json.error ?? status}`);
      outputJson(json);
    }),
  );

// --- hangup --------------------------------------------------------------
program
  .command("hangup")
  .description("End the active call.")
  .option("--id <id>", "Call id (defaults to the active call)")
  .option("--port <number>", "Daemon port", undefined)
  .action((opts: { id?: string; port?: string }) =>
    run(async () => {
      const port = opts.port ? Number.parseInt(opts.port, 10) : undefined;
      const { status, json } = await callDaemon("POST", "/hangup", { id: opts.id }, port);
      if (status !== 200) fail(EXIT.INFRA_ERROR, `hangup failed: ${json.error ?? status}`);
      outputJson(json);
    }),
  );

// --- teardown ------------------------------------------------------------
program
  .command("teardown")
  .description("Stop the background daemon.")
  .action(() =>
    run(async () => {
      const rt = readRuntime();
      if (!rt) {
        outputJson({ ok: true, note: "No daemon runtime recorded." });
        return;
      }
      try {
        process.kill(rt.pid, "SIGTERM");
      } catch {
        // already gone
      }
      clearRuntime();
      outputJson({ ok: true, stopped: true, pid: rt.pid });
    }),
  );

program.parse();
