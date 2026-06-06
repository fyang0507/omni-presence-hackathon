import { GoogleGenAI, Type } from "@google/genai";

export interface VideoArtifact {
  title: string;
  summary: string;
  topics: string[];
  estimatedWatchMinutes: number | null;
}

export class UnsupportedVideoError extends Error {
  readonly hint: string;
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedVideoError";
    this.hint =
      "Gemini YouTube input supports public videos only. Fall back to saving a URL-only " +
      "Notion bookmark (save-technical-reading --title-from-url).";
  }
}

const PROMPT =
  "Watch this YouTube video and produce a concise reading/watch artifact. Return: a clear, " +
  "specific title (use the real video title if obvious), a 2-3 sentence summary, 3-6 key topics, " +
  "and your best estimate of watch time in whole minutes. Be accurate and compact.";

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    summary: { type: Type.STRING },
    topics: { type: Type.ARRAY, items: { type: Type.STRING } },
    estimatedWatchMinutes: { type: Type.NUMBER },
  },
  required: ["title", "summary", "topics"],
};

/** Parse the model's JSON into a validated artifact. Exported for tests. */
export function parseModelJson(raw: string): VideoArtifact {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    // Models sometimes wrap JSON in prose/fences — salvage the first object.
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Gemini returned non-JSON output: ${raw.slice(0, 160)}`);
    obj = JSON.parse(match[0]);
  }
  const o = obj as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title.trim() : "";
  if (!title) throw new Error("Gemini response missing a title.");
  const topics = Array.isArray(o.topics)
    ? o.topics.filter((t): t is string => typeof t === "string")
    : [];
  const mins = Number(o.estimatedWatchMinutes);
  return {
    title,
    summary: typeof o.summary === "string" ? o.summary.trim() : "",
    topics,
    estimatedWatchMinutes: Number.isFinite(mins) && mins > 0 ? Math.round(mins) : null,
  };
}

export interface UnderstandOptions {
  apiKey: string;
  model: string;
  /** Test seam: override the raw model call. */
  generate?: (url: string) => Promise<string>;
}

export async function understandVideo(url: string, opts: UnderstandOptions): Promise<VideoArtifact> {
  const generate =
    opts.generate ??
    (async (videoUrl: string) => {
      const ai = new GoogleGenAI({ apiKey: opts.apiKey });
      try {
        const res = await ai.models.generateContent({
          model: opts.model,
          contents: [
            {
              role: "user",
              parts: [{ fileData: { fileUri: videoUrl } }, { text: PROMPT }],
            },
          ],
          config: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
        });
        return res.text ?? "";
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/private|unlisted|not.*support|unavailable|forbidden|permission/i.test(msg)) {
          throw new UnsupportedVideoError(`Gemini could not access this video: ${msg}`);
        }
        throw err;
      }
    });
  const raw = await generate(url);
  return parseModelJson(raw);
}
