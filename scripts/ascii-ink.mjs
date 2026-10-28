// Временный инструмент: ASCII-карта реального заполнения графики SVG.
// Показывает, сколько реального «инка» занимает объект внутри своего bounding box.
import { readFileSync } from "node:fs";

const TOKEN = /[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
const CMD = /^[MmLlHhVvCcSsQqTtAaZz]$/;

function flatten(d, steps = 16) {
  const t = d.match(TOKEN) || [];
  let i = 0, cmd = "", cx = 0, cy = 0, sx = 0, sy = 0;
  const polys = [];
  let cur = null;
  const num = () => parseFloat(t[i++]);
  while (i < t.length) {
    if (CMD.test(t[i])) { cmd = t[i++]; if (cmd.toUpperCase() === "Z") { if (cur && cur.length > 2) polys.push(cur); cur = null; cx = sx; cy = sy; } continue; }
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    if (C === "H") { cx = rel ? cx + num() : num(); cur?.push([cx, cy]); continue; }
    if (C === "V") { cy = rel ? cy + num() : num(); cur?.push([cx, cy]); continue; }
    if (C === "A") { num(); num(); num(); num(); num(); const x = num(), y = num(); cx = rel ? cx + x : x; cy = rel ? cy + y : y; cur?.push([cx, cy]); continue; }
    if (C === "M") { const x = rel ? cx + num() : num(), y = rel ? cy + num() : num(); cx = x; cy = y; sx = x; sy = y; if (cur && cur.length > 2) polys.push(cur); cur = [[x, y]]; cmd = rel ? "l" : "L"; continue; }
    if (C === "L" || C === "T") { const x = rel ? cx + num() : num(), y = rel ? cy + num() : num(); cx = x; cy = y; cur?.push([x, y]); continue; }
    if (C === "C") {
      const ax = cx, ay = cy, x1 = rel ? cx + num() : num(), y1 = rel ? cy + num() : num(), x2 = rel ? cx + num() : num(), y2 = rel ? cy + num() : num(), x = rel ? cx + num() : num(), y = rel ? cy + num() : num();
      for (let s = 1; s <= steps; s++) { const u = s / steps, v = 1 - u; cur?.push([v*v*v*ax+3*v*v*u*x1+3*v*u*u*x2+u*u*u*x, v*v*v*ay+3*v*v*u*y1+3*v*u*u*y2+u*u*u*y]); }
      cx = x; cy = y; continue;
    }
    if (C === "Q" || C === "S") {
      const ax = cx, ay = cy, x1 = rel ? cx + num() : num(), y1 = rel ? cy + num() : num(), x = rel ? cx + num() : num(), y = rel ? cy + num() : num();
      for (let s = 1; s <= steps; s++) { const u = s / steps, v = 1 - u; cur?.push([v*v*ax+2*v*u*x1+u*u*x, v*v*ay+2*v*u*y1+u*u*y]); }
      cx = x; cy = y; continue;
    }
    i++;
  }
  if (cur && cur.length > 2) polys.push(cur);
  return polys;
}

/** Поклеточная растеризация even-odd: покрывает ли заливка каждую клетку сетки. */
function coverage(svg, cols = 40, rows = 26) {
  const polys = [];
  for (const m of svg.matchAll(/<path[^>]*\bd="([^"]+)"/g)) polys.push(...flatten(m[1]));
  if (polys.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of polys) for (const [x, y] of p) { if (x<minX)minX=x; if (x>maxX)maxX=x; if (y<minY)minY=y; if (y>maxY)maxY=y; }
  const bw = maxX - minX, bh = maxY - minY;
  const grid = [];
  let filled = 0;
  for (let r = 0; r < rows; r++) {
    let line = "";
    for (let c = 0; c < cols; c++) {
      const px = minX + ((c + 0.5) / cols) * bw;
      const py = minY + ((r + 0.5) / rows) * bh;
      let inside = false;
      for (const poly of polys) {
        for (let k = 0, n = poly.length; k < n; k++) {
          const [x1, y1] = poly[k], [x2, y2] = poly[(k + 1) % n];
          if (y1 > py !== y2 > py) { const xint = x1 + ((py - y1) / (y2 - y1)) * (x2 - x1); if (px < xint) inside = !inside; }
        }
      }
      if (inside) { line += "#"; filled++; } else line += ".";
    }
    grid.push(line);
  }
  return { grid, ratio: filled / (cols * rows), box: { minX, minY, bw, bh } };
}

const files = {
  "L/primary/lamp.svg": "лампа",
  "L/primary/phone.svg": "телефон",
  "L/primary/headphones.svg": "наушники",
  "L/primary/book.svg": "книга",
  "L/primary/puzzle.svg": "пазлы",
};

for (const [f, label] of Object.entries(files)) {
  const svg = readFileSync(`public/assets/illustrations/${f}`, "utf8");
  const vb = /viewBox="([^"]+)"/.exec(svg)[1].trim().split(/[\s,]+/).map(Number);
  const c = coverage(svg);
  console.log(`\n===== ${label} (${f})  viewBox ${vb[2]}x${vb[3]}  aspect ${(vb[2]/vb[3]).toFixed(2)}  inkBox ${Math.round(c.box.bw)}x${Math.round(c.box.bh)}  ЗАПОЛНЕНО=${(c.ratio*100).toFixed(0)}% =====`);
  for (const line of c.grid) console.log("  " + line);
}
