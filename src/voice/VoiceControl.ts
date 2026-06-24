// Thin wrapper over the Web Speech API. It only turns speech into text and
// hands the transcript to a callback. All command interpretation lives in the
// shared command layer (src/commands.ts), so voice and typed text behave identically.

export class VoiceControl {
  private rec: any = null;
  active = false;

  get supported() {
    return "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
  }

  constructor(private onText: (text: string) => void) {}

  start() {
    if (!this.supported) return false;
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.rec = new SR();
    this.rec.continuous = true;
    this.rec.interimResults = false;
    this.rec.lang = "en-US";
    this.rec.onresult = (e: any) => {
      const t = e.results[e.results.length - 1][0].transcript.trim();
      this.onText(t);
    };
    this.rec.onend = () => {
      if (this.active) try { this.rec.start(); } catch {}
    };
    this.active = true;
    try { this.rec.start(); } catch {}
    return true;
  }

  stop() {
    this.active = false;
    if (this.rec) try { this.rec.stop(); } catch {}
  }
}
