// Live microphone recording -> WAV blob + AudioBuffer.

export interface RecordingResult {
  buffer: AudioBuffer;
  wavBase64: string;
  peaks: number[];
  duration: number;
}

let mediaStream: MediaStream | null = null;

export async function getMicStream(): Promise<MediaStream> {
  if (mediaStream) return mediaStream;
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
  return mediaStream;
}

export class LiveRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  async start() {
    const stream = await getMicStream();
    this.chunks = [];
    const mime = MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "";
    this.recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start();
  }

  async stop(ctx: AudioContext): Promise<RecordingResult> {
    return new Promise((resolve, reject) => {
      if (!this.recorder) return reject(new Error("not recording"));
      this.recorder.onstop = async () => {
        try {
          const blob = new Blob(this.chunks, { type: this.chunks[0]?.type });
          const arr = await blob.arrayBuffer();
          const buffer = await ctx.decodeAudioData(arr.slice(0));
          const wavBase64 = encodeWavBase64(buffer);
          resolve({
            buffer,
            wavBase64,
            peaks: computePeaks(buffer, 800),
            duration: buffer.duration,
          });
        } catch (e) {
          reject(e);
        }
      };
      this.recorder.stop();
    });
  }
}

export function computePeaks(buffer: AudioBuffer, count: number): number[] {
  const data = buffer.getChannelData(0);
  const block = Math.max(1, Math.floor(data.length / count));
  const peaks: number[] = [];
  for (let i = 0; i < count; i++) {
    let max = 0;
    const start = i * block;
    for (let j = 0; j < block && start + j < data.length; j++) {
      const v = Math.abs(data[start + j]);
      if (v > max) max = v;
    }
    peaks.push(max);
  }
  return peaks;
}

// minimal 16-bit PCM WAV encoder -> ArrayBuffer
export function encodeWav(buffer: AudioBuffer): ArrayBuffer {
  const numCh = buffer.numberOfChannels;
  const len = buffer.length;
  const sampleRate = buffer.sampleRate;
  const bytes = 44 + len * numCh * 2;
  const ab = new ArrayBuffer(bytes);
  const view = new DataView(ab);
  const w = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  w(0, "RIFF");
  view.setUint32(4, bytes - 8, true);
  w(8, "WAVE");
  w(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  w(36, "data");
  view.setUint32(40, len * numCh * 2, true);
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      let s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return ab;
}

export function encodeWavBase64(buffer: AudioBuffer): string {
  const u8 = new Uint8Array(encodeWav(buffer));
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + chunk)));
  }
  return "data:audio/wav;base64," + btoa(binary);
}

export function downloadWav(buffer: AudioBuffer, filename: string) {
  const blob = new Blob([encodeWav(buffer)], { type: "audio/wav" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".wav") ? filename : filename + ".wav";
  a.click();
  URL.revokeObjectURL(url);
}

export async function base64ToArrayBuffer(dataUrl: string): Promise<ArrayBuffer> {
  const res = await fetch(dataUrl);
  return await res.arrayBuffer();
}
