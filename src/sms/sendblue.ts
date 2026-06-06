const BASE_URL = "https://api.sendblue.co";

export interface SendblueCreds {
  keyId: string;
  secretKey: string;
}

export interface NormalizedMessage {
  date: string;
  content: string;
  fromNumber: string;
  toNumber: string;
  service: string;
  isOutbound: boolean;
  handle: string;
  raw: Record<string, unknown>;
}

function headers(creds: SendblueCreds): Record<string, string> {
  return {
    "sb-api-key-id": creds.keyId,
    "sb-api-secret-key": creds.secretKey,
    "Content-Type": "application/json",
  };
}

/** Compare phone numbers by their last 10 digits, tolerating formatting. */
export function samePhone(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\D/g, "").slice(-10);
  const na = norm(a);
  const nb = norm(b);
  return na !== "" && na === nb;
}

const YT_RE =
  /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?[^\s]*v=[\w-]+|shorts\/[\w-]+|live\/[\w-]+)|youtu\.be\/[\w-]+)[^\s]*/i;

/** Extract the first YouTube URL from free text, or null. */
export function extractYouTubeUrl(text: string): string | null {
  const m = text.match(YT_RE);
  return m ? m[0] : null;
}

/**
 * Detect a thumbs-up tapback. Sendblue surfaces it as a normal inbound
 * iMessage whose content begins with `Liked ` and quotes the approval text.
 */
export function isLikeTapback(content: string, approvalText: string): boolean {
  if (!/^liked\s/i.test(content.trim())) return false;
  if (!approvalText) return true;
  const needle = approvalText.slice(0, 24).toLowerCase();
  return content.toLowerCase().includes(needle);
}

export class SendblueClient {
  private readonly creds: SendblueCreds;
  constructor(creds: SendblueCreds) {
    this.creds = creds;
  }

  async sendMessage(params: {
    to: string;
    content: string;
    from?: string;
  }): Promise<{ handle: string; status: string; raw: Record<string, unknown> }> {
    const body: Record<string, unknown> = { number: params.to, content: params.content };
    if (params.from) body.from_number = params.from;
    const res = await fetch(`${BASE_URL}/api/send-message`, {
      method: "POST",
      headers: headers(this.creds),
      body: JSON.stringify(body),
    });
    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw withHint(
        new Error(`Sendblue send failed (${res.status}): ${JSON.stringify(raw)}`),
        "Check SENDBLUE_API_KEY_ID / SENDBLUE_API_SECRET_KEY and that the recipient is verified.",
      );
    }
    return {
      handle: String(raw.message_handle ?? ""),
      status: String(raw.status ?? "unknown"),
      raw,
    };
  }

  async listMessages(params: { number?: string; limit?: number } = {}): Promise<NormalizedMessage[]> {
    const url = new URL(`${BASE_URL}/api/v2/messages`);
    if (params.number) url.searchParams.set("number", params.number);
    url.searchParams.set("limit", String(params.limit ?? 25));
    const res = await fetch(url, { headers: headers(this.creds) });
    const raw = (await res.json().catch(() => ({}))) as unknown;
    if (!res.ok) {
      throw withHint(
        new Error(`Sendblue messages fetch failed (${res.status}): ${JSON.stringify(raw)}`),
        "Verify Sendblue API credentials and account access.",
      );
    }
    // Sendblue v2 wraps the list under `data`; older shapes used `messages` or a bare array.
    const obj = (raw ?? {}) as { data?: unknown; messages?: unknown };
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray(obj.data)
        ? obj.data
        : Array.isArray(obj.messages)
          ? obj.messages
          : [];
    return (list as Array<Record<string, unknown>>).map(normalize);
  }
}

function normalize(m: Record<string, unknown>): NormalizedMessage {
  const fromNumber = String(m.from_number ?? m.number ?? "");
  return {
    date: String(m.date_sent ?? m.date ?? m.date_updated ?? ""),
    content: String(m.content ?? ""),
    fromNumber,
    toNumber: String(m.to_number ?? ""),
    service: String(m.service ?? ""),
    isOutbound: Boolean(m.is_outbound),
    handle: String(m.message_handle ?? ""),
    raw: m,
  };
}

function withHint(err: Error, hint: string): Error {
  (err as Error & { hint?: string }).hint = hint;
  return err;
}

/** Resolve after ms; cancellable-free helper for polling loops. */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** msSince a timestamp; messages older than `sinceIso` are ignored when polling. */
export function isAfter(dateIso: string, sinceIso: string): boolean {
  if (!sinceIso) return true;
  const d = Date.parse(dateIso);
  const s = Date.parse(sinceIso);
  if (Number.isNaN(d) || Number.isNaN(s)) return true;
  return d >= s;
}
