import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, "..");

let loaded = false;

/** Load .env from the repo root exactly once. Never echoes values. */
export function loadEnv(): void {
  if (loaded) return;
  loadDotenv({ path: resolve(repoRoot, ".env"), quiet: true });
  loaded = true;
}

export class ConfigError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        `Add them to ${resolve(repoRoot, ".env")} (see .env.example).`,
    );
    this.name = "ConfigError";
    this.missing = missing;
  }
}

/**
 * Validate and return only the env vars a command actually needs.
 * Throws a ConfigError listing every missing key. Never logs values.
 */
export function requireEnv<K extends string>(keys: readonly K[]): Record<K, string> {
  loadEnv();
  const out = {} as Record<K, string>;
  const missing: string[] = [];
  for (const key of keys) {
    const value = process.env[key];
    if (value === undefined || value.trim() === "") {
      missing.push(key);
    } else {
      out[key] = value;
    }
  }
  if (missing.length > 0) throw new ConfigError(missing);
  return out;
}

/** Read an optional env var with a fallback. */
export function optionalEnv(key: string, fallback = ""): string {
  loadEnv();
  const value = process.env[key];
  return value === undefined || value.trim() === "" ? fallback : value;
}
