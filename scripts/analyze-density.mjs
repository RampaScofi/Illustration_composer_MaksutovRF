// Временный инструмент: считает реальную площадь заливки path (shoelace)
// относительно bounding box — это и есть визуальная плотность объекта.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const CMD = /[MmLlHhVvCcSsQqTtAaZz]/;
const TOKEN = /[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;

/** Флаппит path в полилинии сегментов (кривые дискретизируются). */
function flatten(d, steps = 14) {
  const t = d.match(TOKEN) || [];
  let i = 0;
  let cmd = "";
  let cx = 0, cy = 0, sx = 0, sy = 0, lastCp = null;
  const subpaths = [];
  let cur = null;

  const num = () => parseFloat(t[i++]);
  const move = (x, y) => { cur = [[x, y]]; subpaths.push(cur); };

  while (i < t.length) {
    if (CMD.test(t[i]) && t[i].length === 1) cmd = t[i++];
    if (i >= t.length) break;
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const dx = (v) => (rel ? cx + v : v);
    const dy = (v) => (rel ? cy + v : v);

    if (C === "Z") { if (cur) cur.push([sx, sy]); cx = sx; cy = sy; lastCp = null; continue; }
    if (C === "H") { cx = dx(num()); cur?.push([cx, cy]); continue; }
    if (C === "V") { cy = dy(num()); cur?.push([cx, cy]); continue; }
    if (C === "A") {
      const rx = num(), ry = num(), rot = num(), laf = num(), sf = num(), x = num(), y = num();
      void rx; void ry; void rot; void laf; void sf;
      cx = dx(x); cy = dy(y); cur?.push([cx, cy]); lastCp = null; continue;
    }
    if (C === "M") {
      const x = dx(num()), y = dy(num());
      cx = x; cy = y; sx = x; sy = y; move(x, y); lastCp = null;
      cmd = rel ? "l" : "L";
      continue;
    }
    if (C === "L" || C === "T") {
      const x = dx(num()), y = dy(num());
      cx = x; cy = y; cur?.push([x, y]); lastCp = null; continue;
    }
    if (C === "C") {
      const x1 = dx(num()), y1 = dy(num()), x2 = dx(num()), y2 = dy(num()), x = dx(num()), y = dy(num());
      const p0 = [cx, cy];
      for (let s = 1; s <= steps; s += 1) {
        const u = s / steps, v = 1 - u;
        cur?.push([
          v * v * v * p0[0] + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x,
          v * v * v * p0[1] + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y,
        ]);
      }
      lastCp = [x2, y2]; cx = x; cy = y; continue;
    }
    if (C === "S" || C === "Q") {
      const x1 = dx(num()), y1 = dy(num()), x = dx(num()), y = dy(num());
      const p0 = [cx, cy];
      for (let s = 1; s <= steps; s += 1) {
        const u = s / steps, v = 1 - u;
        cur?.push([v * v * p0[0] + 2 * v * u * x1 + u * u * x, v * v * p0[1] + 2 * v * u * y1 + u * u * y]);
      }
      lastCp = [x1, y1]; cx = x; cy = y; continue;
    }
    i += 1;
  }
  void lastCp;
  return subpaths;
}

function shoelace(poly) {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i += 1) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function stats(svg) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let inkArea = 0;
  for (const m of svg.matchAll(/<path[^>]*\bd="([^"]+)"/g)) {
    for (const poly of flatten(m[1])) {
      if (poly.length < 3) continue;
      inkArea += shoelace(poly);
      for (const [x, y] of poly) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (minX === Infinity) return null;
  const bw = maxX - minX, bh = maxY - minY;
  return { bbox: { minX, minY, bw, bh }, density: inkArea / (bw * bh) };
}

function files(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (p.endsWith(".svg")) out.push(p);
  }
  return out;
}

const manifest = JSON.parse(readFileSync("public/assets/illustrations/manifest.json", "utf8"));
const byPath = new Map(manifest.components.map((c) => [c.svgPath.replace(/^\//, ""), c]));

const rows = [];
for (const f of files("public/assets/illustrations")) {
  const rel = f.replace(/\\/g, "/").replace(/^public\/assets\/illustrations\//, "");
  const comp = byPath.get(`public/assets/illustrations/${rel}`.replace(/^public\//, ""));
  if (!comp) continue;
  const s = stats(readFileSync(f, "utf8"));
  if (!s) continue;
  rows.push({
    id: comp.id,
    role: comp.role,
    vb: `${comp.intrinsicSize.width}x${comp.intrinsicSize.height}`,
    aspect: +(comp.intrinsicSize.width / comp.intrinsicSize.height).toFixed(2),
    inkBox: `${Math.round(s.bw)}x${Math.round(s.bh)}`,
    inkAspect: +(s.bw / s.bh).toFixed(2),
    density: +(s.density * 100).toFixed(0) + "%",
  });
}
rows.sort((a, b) => parseInt(a.density) - parseInt(b.density));
console.table(rows);
