#!/usr/bin/env node
// Mean luminance of device screenshots, per theme: objective evidence in the job log
// that the app followed the system theme (Z12-35). A dark run whose screenshots are as
// bright as the light run's did not switch.
//
//   node scripts/qa/device/shot-luma.mjs --out <theme-luma.json> <png> [<png> ...]
//
// The theme is read from the file name (<name>-<light|dark>-<platform>.png). Only
// 8-bit RGB / RGBA, non-interlaced PNGs are measured (what simctl and screencap write);
// anything else is skipped. Node built-ins only. Evidence, never a verdict: exit 0.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

/** Mean relative luminance (0..1) of an 8-bit RGB(A) PNG, or null if unsupported. */
export function pngLuma(buf, step = 7) {
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  let off = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      const colorType = data[9];
      const interlace = data[12];
      if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) return null;
      channels = colorType === 6 ? 4 : 3;
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (!width || !channels) return null;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  let prev = Buffer.alloc(stride);
  let sum = 0;
  let n = 0;
  for (let y = 0; y < height; y++) {
    const base = y * (stride + 1);
    const filter = raw[base];
    const line = Buffer.from(raw.subarray(base + 1, base + 1 + stride));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 0xff;
    }
    if (y % step === 0) {
      for (let x = 0; x < width; x += step) {
        const i = x * channels;
        sum += (0.2126 * line[i] + 0.7152 * line[i + 1] + 0.0722 * line[i + 2]) / 255;
        n++;
      }
    }
    prev = line;
  }
  return n ? sum / n : null;
}

export function themeOf(file) {
  return /-(light|dark)-(ios|android)\.png$/.exec(path.basename(file))?.[1] ?? null;
}

export function summarise(files) {
  const per = { light: [], dark: [] };
  const shots = [];
  for (const f of files) {
    const theme = themeOf(f);
    if (!theme) continue;
    let luma = null;
    try {
      luma = pngLuma(fs.readFileSync(f));
    } catch {
      luma = null;
    }
    if (luma === null) continue;
    per[theme].push(luma);
    shots.push({ file: path.basename(f), theme, luma: Math.round(luma * 1000) / 1000 });
  }
  const mean = (xs) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 1000) / 1000 : null);
  return { light: mean(per.light), dark: mean(per.dark), count: { light: per.light.length, dark: per.dark.length }, shots };
}

export function main(argv) {
  let out = null;
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") out = argv[++i];
    else files.push(argv[i]);
  }
  const s = summarise(files.filter((f) => fs.existsSync(f)));
  const note = `mean screenshot luminance: light ${s.light ?? "—"} (${s.count.light}), dark ${s.dark ?? "—"} (${s.count.dark})`;
  if (out) fs.writeFileSync(out, `${JSON.stringify({ result: note, ...s }, null, 2)}\n`);
  console.log(`shot-luma: ${note}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
