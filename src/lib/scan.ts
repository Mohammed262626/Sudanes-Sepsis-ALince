// Shared by the admin dashboard and the standalone door screen. jsQR is
// vendored and loaded on demand, so nothing is bundled up front.

import { url } from "./url";

export const parseCode = (raw: string) =>
  (raw.match(/SX-[A-Z0-9]+/i)?.[0] ?? raw).trim().toUpperCase();

let audio: AudioContext | null = null;

// Beeps are synthesised: no audio files, nothing to load.
export const ensureAudio = (): AudioContext | null => {
  const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctx) return null;
  audio ??= new Ctx();
  if (audio.state === "suspended") void audio.resume();
  return audio;
};

export const tone = (freqs: number[], type: OscillatorType = "sine", level = 0.1) => {
  const ctx = ensureAudio();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  freqs.forEach((f, i) => {
    const at = t0 + i * 0.09;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.value = f;
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(level, at + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + 0.085);
    osc.connect(amp).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.1);
  });
};

export const buzz = (ms: number) => navigator.vibrate?.(ms);

// jsQR on every device: the native BarcodeDetector on Android Chrome reports
// "no QR" forever on frames jsQR reads fine, so it is not used at all.
async function loadJsQr(): Promise<any> {
  const w = window as any;
  if (w.jsQR) return w.jsQR;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = url("vendor/jsQR.js");
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("jsQR"));
    document.head.append(s);
  });
  return w.jsQR;
}

export async function jsQrDecoder(): Promise<(v: HTMLVideoElement) => string | null> {
  const jsQR = await loadJsQr();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const grab = (v: HTMLVideoElement, sx: number, sy: number, sw: number, sh: number, cap: number) => {
    const s = Math.min(1, cap / sw);
    canvas.width = Math.max(1, Math.round(sw * s));
    canvas.height = Math.max(1, Math.round(sh * s));
    ctx!.drawImage(v, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return ctx!.getImageData(0, 0, canvas.width, canvas.height);
  };
  return (v) => {
    if (!ctx || !v.videoWidth) return null;
    // The middle of the frame is where the ticket is pointed: decoding that
    // square at full detail beats a downscaled whole frame.
    const w = v.videoWidth;
    const h = v.videoHeight;
    const side = Math.round(Math.min(w, h) * 0.7);
    const crop = grab(v, (w - side) / 2, (h - side) / 2, side, side, 720);
    const hit = jsQR(crop.data, crop.width, crop.height, { inversionAttempts: "attemptBoth" });
    if (hit) return hit.data;
    const full = grab(v, 0, 0, w, h, 800);
    return (
      jsQR(full.data, full.width, full.height, { inversionAttempts: "attemptBoth" })?.data ?? null
    );
  };
}
