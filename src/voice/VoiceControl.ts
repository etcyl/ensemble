// Voice command layer using the Web Speech API (SpeechRecognition).
// Keeps the grammar tiny and forgiving so the tool stays simple to drive.

export interface VoiceActions {
  play: () => void;
  stop: () => void;
  record: () => void;
  addTrack: () => void;
  setBpm: (n: number) => void;
  metronome: (on: boolean) => void;
  louder: () => void;
  softer: () => void;
  harmonize: () => void;
  mixdown: () => void;
  onHeard: (text: string) => void;
}

const NUMBERS: Record<string, number> = {
  ninety: 90, hundred: 100, "one hundred": 100, "one twenty": 120,
  "one forty": 140, "one sixty": 160,
};

function parseNumber(s: string): number | null {
  const m = s.match(/(\d{2,3})/);
  if (m) return parseInt(m[1], 10);
  for (const k in NUMBERS) if (s.includes(k)) return NUMBERS[k];
  return null;
}

export class VoiceControl {
  private rec: any = null;
  active = false;

  get supported() {
    return (
      "webkitSpeechRecognition" in window || "SpeechRecognition" in window
    );
  }

  constructor(private actions: VoiceActions) {}

  start() {
    if (!this.supported) return false;
    const SR: any =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.rec = new SR();
    this.rec.continuous = true;
    this.rec.interimResults = false;
    this.rec.lang = "en-US";
    this.rec.onresult = (e: any) => {
      const t = e.results[e.results.length - 1][0].transcript.toLowerCase().trim();
      this.actions.onHeard(t);
      this.handle(t);
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

  private handle(t: string) {
    const a = this.actions;
    if (/\b(stop|halt|pause)\b/.test(t)) return a.stop();
    if (/\b(record|recording|arm)\b/.test(t)) return a.record();
    if (/\b(play|start|go)\b/.test(t)) return a.play();
    if (/\b(add|new)\b.*\btrack\b/.test(t)) return a.addTrack();
    if (/metronome.*(off|stop|mute)|(off|stop|mute).*metronome/.test(t))
      return a.metronome(false);
    if (/metronome.*(on|click)|click.*on/.test(t)) return a.metronome(true);
    if (/\b(louder|volume up|turn up)\b/.test(t)) return a.louder();
    if (/\b(softer|quieter|volume down|turn down)\b/.test(t)) return a.softer();
    if (/\b(harmonize|harmonise|accompany|add (drums|bass|keys|instruments?))\b/.test(t)) return a.harmonize();
    if (/\b(mixdown|mix down|bounce|export|render)\b/.test(t)) return a.mixdown();
    if (/\b(tempo|bpm|speed)\b/.test(t)) {
      const n = parseNumber(t);
      if (n) return a.setBpm(n);
    }
  }
}
