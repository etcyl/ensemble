// Generates build/icon.png (512) and build/icon.ico (256) for the Ensemble app.
// Dependency-free: draws RGBA pixels and encodes PNG with Node's zlib.
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "build");
fs.mkdirSync(OUT, { recursive: true });

// --- tiny PNG encoder -------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // raw scanlines with filter byte 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// --- draw the logo ----------------------------------------------------------
function lerp(a, b, t) { return a + (b - a) * t; }
function mix(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}
function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2;
  const radius = size * 0.2; // rounded-corner radius
  const inkTop = [28, 25, 22], inkBot = [20, 17, 15];
  const amber = [232, 176, 75], rose = [181, 96, 76];
  const dotR = size * 0.3;

  const roundedAlpha = (x, y) => {
    // distance outside the rounded square -> soft alpha
    const dx = Math.max(radius - x, x - (size - radius), 0);
    const dy = Math.max(radius - y, y - (size - radius), 0);
    const corner = Math.hypot(dx, dy);
    if (corner === 0) return 1;
    return Math.max(0, Math.min(1, (radius - corner) / 1.5 + 0.5));
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const a = roundedAlpha(x + 0.5, y + 0.5);
      // base background gradient
      let col = mix(inkTop, inkBot, y / size);
      // warm glow toward center
      const d = Math.hypot(x - cx, y - cy);
      const glow = Math.max(0, 1 - d / (size * 0.7));
      col = mix(col, [50, 38, 26], glow * 0.5);
      // the dot
      if (d < dotR) {
        const t = d / dotR;
        const dot = mix(amber, rose, Math.pow(t, 1.3));
        col = dot;
      } else if (d < dotR * 1.18) {
        const t = (d - dotR) / (dotR * 0.18);
        col = mix(rose, col, t);
      }
      rgba[i] = Math.round(col[0]);
      rgba[i + 1] = Math.round(col[1]);
      rgba[i + 2] = Math.round(col[2]);
      rgba[i + 3] = Math.round(a * 255);
    }
  }
  return rgba;
}

const png512 = encodePng(512, 512, render(512));
fs.writeFileSync(path.join(OUT, "icon.png"), png512);

const png256 = encodePng(256, 256, render(256));
// wrap the 256 PNG into an ICO (PNG-compressed, Vista+)
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry[0] = 0; entry[1] = 0; // 0 => 256
entry[2] = 0; entry[3] = 0;
entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png256.length, 8);
entry.writeUInt32LE(22, 12);
fs.writeFileSync(path.join(OUT, "icon.ico"), Buffer.concat([header, entry, png256]));

console.log("wrote build/icon.png (512) and build/icon.ico (256)");
