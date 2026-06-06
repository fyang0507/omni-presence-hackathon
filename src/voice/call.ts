import twilio from "twilio";

export interface PlaceCallParams {
  accountSid: string;
  authToken: string;
  to: string;
  from: string;
  twiml: string;
  statusCallback?: string;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === '"' ? "&quot;" : "&apos;",
  );
}

/** Build inline TwiML that opens a bidirectional Media Stream to our WSS bridge. */
export function buildTwiml(wsUrl: string, callId: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response><Connect><Stream url="${escapeXml(wsUrl)}">` +
    `<Parameter name="callId" value="${escapeXml(callId)}" />` +
    `</Stream></Connect></Response>`
  );
}

/** Derive the wss://.../media-stream URL from an https webhook base. */
export function mediaStreamUrl(webhookBase: string): string {
  const host = webhookBase.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `wss://${host}/media-stream`;
}

export async function placeCall(p: PlaceCallParams): Promise<{ sid: string }> {
  const client = twilio(p.accountSid, p.authToken);
  const call = await client.calls.create({
    to: p.to,
    from: p.from,
    twiml: p.twiml,
    ...(p.statusCallback
      ? {
          statusCallback: p.statusCallback,
          statusCallbackEvent: ["ringing", "answered", "completed"],
        }
      : {}),
  });
  return { sid: call.sid };
}

export async function hangupCall(
  accountSid: string,
  authToken: string,
  callSid: string,
): Promise<void> {
  const client = twilio(accountSid, authToken);
  await client.calls(callSid).update({ status: "completed" });
}
