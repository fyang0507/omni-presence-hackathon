#!/usr/bin/env node
import { Command } from "commander";
import { requireEnv, optionalEnv } from "../src/config.ts";
import { run, outputJson, fail, EXIT } from "../src/output.ts";
import { logEvent } from "../src/log.ts";
import {
  createClient,
  retrieveSchema,
  resolveProps,
  ensureReadingSchema,
  buildPageRequest,
  createPage,
  type ReadingArtifact,
} from "../src/notion/client.ts";

function readingEnv() {
  return requireEnv(["NOTION_API_KEY", "TECHNICAL_READING_DATA_SOURCE_ID"]);
}

const program = new Command();
program
  .name("save-technical-reading")
  .description("Save a video artifact into the target Notion Technical Reading database.");

// --- preflight -----------------------------------------------------------
program
  .command("preflight")
  .description("Check Notion access and show which target/properties will be used.")
  .action(() =>
    run(async () => {
      const env = readingEnv();
      const client = createClient(env.NOTION_API_KEY);
      const schema = await retrieveSchema(client, env.TECHNICAL_READING_DATA_SOURCE_ID);
      const resolved = resolveProps(schema);
      outputJson({
        ok: true,
        ready: Boolean(resolved.titleProp),
        target: { id: schema.id, title: schema.title, kind: schema.kind },
        mappedProperties: resolved,
        notionUrl: optionalEnv("NOTION_TECHNICAL_READING_URL") || null,
      });
    }),
  );

// --- bootstrap -----------------------------------------------------------
program
  .command("bootstrap")
  .description("Add the Status + Expected Reading Time properties to an empty target data source (idempotent).")
  .option("--dry-run", "Show what would be added without writing", false)
  .action((opts: { dryRun: boolean }) =>
    run(async () => {
      const env = readingEnv();
      const client = createClient(env.NOTION_API_KEY);
      const schema = await retrieveSchema(client, env.TECHNICAL_READING_DATA_SOURCE_ID);
      const resolved = resolveProps(schema);
      const missing: string[] = [];
      if (!resolved.statusProp) missing.push("Status");
      if (!resolved.readingProp) missing.push("Expected Reading Time");
      if (opts.dryRun) {
        outputJson({
          ok: true,
          dryRun: true,
          target: { id: schema.id, title: schema.title, kind: schema.kind },
          existingProps: schema.properties,
          wouldAdd: missing,
        });
        return;
      }
      const result = await ensureReadingSchema(client, env.TECHNICAL_READING_DATA_SOURCE_ID);
      const after = resolveProps(await retrieveSchema(client, env.TECHNICAL_READING_DATA_SOURCE_ID));
      outputJson({
        ok: true,
        target: { id: schema.id, title: schema.title },
        added: result.added,
        mappedProperties: after,
        ready: Boolean(after.titleProp),
      });
    }),
  );

// --- save (default) ------------------------------------------------------
program
  .command("save", { isDefault: true })
  .description("Create the Technical Reading row.")
  .argument("<youtube-url>", "Source URL (stored in the page body)")
  .option("--title <text>", "Page title (defaults to a placeholder if omitted)")
  .option("--notes <text>", "Compact video-understanding note for the page body")
  .option("--reading-minutes <n>", "Expected reading/watch time in minutes")
  .option("--status <text>", "Status value", "Not started")
  .option("--dry-run", "Print a secret-free write preview without creating the page", false)
  .action(
    (
      url: string,
      opts: {
        title?: string;
        notes?: string;
        readingMinutes?: string;
        status: string;
        dryRun: boolean;
      },
    ) =>
      run(async () => {
        const env = readingEnv();
        const client = createClient(env.NOTION_API_KEY);
        const schema = await retrieveSchema(client, env.TECHNICAL_READING_DATA_SOURCE_ID);

        const artifact: ReadingArtifact = {
          title: opts.title?.trim() || "Untitled YouTube video",
          url,
          status: opts.status,
          readingMinutes: opts.readingMinutes ? Number.parseInt(opts.readingMinutes, 10) : null,
          notes: opts.notes ?? null,
        };
        const body = buildPageRequest(schema, artifact);

        if (opts.dryRun) {
          outputJson({
            ok: true,
            dryRun: true,
            target: { id: schema.id, title: schema.title },
            request: body,
          });
          return;
        }

        const page = await createPage(client, body);
        logEvent("notion_saved", { title: artifact.title, pageUrl: page.url });
        if (!page.url) {
          fail(EXIT.INFRA_ERROR, "Notion page created but returned no URL.", "Check the database in Notion.");
        }
        outputJson({ ok: true, title: artifact.title, pageId: page.id, pageUrl: page.url });
      }),
  );

program.parse();
