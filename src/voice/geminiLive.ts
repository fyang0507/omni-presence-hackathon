import { GoogleGenAI, Modality, Type } from "@google/genai";
import type { LiveServerMessage, Session, FunctionCall, Tool } from "@google/genai";

export interface GeminiLiveCallbacks {
  onAudio: (base64Pcm24k: string) => void;
  onTranscript: (who: "fred" | "agent", text: string) => void;
  onToolCall: (name: string, args: Record<string, unknown>, id: string) => void;
  onTurnComplete?: () => void;
  onClose?: () => void;
}

export interface GeminiLiveOptions {
  apiKey: string;
  model: string;
  systemInstruction: string;
  callbacks: GeminiLiveCallbacks;
}

/**
 * Tools the agent can call. Only `note_sms_handoff` — the agent never hangs up
 * on its own; Fred decides when the call ends and the operator drives `hangup`.
 */
const TOOLS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "note_sms_handoff",
        description:
          "Call this the moment Fred says he will send (or has sent) a YouTube link by SMS/text. " +
          "This tells the system to start monitoring the SMS channel.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: "One short line describing what Fred asked you to do.",
            },
          },
          required: ["summary"],
        },
      },
    ],
  },
];

/** Thin wrapper over a Gemini Live WSS session for the phone bridge. */
export class GeminiLiveSession {
  private session: Session | undefined;
  private closed = false;
  private readonly opts: GeminiLiveOptions;

  constructor(opts: GeminiLiveOptions) {
    this.opts = opts;
  }

  async connect(): Promise<void> {
    const ai = new GoogleGenAI({ apiKey: this.opts.apiKey });
    this.session = await ai.live.connect({
      model: this.opts.model,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: this.opts.systemInstruction,
        tools: TOOLS,
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
      callbacks: {
        onopen: () => {},
        onmessage: (msg: LiveServerMessage) => this.handleMessage(msg),
        onerror: (e: unknown) =>
          process.stderr.write(
            `[gemini-live] error: ${(e as { message?: string })?.message ?? "unknown"}\n`,
          ),
        onclose: () => {
          if (!this.closed) {
            this.closed = true;
            this.opts.callbacks.onClose?.();
          }
        },
      },
    });
  }

  private handleMessage(msg: LiveServerMessage): void {
    const parts = msg.serverContent?.modelTurn?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data && part.inlineData.mimeType?.startsWith("audio/")) {
        this.opts.callbacks.onAudio(part.inlineData.data);
      }
    }
    const inText = msg.serverContent?.inputTranscription?.text;
    if (inText) this.opts.callbacks.onTranscript("fred", inText);
    const outText = msg.serverContent?.outputTranscription?.text;
    if (outText) this.opts.callbacks.onTranscript("agent", outText);
    if (msg.serverContent?.turnComplete) this.opts.callbacks.onTurnComplete?.();
    for (const fc of msg.toolCall?.functionCalls ?? ([] as FunctionCall[])) {
      if (fc.name && fc.id) {
        this.opts.callbacks.onToolCall(fc.name, (fc.args as Record<string, unknown>) ?? {}, fc.id);
      }
    }
  }

  /** Push inbound caller audio (base64 PCM16 16 kHz) to Gemini. */
  sendAudio(base64Pcm16k: string): void {
    if (!this.session || this.closed) return;
    this.session.sendRealtimeInput({
      audio: { data: base64Pcm16k, mimeType: "audio/pcm;rate=16000" },
    });
  }

  /**
   * Steer the live conversation with a director note on the realtime text
   * channel. Gemini folds this into the ongoing audio turn and rephrases it in
   * its own voice — no turn barrier, no separate voice agent.
   */
  steer(note: string): void {
    if (!this.session || this.closed) return;
    this.session.sendRealtimeInput({ text: note });
  }

  /** Greet first so Fred hears the agent on pickup. */
  greet(): void {
    if (!this.session || this.closed) return;
    this.session.sendClientContent({
      turns: [{ role: "user", parts: [{ text: "(The call just connected. Greet Fred now.)" }] }],
      turnComplete: true,
    });
  }

  respondToTool(id: string, name: string, result: Record<string, unknown>): void {
    if (!this.session || this.closed) return;
    this.session.sendToolResponse({ functionResponses: [{ id, name, response: result }] });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.session?.close();
    } catch {
      // already gone
    }
  }
}
