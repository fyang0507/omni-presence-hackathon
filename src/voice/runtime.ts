import { readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { repoRoot } from "../config.ts";

export interface RuntimeState {
  pid: number;
  port: number;
  startedAt: string;
}

const runtimeDir = resolve(repoRoot, "logs");
const runtimePath = resolve(runtimeDir, "daemon.json");

export function writeRuntime(state: RuntimeState): void {
  mkdirSync(runtimeDir, { recursive: true });
  writeFileSync(runtimePath, JSON.stringify(state, null, 2));
}

export function readRuntime(): RuntimeState | null {
  if (!existsSync(runtimePath)) return null;
  try {
    return JSON.parse(readFileSync(runtimePath, "utf8")) as RuntimeState;
  } catch {
    return null;
  }
}

export function clearRuntime(): void {
  try {
    rmSync(runtimePath, { force: true });
  } catch {
    // best effort
  }
}

/** Base URL of the running daemon, honoring an explicit port override. */
export function daemonBaseUrl(portOverride?: number): string {
  const port = portOverride ?? readRuntime()?.port ?? 8080;
  return `http://127.0.0.1:${port}`;
}

/** True if the daemon answers /health. */
export async function daemonHealthy(portOverride?: number): Promise<boolean> {
  try {
    const res = await fetch(`${daemonBaseUrl(portOverride)}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export { runtimePath };
