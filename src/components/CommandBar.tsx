import { useState } from "react";
import { useStore } from "../state/store";

const EXAMPLES = [
  "record channel 1",
  "add reverb to channel 1",
  "bring up the highs on channel 2",
  "set channel 1 to playback",
  "erase channel 2",
  "set tempo to 128",
];

export default function CommandBar({ onRun }: { onRun: (text: string) => void }) {
  const feedback = useStore((s) => s.feedback);
  const lastVoice = useStore((s) => s.lastVoice);
  const voiceOn = useStore((s) => s.voiceOn);
  const [text, setText] = useState("");
  const [ph] = useState(() => EXAMPLES[Math.floor(Date.now() / 9000) % EXAMPLES.length]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onRun(text.trim());
    setText("");
  };

  return (
    <div className="cmdbar">
      <span className="cmd-icon" title="Type a command. The same words work by voice.">⌘</span>
      <form onSubmit={submit} style={{ flex: 1, display: "flex" }}>
        <input
          className="cmd-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Type a command, e.g. "${ph}"`}
          title='Natural-language control. Examples: "record channel 1", "add reverb to channel 2", "cut the lows on channel 1", "set channel 3 to playback", "erase channel 2", "set tempo to 120". The same phrases work with the Voice button.'
        />
      </form>
      {voiceOn && lastVoice && <span className="cmd-heard" title="Last thing heard by voice">🎙 "{lastVoice}"</span>}
      {feedback && <span className="cmd-feedback" title="Result of the last command">{feedback}</span>}
    </div>
  );
}
