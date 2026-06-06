import express from "express";
import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { GeminiLiveSession } from "./geminiLive.ts";
import { twilioToGemini, geminiToTwilio } from "./transcode.ts";
import { buildSystemInstruction } from "./prompt.ts";
import { buildTwiml, mediaStreamUrl, placeCall, hangupCall } from "./call.ts";
import { logEvent } from "../log.ts";

const GOODBYE_MARK = "goodbye";
const HANGUP_TIMEOUT_MS = 7000;

export interface DaemonConfig {
  geminiApiKey: string;
  geminiModel: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioFromNumber: string;
  webhookBaseUrl: string;
}

export interface CallEvent {
  ts: string;
  type: string;
  [k: string]: unknown;
}

interface CallSession {
  id: string;
  objective: string;
  status: "ringing" | "in_progress" | "ended";
  callSid?: string;
  streamSid?: string;
  ws?: WebSocket;
  gemini?: GeminiLiveSession;
  events: CallEvent[];
  lastListenIndex: number;
  transcriptBuf: { fred: string; agent: string };
  smsHandoff: boolean;
  handoffSummary: string | null;
  endedReason: string;
  pendingHangup: boolean;
  hangupTimer?: NodeJS.Timeout;
}

/**
 * Long-lived background daemon that manages voice-call sessions. The control
 * agent drives it over HTTP: `place` (start a call, returns immediately),
 * `listen` (pull new transcript/events since last call), `steer` (inject a
 * director note), `status`, `hangup`. Mirrors outreach-cli's init/listen model
 * so the agent never has to babysit a foreground process.
 */
export class CallDaemon {
  private app = express();
  private http: Server;
  private wss: WebSocketServer;
  private sessions = new Map<string, CallSession>();
  private readonly cfg: DaemonConfig;

  constructor(cfg: DaemonConfig) {
    this.cfg = cfg;
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: false }));

    this.app.get("/health", (_req, res) =>
      res.json({ status: "ok", calls: [...this.sessions.values()].filter((s) => s.status !== "ended").length }),
    );

    this.app.post("/place", (req, res) => {
      this.place(req.body as { objective?: string; to?: string }).then(
        (r) => res.json({ ok: true, ...r }),
        (err: unknown) =>
          res.status(502).json({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      );
    });

    this.app.get("/listen", (req, res) => {
      const s = this.sessions.get(String(req.query.id ?? this.latestId()));
      if (!s) return void res.status(404).json({ ok: false, error: "session_not_found" });
      const events = s.events.slice(s.lastListenIndex);
      s.lastListenIndex = s.events.length;
      res.json({ ok: true, id: s.id, status: s.status, events, smsHandoff: s.smsHandoff });
    });

    this.app.post("/steer", (req, res) => {
      const s = this.sessions.get(String((req.body as { id?: string }).id ?? this.latestId()));
      const note = String((req.body as { text?: unknown }).text ?? "").trim();
      if (!note) return void res.status(400).json({ ok: false, error: "text is required" });
      if (!s || !s.gemini) return void res.status(409).json({ ok: false, error: "no active call to steer" });
      if (s.status === "ended") return void res.status(409).json({ ok: false, error: "call_ended" });
      s.gemini.steer(note);
      this.emit(s, "steer_sent", { note });
      res.json({ ok: true, id: s.id, steered: note });
    });

    this.app.get("/status", (req, res) => {
      const s = this.sessions.get(String(req.query.id ?? this.latestId()));
      if (!s) return void res.status(404).json({ ok: false, error: "session_not_found" });
      res.json({
        ok: true,
        id: s.id,
        status: s.status,
        smsHandoff: s.smsHandoff,
        handoffSummary: s.handoffSummary,
        endedReason: s.status === "ended" ? s.endedReason : null,
      });
    });

    this.app.post("/hangup", (req, res) => {
      const s = this.sessions.get(String((req.body as { id?: string }).id ?? this.latestId()));
      if (!s) return void res.status(404).json({ ok: false, error: "session_not_found" });
      const { draining } = this.requestHangup(s);
      res.json({ ok: true, id: s.id, draining });
    });

    this.app.post("/call-status/:id", (req, res) => {
      const s = this.sessions.get(req.params.id);
      const status = String(req.body.CallStatus ?? "");
      if (s) {
        this.emit(s, "twilio_status", { callStatus: status });
        if (status === "completed" || status === "failed" || status === "no-answer") {
          this.finish(s, `twilio:${status}`);
        }
      }
      res.sendStatus(204);
    });

    this.http = createServer(this.app);
    this.wss = new WebSocketServer({ noServer: true });
    this.http.on("upgrade", (req, socket, head) => {
      if (req.url?.startsWith("/media-stream")) {
        this.wss.handleUpgrade(req, socket, head, (ws) => this.handleConnection(ws));
      } else {
        socket.destroy();
      }
    });
  }

  listen(port: number): Promise<void> {
    return new Promise((resolve) => this.http.listen(port, resolve));
  }

  private latestId(): string {
    let latest: CallSession | undefined;
    for (const s of this.sessions.values()) if (s.status !== "ended") latest = s;
    return latest?.id ?? "";
  }

  private emit(s: CallSession, type: string, data: Record<string, unknown> = {}): void {
    const event: CallEvent = { ts: new Date().toISOString(), type, ...data };
    s.events.push(event);
    logEvent(type, { id: s.id, ...data });
  }

  private async place(params: { objective?: string; to?: string }): Promise<{ id: string; callSid: string }> {
    const id = "call_" + randomBytes(4).toString("hex");
    const objective =
      params.objective ??
      "Check in with Fred, ask what's on his mind, and capture the YouTube-by-SMS handoff.";
    const to = params.to ?? process.env.DEMO_USER_PHONE ?? "";
    if (!to) throw new Error("No recipient: pass `to` or set DEMO_USER_PHONE.");

    const session: CallSession = {
      id,
      objective,
      status: "ringing",
      events: [],
      lastListenIndex: 0,
      transcriptBuf: { fred: "", agent: "" },
      smsHandoff: false,
      handoffSummary: null,
      endedReason: "unknown",
      pendingHangup: false,
    };
    this.sessions.set(id, session);

    // Pre-connect Gemini Live (warm) before the callee picks up.
    const gemini = new GeminiLiveSession({
      apiKey: this.cfg.geminiApiKey,
      model: this.cfg.geminiModel,
      systemInstruction: buildSystemInstruction(objective),
      callbacks: {
        onAudio: (b64) => this.sendAudioToTwilio(session, b64),
        onTranscript: (who, text) => {
          session.transcriptBuf[who] += text;
        },
        onTurnComplete: () => {
          this.flushTranscript(session);
          if (session.pendingHangup && session.ws) this.sendMark(session, GOODBYE_MARK);
        },
        onToolCall: (name, args, toolId) => this.handleTool(session, name, args, toolId),
        onClose: () => this.finish(session, "gemini-closed"),
      },
    });
    session.gemini = gemini;
    await gemini.connect();

    const wsUrl = mediaStreamUrl(this.cfg.webhookBaseUrl);
    const statusCallback = `${this.cfg.webhookBaseUrl.replace(/\/+$/, "")}/call-status/${id}`;
    const { sid } = await placeCall({
      accountSid: this.cfg.twilioAccountSid,
      authToken: this.cfg.twilioAuthToken,
      to,
      from: this.cfg.twilioFromNumber,
      twiml: buildTwiml(wsUrl, id),
      statusCallback,
    });
    session.callSid = sid;
    this.emit(session, "call_placed", { to, callSid: sid });
    return { id, callSid: sid };
  }

  private handleConnection(ws: WebSocket): void {
    ws.on("message", (raw) => {
      let msg: {
        event: string;
        start?: { streamSid: string; callSid: string; customParameters?: Record<string, string> };
        media?: { payload: string };
        mark?: { name?: string };
      };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.event === "start") {
        const id = msg.start?.customParameters?.callId ?? "";
        const s = this.sessions.get(id);
        if (!s) {
          ws.close();
          return;
        }
        s.ws = ws;
        s.streamSid = msg.start?.streamSid;
        s.callSid = msg.start?.callSid ?? s.callSid;
        s.status = "in_progress";
        this.emit(s, "call_started", { streamSid: s.streamSid });
        s.gemini?.greet();
        ws.on("close", () => this.flushTranscript(s));
        ws.on("message", (raw2) => this.handleTwilioMedia(s, raw2.toString()));
      }
    });
  }

  private handleTwilioMedia(s: CallSession, raw: string): void {
    let msg: { event: string; media?: { payload: string }; mark?: { name?: string } };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.event === "media" && msg.media?.payload) {
      s.gemini?.sendAudio(twilioToGemini(msg.media.payload));
    } else if (msg.event === "mark" && msg.mark?.name === GOODBYE_MARK) {
      void this.doHangup(s, "goodbye-played");
    } else if (msg.event === "stop") {
      this.finish(s, "twilio-stop");
    }
  }

  private sendAudioToTwilio(s: CallSession, base64Pcm24k: string): void {
    if (!s.ws || !s.streamSid || s.ws.readyState !== s.ws.OPEN) return;
    s.ws.send(
      JSON.stringify({ event: "media", streamSid: s.streamSid, media: { payload: geminiToTwilio(base64Pcm24k) } }),
    );
  }

  private sendMark(s: CallSession, name: string): void {
    if (!s.ws || !s.streamSid || s.ws.readyState !== s.ws.OPEN) return;
    s.ws.send(JSON.stringify({ event: "mark", streamSid: s.streamSid, mark: { name } }));
  }

  private handleTool(s: CallSession, name: string, args: Record<string, unknown>, toolId: string): void {
    if (name === "note_sms_handoff") {
      s.smsHandoff = true;
      s.handoffSummary = String(args.summary ?? "");
      this.emit(s, "sms_handoff_detected", { summary: s.handoffSummary });
      s.gemini?.respondToTool(toolId, name, { acknowledged: true });
    } else if (name === "end_call") {
      // Fred explicitly asked to hang up (the prompt forbids ending on objective
      // completion). Ack the tool, then drain any in-flight goodbye and hang up —
      // same path as an operator `hangup`, so a spoken goodbye isn't clipped.
      const reason = String(args.reason ?? "Fred asked to hang up");
      this.emit(s, "end_call_requested", { reason });
      s.gemini?.respondToTool(toolId, name, { ending: true });
      this.requestHangup(s);
    }
  }

  /**
   * Operator-initiated hangup. If the line is live, drain any in-flight audio
   * (e.g. a just-steered goodbye) behind a Twilio `mark` echo before tearing
   * down; otherwise hang up immediately. The agent never triggers this itself.
   */
  private requestHangup(s: CallSession): { draining: boolean } {
    if (s.status === "ended") return { draining: false };
    s.endedReason = "hangup-requested";
    if (s.ws && s.ws.readyState === s.ws.OPEN) {
      s.pendingHangup = true;
      this.sendMark(s, GOODBYE_MARK);
      s.hangupTimer = setTimeout(() => void this.doHangup(s, "drain-timeout"), HANGUP_TIMEOUT_MS);
      return { draining: true };
    }
    void this.doHangup(s, "hangup-requested");
    return { draining: false };
  }

  private async doHangup(s: CallSession, reason: string): Promise<void> {
    if (s.hangupTimer) clearTimeout(s.hangupTimer);
    s.hangupTimer = undefined;
    if (s.callSid) {
      try {
        await hangupCall(this.cfg.twilioAccountSid, this.cfg.twilioAuthToken, s.callSid);
      } catch {
        // call may already be ending
      }
    }
    this.finish(s, reason);
  }

  private flushTranscript(s: CallSession): void {
    for (const who of ["fred", "agent"] as const) {
      const text = s.transcriptBuf[who].trim();
      if (text) this.emit(s, "transcript", { who, text });
      s.transcriptBuf[who] = "";
    }
  }

  private finish(s: CallSession, reason: string): void {
    if (s.status === "ended") return;
    this.flushTranscript(s);
    s.status = "ended";
    if (s.endedReason === "unknown") s.endedReason = reason;
    s.gemini?.close();
    this.emit(s, "call_ended", { reason: s.endedReason, smsHandoff: s.smsHandoff });
  }
}
