// Builds docs/Ensemble-Guide.pdf - a comprehensive, example-driven user guide.
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "..", "docs");
fs.mkdirSync(OUT_DIR, { recursive: true });
const OUT = path.join(OUT_DIR, "Ensemble-Guide.pdf");
const ICON = path.join(__dirname, "..", "build", "icon.png");

// palette
const INK = "#1e1b18", DIM = "#4a443c", FAINT = "#8a7f6f";
const AMBER = "#b8801f", ROSE = "#b5604c", SAGE = "#4f7a64", LINE = "#d8cfc0";

const doc = new PDFDocument({
  size: "LETTER",
  margins: { top: 64, bottom: 64, left: 64, right: 64 },
  info: { Title: "Ensemble User Guide", Author: "Ensemble", Subject: "How to use Ensemble" },
});
doc.pipe(fs.createWriteStream(OUT));

const W = doc.page.width - 128; // content width
let firstSectionOnPage = true;

function bandHeader() {
  // running header on content pages
}

function h1(text) {
  if (!firstSectionOnPage) doc.addPage();
  firstSectionOnPage = false;
  doc.moveDown(0.2);
  doc.fillColor(AMBER).font("Helvetica-Bold").fontSize(20).text(text);
  const y = doc.y + 4;
  doc.moveTo(64, y).lineTo(64 + W, y).lineWidth(1.5).strokeColor(AMBER).stroke();
  doc.moveDown(0.8);
  doc.fillColor(INK);
}
function h2(text) {
  doc.moveDown(0.5);
  doc.fillColor(ROSE).font("Helvetica-Bold").fontSize(13.5).text(text);
  doc.moveDown(0.25);
  doc.fillColor(INK);
}
function p(text) {
  doc.font("Helvetica").fontSize(10.5).fillColor(DIM).text(text, { align: "left", lineGap: 2.5 });
  doc.moveDown(0.4);
}
function bullets(items) {
  doc.font("Helvetica").fontSize(10.5).fillColor(DIM);
  items.forEach((it) => {
    doc.text("•  " + it, { indent: 8, lineGap: 2.5 });
    doc.moveDown(0.12);
  });
  doc.moveDown(0.3);
}
function steps(items) {
  doc.font("Helvetica").fontSize(10.5).fillColor(DIM);
  items.forEach((it, i) => {
    const label = (i + 1) + ".  ";
    doc.fillColor(AMBER).font("Helvetica-Bold").text(label, { continued: true });
    doc.fillColor(DIM).font("Helvetica").text(it, { lineGap: 2.5 });
    doc.moveDown(0.15);
  });
  doc.moveDown(0.3);
}
function callout(title, text) {
  const startY = doc.y;
  doc.font("Helvetica-Bold").fontSize(10.5);
  const h = doc.heightOfString(text, { width: W - 28 }) + 34;
  doc.save();
  doc.roundedRect(64, startY, W, h, 7).fill("#f6efe2");
  doc.roundedRect(64, startY, 4, h, 2).fill(AMBER);
  doc.restore();
  doc.fillColor(AMBER).font("Helvetica-Bold").fontSize(10.5).text(title, 80, startY + 10, { width: W - 28 });
  doc.fillColor(DIM).font("Helvetica").fontSize(10).text(text, 80, doc.y + 2, { width: W - 28, lineGap: 2 });
  doc.y = startY + h + 8;
  doc.x = 64;
}
function table(headers, rows) {
  const cols = headers.length;
  const colW = [W * 0.28, W * 0.16, W * 0.56];
  const x0 = 64;
  const rowH = (cells) => {
    doc.font("Helvetica").fontSize(9.5);
    return Math.max(...cells.map((c, i) => doc.heightOfString(c, { width: colW[i] - 10 }))) + 8;
  };
  // header
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#fff");
  const hh = rowH(headers);
  doc.rect(x0, doc.y, W, hh).fill(AMBER);
  let cx = x0;
  doc.fillColor("#fff");
  headers.forEach((hd, i) => { doc.text(hd, cx + 5, doc.y + 4, { width: colW[i] - 10 }); cx += colW[i]; doc.y -= 0; });
  doc.y += hh; doc.x = x0;
  // rows
  rows.forEach((r, ri) => {
    const rh = rowH(r);
    if (doc.y + rh > doc.page.height - 64) { doc.addPage(); }
    if (ri % 2 === 0) { doc.rect(x0, doc.y, W, rh).fill("#f4eee2"); }
    let rx = x0;
    const top = doc.y;
    r.forEach((cell, i) => {
      doc.font(i === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(9.5).fillColor(i === 1 ? SAGE : DIM);
      doc.text(cell, rx + 5, top + 4, { width: colW[i] - 10 });
      rx += colW[i];
    });
    doc.y = top + rh; doc.x = x0;
  });
  doc.moveDown(0.6);
}

// ---------- COVER ----------
doc.rect(0, 0, doc.page.width, doc.page.height).fill("#16130f");
if (fs.existsSync(ICON)) doc.image(ICON, doc.page.width / 2 - 70, 150, { width: 140 });
doc.fillColor("#ece4d8").font("Helvetica-Bold").fontSize(46).text("Ensemble", 0, 320, { align: "center" });
doc.fillColor(AMBER).font("Helvetica").fontSize(15).text("A simple, fast DAW", { align: "center" });
doc.moveDown(2);
doc.fillColor("#8a7f6f").fontSize(11).text("User Guide", { align: "center" });
doc.fillColor("#6f6253").fontSize(9).text("Record - Build beats - Mix - Harmonize - all locally in your browser", { align: "center" });

// ---------- BODY ----------
doc.addPage();
firstSectionOnPage = true;

h1("1. Welcome to Ensemble");
p("Ensemble is a music workstation built around one idea: make the few things you actually reach for fast and obvious. You can record live, lay down a beat that locks to the tempo, add automatic accompaniment, and mix - without the thousand-panel learning curve of a traditional DAW.");
p("Everything runs locally. Your audio never leaves your machine (the one exception is voice control, explained in section 10). Projects autosave to your browser as you work.");
bullets([
  "Transport with tempo, metronome and loop",
  "Live microphone recording with waveforms",
  "A Beat Maker (step sequencer) with swappable drum kits",
  "Harmonize: analyze a track and auto-generate matching instruments and drums",
  "A mixer with volume, pan, mute, solo and a master meter",
  "Voice control and one-key shortcuts",
  "Export your finished song to a .wav file",
]);

h1("2. The layout");
p("The screen has four zones, top to bottom:");
bullets([
  "Top bar: project name, Projects, Add/Import track, Harmonize, Export WAV, Voice, and the autosave indicator.",
  "Transport bar: rewind, play/stop, record, loop, the bar.beat readout, Tempo, Length and the metronome (Click).",
  "Arrange view: one row per track with a moving playhead. Click the ruler to move the playhead.",
  "Bottom dock: the Beat Maker on the left and the Mixer on the right.",
]);
callout("Tip", "Hover over anything in Ensemble. Every button, slider and label has a plain-language tooltip that explains what it does.");

h1("3. Getting started in 60 seconds");
steps([
  "Press Play (or the Spacebar). You will hear the starter beat and the metronome click.",
  "Change the Tempo field to taste - the beat and click follow instantly.",
  "Click squares in the Beat Maker to add or remove drum hits.",
  "Press the Loop button (the circular arrows) so playback repeats while you experiment.",
  "Open Projects, type a name, and press + New to start your own song. From here on it autosaves.",
]);

h1("4. Recording live from your microphone");
p("This is the core workflow for capturing vocals, guitar, or any instrument through your audio input.");
steps([
  "Click + Audio Track to make a track to record onto (a new track is automatically record-armed - the red dot).",
  "If you have several audio tracks, click the red record-arm dot on the one you want. Only one track arms at a time.",
  "Turn on the metronome (Click) if you want a tempo guide while you play.",
  "Press the Record button (or the R key). Ensemble starts playback and begins capturing from your mic.",
  "The first time, your browser asks for microphone permission - click Allow.",
  "Play or sing. When you are done, press Record again (or R) to stop.",
  "Your take appears on the armed track as a waveform clip, placed where the playhead was when you started.",
]);
callout("Where does my recording start?", "A take is placed at the playhead position from the moment you hit Record. Rewind to the start (the |< button) first if you want to record from bar 1.");
p("Recordings are 16-bit WAV internally and are saved with the project so they survive a reload.");

h1("5. Adding and importing tracks");
h2("Add an empty audio track");
p("Click + Audio Track in the top bar. Use this when you plan to record into it.");
h2("Import an existing audio file");
p("Click Import and choose a .wav, .mp3, .m4a or similar file (for example, a guitar part you recorded elsewhere). Ensemble decodes it, draws its waveform, and drops it onto a new track at bar 1. Imported tracks can be mixed, exported, and - importantly - analyzed by Harmonize.");

h1("6. The Beat Maker");
p("The Beat Maker is a 16-step sequencer. Each row is a drum sound; each of the 16 squares is a sixteenth note. A lit square plays that sound on that step. The whole pattern repeats every bar and always stays in time with the project tempo.");
h2("Pick a kit, then swap any piece");
steps([
  "Use the kit dropdown next to the Beat Maker title to choose a full set of sounds (Studio, 808/Trap, Acoustic, Punchy Pop, Lo-Fi).",
  "To swap just one piece, use the small dropdown on that row - for example change only the snare, or pick a Crash instead of a Ride on the cymbal row.",
  "Swapping a single piece switches the kit label to 'Custom'. Picking a kit again resets all six pieces.",
  "Click a row's name to audition that sound. Picking a new sound auditions it immediately.",
]);
h2("Swing and clear");
bullets([
  "Swing nudges every other sixteenth later for a looser, human groove. All the way left is dead straight.",
  "Clear turns every step off but keeps your chosen kit.",
]);

h1("7. Transport, tempo and loop");
table(
  ["Control", "Where", "What it does"],
  [
    ["Play / Stop", "Transport / Spacebar", "Starts or stops playback from the current position."],
    ["Record", "Transport / R key", "Arms capture from your mic onto the armed track and starts playback."],
    ["Loop", "Transport", "When on, playback repeats the whole arrangement instead of stopping at the end. The wrap is seamless."],
    ["Rewind", "Transport (|<)", "Jumps the playhead back to bar 1."],
    ["Tempo", "Transport", "Beats per minute, 40-260. Drums, metronome and generated parts all follow it."],
    ["Length", "Transport", "Song length in bars, 1-64. The arrangement and loop span this length."],
    ["Click", "Transport", "Toggles the metronome on each beat."],
  ]
);

h1("8. Mixing");
p("The Mixer (bottom-right) has one channel strip per track plus a Master strip.");
bullets([
  "Volume fader: how loud the track is. Drag up or down.",
  "Pan slider: places the track left or right in the stereo field.",
  "M (Mute): silences the track.",
  "S (Solo): hears only the soloed track(s) and mutes everything else.",
  "Master strip: overall output volume with a live level meter. Keep the meter out of the red to avoid clipping.",
]);

h1("9. Harmonize - automatic accompaniment");
p("Harmonize adds instrument parts (and optionally drums) that fit your song. It can work from scratch, or it can listen to an existing track, show you what it hears, and let you correct everything before it plays a single note.");

h2("The simple path");
steps([
  "Click Harmonize in the top bar.",
  "Pick a Key, Scale (major = bright, minor = moody), Chords (progression) and a Style.",
  "Choose which instruments to add: Bass, Keys/Pad, Pluck/Arp, Lead - and tick Drums to also lay down a fitting beat.",
  "Press Generate. The parts appear as normal tracks you can mix or mute.",
]);

h2("Example: turn a lone guitar into a full arrangement");
steps([
  "Import your guitar recording (Import button).",
  "Open Harmonize. Under 'Analyze a track', choose the guitar and press Analyze.",
  "Ensemble shows what it hears: an estimated tempo, an energy/frenticism level, the key and scale, and a bar chart of the notes it detected.",
  "Correct anything that looks off. Click a different note bar to change the key, switch major/minor, drag Energy, or pick different Chords. Press 'Use NNN BPM' to match the project tempo to the detected tempo.",
  "Tick Drums + Bass + Keys, set a Style (say, Rock), nudge octaves if a part sits too low or high, and press Generate.",
  "Press Play. Mute or rebalance any generated part in the Mixer. Re-open Harmonize and Regenerate to try another feel.",
]);
callout("These are estimates you control", "Tempo, key and energy detection are best-effort estimates from the audio, not ground truth. The whole point of the preview is that you get the final say - every value Ensemble guesses is editable before you generate.");

h2("Fine-tuning controls");
table(
  ["Control", "Range", "Effect on the generated parts"],
  [
    ["Key", "C - B", "The root the parts are built around."],
    ["Scale", "Major / Minor", "Bright and happy vs. dark and moody chord/note choices."],
    ["Chords", "6 progressions", "The chord per bar the parts follow (e.g. Pop I-V-vi-IV)."],
    ["Style", "Pop..EDM", "Overall feel: arp speed, swing, and the flavour of the generated beat."],
    ["Energy", "Relaxed - Frantic", "How busy and hard the parts play. The arp also follows your hi-hat density."],
    ["Octave", "-2 .. +2", "Shift any one instrument up or down to fit the mix."],
    ["Drums", "On / Off", "Also (re)generate the Beat Maker pattern to match the style and energy."],
  ]
);
p("Generated parts are ordinary instrument tracks. You can solo them, change their volume and pan in the Mixer, or remove them all with 'Remove generated' in the Harmonize panel.");

h1("10. Voice control");
p("Ensemble can be driven hands-free, which is handy when an instrument is already in your hands. Click Voice in the top bar to start listening (the button glows and a 'listening' indicator appears). Click it again to stop.");

h2("How speech becomes text");
p("Voice control uses the browser's built-in Web Speech API (SpeechRecognition). In a Chromium browser (Chrome or Microsoft Edge), the browser streams short snippets of microphone audio to its speech service and returns a text transcript. Because of that:");
bullets([
  "It needs an internet connection and microphone permission.",
  "It works in Chrome and Edge. Safari and Firefox do not support it, and the desktop build follows the same rule as the browser it embeds.",
  "While listening is ON, audio is processed by the browser's speech provider. Turn Voice off when you are done to stop all listening. Nothing is recorded to disk by Ensemble.",
]);

h2("How a command is understood");
p("Ensemble takes the recognized transcript, lowercases it, and matches it against a small, forgiving set of keyword patterns. It looks for intent rather than exact phrases: any sentence containing 'stop' stops playback; 'set the tempo to one twenty eight' pulls the number 128 out of the text. Recognition runs continuously, so you can issue one command after another without re-clicking.");

h2("Command reference");
table(
  ["Say something like", "Also", "What happens"],
  [
    ["\"play\", \"start\", \"go\"", "-", "Starts playback."],
    ["\"stop\", \"halt\", \"pause\"", "-", "Stops playback."],
    ["\"record\", \"arm\"", "R key", "Starts recording onto the armed track."],
    ["\"add a track\"", "-", "Adds a new audio track."],
    ["\"set tempo to 128\"", "\"bpm 128\"", "Sets the project tempo to the spoken number."],
    ["\"metronome off\"", "\"metronome on\"", "Toggles the click track."],
    ["\"louder\" / \"softer\"", "\"turn up/down\"", "Nudges the master volume up or down."],
    ["\"harmonize\"", "\"add drums/bass\"", "Opens the Harmonize panel."],
    ["\"export\", \"bounce\", \"mixdown\"", "\"render\"", "Renders the song to a .wav download."],
  ]
);

h1("11. Projects, autosave and export");
bullets([
  "Autosave: every change is written to your browser automatically (the 'autosaved' chip up top).",
  "Projects panel: start a new named song, open or delete saved songs, Save current, or Export the project as a .json backup you can keep or share.",
  "Export WAV: 'Export WAV' (top bar) renders the entire arrangement - drums, instruments and recordings - to a single stereo .wav file, respecting your mix, mutes and solos.",
]);

h1("12. Keyboard shortcuts");
table(
  ["Key", "Action", "Notes"],
  [
    ["Spacebar", "Play / Stop", "Ignored while typing in a text field."],
    ["R", "Record", "Toggles recording on the armed track."],
  ]
);

h1("13. Troubleshooting");
bullets([
  "No sound? Click anywhere first - browsers require a user gesture before audio can start. Then press Play.",
  "Microphone not working? Check the browser's site permissions and that the right input device is selected in your OS.",
  "Voice does nothing? Use Chrome or Edge, allow the mic, and make sure you are online.",
  "Recording is silent? Make sure the track is record-armed (red dot) and your input is not muted by the OS.",
  "A generated part is too loud or busy? Lower its fader in the Mixer, drop the Energy, or change its octave and Regenerate.",
]);

doc.moveDown(2);
doc.fillColor(FAINT).font("Helvetica-Oblique").fontSize(9)
  .text("Ensemble - made for making music, not menus.", { align: "center" });

doc.end();
console.log("wrote docs/Ensemble-Guide.pdf");
