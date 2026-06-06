#!/usr/bin/env node
import { Command } from "commander";
import { requireEnv, optionalEnv } from "../src/config.ts";
import { run, outputJson, fail, EXIT } from "../src/output.ts";
import { logEvent } from "../src/log.ts";
import { understandVideo, UnsupportedVideoError } from "../src/video/gemini.ts";
import { extractYouTubeUrl } from "../src/sms/sendblue.ts";

const program = new Command();
program
  .name("understand-video")
  .description("Turn a public YouTube URL into a concise reading/watch artifact via Gemini.")
  .argument("<youtube-url>", "Public YouTube URL")
  .option("--dry-run", "Validate the URL and print the plan without calling Gemini", false)
  .action((url: string, opts: { dryRun: boolean }) =>
    run(async () => {
      if (!extractYouTubeUrl(url)) {
        fail(
          EXIT.INPUT_ERROR,
          `Not a recognized YouTube URL: ${url}`,
          "Pass a public youtube.com/watch, youtu.be, or youtube.com/shorts URL.",
        );
      }
      const model = optionalEnv("GEMINI_VIDEO_MODEL", "gemini-3.5-flash");
      if (opts.dryRun) {
        outputJson({ ok: true, dryRun: true, url, model });
        return;
      }
      const env = requireEnv(["GEMINI_API_KEY"]);
      logEvent("understand_video_started", { url, model });
      try {
        const artifact = await understandVideo(url, { apiKey: env.GEMINI_API_KEY, model });
        logEvent("understand_video_finished", { title: artifact.title });
        outputJson({ ok: true, url, ...artifact });
      } catch (err) {
        if (err instanceof UnsupportedVideoError) {
          logEvent("understand_video_unsupported", { url });
          outputJson({
            ok: false,
            unsupported: true,
            url,
            error: { message: err.message, hint: err.hint },
            fallback: { title: null, useUrlOnly: true },
          });
          process.exit(EXIT.UNSUPPORTED);
        }
        throw err;
      }
    }),
  );

program.parse();
