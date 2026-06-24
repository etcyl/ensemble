// Minimal preload. The app is self-contained (Web Audio + localStorage),
// so no privileged bridge is needed yet. Kept for future native hooks
// (e.g. file-system project export, audio device selection).
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("ensemble", {
  platform: process.platform,
  desktop: true,
});
