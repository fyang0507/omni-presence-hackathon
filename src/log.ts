import { appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { repoRoot } from "./config.ts";

const logDir = resolve(repoRoot, "logs");
const eventLogPath = resolve(logDir, "demo-events.jsonl");

/** Keys whose values must never be written to the shared event log. */
const SECRET_HINTS = ["key", "secret", "token", "auth", "password", "credential"];

function redact(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    const lower = k.toLowerCase();
    if (SECRET_HINTS.some((h) => lower.includes(h))) {
      out[k] = "<redacted>";
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Append a structured demo-evidence event to logs/demo-events.jsonl and echo a
 * compact line to stderr. Secret-looking fields are redacted.
 */
export function logEvent(type: string, data: Record<string, unknown> = {}): void {
  const event = { ts: new Date().toISOString(), type, ...redact(data) };
  try {
    mkdirSync(logDir, { recursive: true });
    appendFileSync(eventLogPath, JSON.stringify(event) + "\n");
  } catch {
    // Evidence logging is best-effort; never fail the command on a log write.
  }
  process.stderr.write(`[event] ${type}\n`);
}

export { eventLogPath };
