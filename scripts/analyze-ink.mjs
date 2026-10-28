// Временный инструмент: считает фактические границы видимой графики SVG
// с корректной обработкой относительных команд и кривых Безье.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const NUM = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;

/** Плоский обход path d: отслеживаем текущую точку и собираем все опорные точки. */
function pathPoints(d) {
  const pts = [];
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
  let i = 0;
  let cmd = "";
  let cx = 0, cy = 0, sx = 0, sy = 0;
  let prevC = null;

  const num = () => parseFloat(tokens[i++]);
  const isCmd = (t) => /^[MmLlHhVvCcSsQqTtAaZz]$/.test(t);

  while (i < tokens.length) {
    if (isCmd(tokens[i])) cmd = tokens[i++];
    if (i >= tokens.length) break;
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();

    if (C === "Z") {
      cx = sx; cy = sy; prevC = null; continue;
    }

    if (C === "H") {
      const x = num(); cx = rel ? cx + x : x; pts.push([cx, cy]); prevC = null; continue;
    }
    if (C === "V") {
      const y = num(); cy = rel ? cy + y : y; pts.push([cx, cy]); prevC = null; continue;
    }

    if (C === "A") {
      const rx = num(), ry = num(), rot = num(), laf = num(), sf = num(), x = num(), y = num();
      void rx; void ry; void rot; void laf; void sf;
      cx = rel ? cx + x : x; cy = rel ? cy + y : y; pts.push([cx, cy]); prevC = null; continue;
    }

    const count = C === "M" || C === "L" || C === "T" ? 2 : C === "C" ? 6 : C === "S" || C === "Q" ? 4 : 2;
    while (i < tokens.length && !isCmd(tokens[i])) {
      const start = i;
      const args = [];
      for (let k = 0; k < count && i < tokens.length && !isCmd(tokens[i]); k += 1) args.push(num());
      if (args.length === 0) { i = start; break; }

      if (C === "M") {
        const [x, y] = args;
        cx = rel ? cx + x : x; cy = rel ? cy + y : y;
        sx = cx; sy = cy; pts.push([cx, cy]); prevC = null;
        cmd = rel ? "m" : "l";
      } else if (C === "L" || C === "T") {
        const [x, y] = args;
        cx = rel ? cx + x : x; cy = rel ? cy + y : y; pts.push([cx, cy]); prevC = null;
      } else if (C === "C") {
        const [x1, y1, x2, y2, x, y] = args;
        const ax = cx, ay = cy;
        const bx = rel ? cx + x1 : x1, by = rel ? cy + y1 : y1;
        const dx = rel ? cx + x2 : x2, dy = rel ? cy + y2 : y2;
        cx = rel ? cx + x : x; cy = rel ? cy + y : y;
        pts.push([ax, ay], [bx, by], [dx, dy], [cx, cy]);
        prevC = [dx, dy];
      } else if (C === "S" || C === "Q") {
        const [x1, y1, x, y] = args;
        const bx = rel ? cx + x1 : x1, by = rel ? cy + y1 : y1;
        cx = rel ? cx + x : x; cy = rel ? cy + y : y;
        pts.push([cx, cy], [bx, by]);
        prevC = [bx, by];
      }
      if (i === start) break;
    }
  }
  return pts;
}

function inkBounds(svg) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const m of svg.matchAll(/<path[^>]*\bd="([^"]+)"/g)) {
    for (const [x, y] of pathPoints(m[1])) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  for (const m of svg.matchAll(/<(rect|circle|ellipse)[^>]*>/g)) {
    const tag = m[0];
    const attr = (n) => { const r = new RegExp(`\\b${n}="([-\\d.]+)"`).exec(tag); return r ? parseFloat(r[1]) : null; };
    if (m[1] === "rect") {
      const x = attr("x") ?? 0, y = attr("y") ?? 0, w = attr("width") ?? 0, h = attr("height") ?? 0;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
    } else if (m[1] === "circle") {
      const cx = attr("cx") ?? 0, cy = attr("cy") ?? 0, r = attr("r") ?? 0;
      minX = Math.min(minX, cx - r); maxX = Math.max(maxX, cx + r);
      minY = Math.min(minY, cy - r); maxY = Math.max(maxY, cy + r);
    }
  }
  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY };
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

const root = process.argv[2] || "public/assets/illustrations";
const rows = [];
for (const f of files(root)) {
  const svg = readFileSync(f, "utf8");
  const vb = /viewBox="([^"]+)"/.exec(svg);
  if (!vb) continue;
  const [vx, vy, vw, vh] = vb[1].trim().split(/[\s,]+/).map(Number);
  const b = inkBounds(svg);
  if (!b) continue;
  const iw = b.maxX - b.minX, ih = b.maxY - b.minY;
  const density = (iw * ih) / (vw * vh);
  rows.push({
    file: f.replace(/\\/g, "/").replace(/^public\/assets\/illustrations\//, ""),
    vb: `${vw}x${vh}`,
    vbAspect: +(vw / vh).toFixed(2),
    ink: `${Math.round(b.minX)},${Math.round(b.minY)} ${Math.round(iw)}x${Math.round(ih)}`,
    inkAspect: +(iw / ih).toFixed(2),
    fill: +(density * 100).toFixed(0) + "%",
    offX: Math.round((b.minX / vw) * 100) + "%",
    offY: Math.round((b.minY / vh) * 100) + "%",
  });
}
rows.sort((a, b2) => parseFloat(a.fill) - parseFloat(b2.fill));
console.table(rows);
void NUM;
