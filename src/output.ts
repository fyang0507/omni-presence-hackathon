/** Shared CLI exit codes. */
export const EXIT = {
  SUCCESS: 0,
  INPUT_ERROR: 1,
  INFRA_ERROR: 2,
  UNSUPPORTED: 3,
} as const;

/** Print a machine-readable result for codex/claude code to parse. */
export function outputJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

/**
 * Print a structured error with a plain next-action hint and exit.
 * The hint is the operator-facing recovery step, never a secret.
 */
export function fail(code: number, message: string, hint?: string): never {
  outputJson({ ok: false, error: { message, hint: hint ?? null } });
  process.exit(code);
}

/** Wrap a CLI action so thrown errors become clean structured output. */
export function run(action: () => Promise<void>): void {
  action().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    const hint =
      err instanceof Error && "hint" in err ? String((err as { hint: unknown }).hint) : undefined;
    fail(EXIT.INFRA_ERROR, message, hint);
  });
}
