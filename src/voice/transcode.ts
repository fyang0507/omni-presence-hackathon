import alawmulaw from "alawmulaw";

const { mulaw } = alawmulaw;

/** Linear-interpolation resampler. Stateless per chunk — fine for streaming. */
export function resample(input: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate) return input;
  const outputLen = Math.round(input.length * (toRate / fromRate));
  const output = new Int16Array(outputLen);
  const ratio = fromRate / toRate;
  const lastIdx = input.length - 1;
  for (let i = 0; i < outputLen; i++) {
    const srcPos = i * ratio;
    const idx = Math.floor(srcPos);
    if (idx >= lastIdx) {
      output[i] = input[lastIdx] ?? 0;
    } else {
      const frac = srcPos - idx;
      output[i] = Math.round(input[idx]! + frac * (input[idx + 1]! - input[idx]!));
    }
  }
  return output;
}

/** Inbound: Twilio base64 mulaw 8 kHz -> Gemini base64 PCM16 16 kHz. */
export function twilioToGemini(base64Mulaw8k: string): string {
  const mulawBuf = Buffer.from(base64Mulaw8k, "base64");
  const mulawBytes = new Uint8Array(mulawBuf.buffer, mulawBuf.byteOffset, mulawBuf.byteLength);
  const pcm8k = mulaw.decode(mulawBytes);
  const pcm16k = resample(pcm8k, 8000, 16000);
  return Buffer.from(pcm16k.buffer, pcm16k.byteOffset, pcm16k.byteLength).toString("base64");
}

/** Outbound: Gemini base64 PCM16 24 kHz -> Twilio base64 mulaw 8 kHz. */
export function geminiToTwilio(base64Pcm24k: string): string {
  const pcmBuf = Buffer.from(base64Pcm24k, "base64");
  const pcm24k = new Int16Array(pcmBuf.buffer, pcmBuf.byteOffset, Math.floor(pcmBuf.byteLength / 2));
  const pcm8k = resample(pcm24k, 24000, 8000);
  const mulawBytes = mulaw.encode(pcm8k);
  return Buffer.from(mulawBytes.buffer, mulawBytes.byteOffset, mulawBytes.byteLength).toString(
    "base64",
  );
}
