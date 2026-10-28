import type { Box, Size } from "../../types/geometry.ts";

/**
 * Метрика визуального веса SVG-компонента.
 *
 * Вычисляет отношение площади залитых фигур и штрихов к площади bbox.
 * Низкое значение → разреженная графика (лайнерарт, большие пустоты) → объект
 * должен быть меньше в композиции.
 *
 * Алгоритм:
 * 1. Парсит path/rect/circle/ellipse/polygon/polyline/line.
 * 2. Для замкнутых с fill — шнуровая формула (shoelace), абсолютное значение
 *    площади по замкнутому контуру. Пересекающиеся контуры суммируются (union
 *    не нужен: это оценка «визуального веса», а не точная площадь).
 * 3. Для незамкнутых и штриховых — длина ломаной × strokeWidth.
 * 4. density = min(1, (sum_fill + sum_stroke) / bboxArea).
 *
 * Значение проверяемо: для квадрата 100×100 с fill даёт 1.0, для круга
 * радиуса 50 — ~0.785, для тонкой рамки — близко к 0.
 */

type Point = [number, number];

/** Вспомогательная структура для накопления контуров. */
type PathSegment = { points: Point[]; closed: boolean; fill: boolean; stroke: boolean; strokeWidth: number };

/** Матрица SVG [a b c d e f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function applyMatrix(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Простой парсер строки transform. */
export function parseTransform(value: string | null | undefined): Matrix {
  if (!value) return IDENTITY;
  let m = IDENTITY;
  const re = /(translate|scale|rotate|skewX|skewY|matrix)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value)) !== null) {
    const args = parseNumbers(match[2]);
    let part: Matrix = IDENTITY;
    switch (match[1]) {
      case "translate":
        part = [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0];
        break;
      case "scale":
        part = [args[0] ?? 1, 0, 0, args[1] ?? args[0] ?? 1, 0, 0];
        break;
      case "rotate": {
        if (args.length > 0) {
          const rad = (args[0] * Math.PI) / 180;
          part = [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), 0, 0];
          if (args.length >= 3) {
            const cx = args[1], cy = args[2];
            part = multiply(multiply([1, 0, 0, 1, cx, cy], part), [1, 0, 0, 1, -cx, -cy]);
          }
        }
        break;
      }
      case "skewX":
        if (args.length > 0) part = [1, 0, Math.tan((args[0] * Math.PI) / 180), 1, 0, 0];
        break;
      case "skewY":
        if (args.length > 0) part = [1, 0, 0, 1, Math.tan((args[0] * Math.PI) / 180), 0];
        break;
      case "matrix":
        if (args.length >= 6) part = [args[0], args[1], args[2], args[3], args[4], args[5]];
        break;
    }
    m = multiply(m, part);
  }
  return m;
}

function parseNumbers(s: string): number[] {
  const found = s.match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g);
  return found ? found.map(Number) : [];
}

/** Вычисляет площадь замкнутого полигона (шнуровая формуна, абсолютное значение). */
function shoelaceArea(pts: Point[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const j = (i + 1) % pts.length;
    area += pts[i][0] * pts[j][1];
    area -= pts[j][0] * pts[i][1];
  }
  return Math.abs(area) / 2;
}

/** Длина ломаной. */
function polylineLength(pts: Point[]): number {
  let len = 0;
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const dx = pts[i + 1][0] - pts[i][0];
    const dy = pts[i + 1][1] - pts[i][1];
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}

/** Аппроксимация кривой Безье отрезками. */
function cubicApprox(
  p0: Point, p1: Point, p2: Point, p3: Point,
  steps: number,
): Point[] {
  const pts: Point[] = [];
  for (let s = 1; s <= steps; s += 1) {
    const t = s / steps;
    const u = 1 - t;
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return pts;
}

/** Разбор одного path-элемента. */
function parsePathElement(d: string, strokeW: number, strokeAttr: string, fillAttr: string | null): PathSegment[] {
  const segments: PathSegment[] = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let ctrlX = 0;
  let ctrlY = 0;

  const expected: Record<string, number> = {
    M: 2, m: 2, L: 2, l: 2, H: 1, h: 1, V: 1, v: 1,
    C: 6, c: 6, S: 4, s: 4, Q: 4, q: 4, T: 2, t: 2, A: 7, a: 7,
  };

  const current: Point[] = [];

  /** Замкнут ли текущий подпуть командой Z: от этого зависит заливка. */
  let sawClose = false;

  const flushSubpath = () => {
    if (current.length >= 2) {
      segments.push({
        points: current.slice(),
        closed: sawClose,
        fill: sawClose && !!fillAttr && fillAttr !== "none",
        stroke: !!strokeAttr && strokeAttr !== "none",
        strokeWidth: strokeW,
      });
    }
    current.length = 0;
    sawClose = false;
  };

  const addPoint = (x: number, y: number) => {
    current.push([x, y]);
  };

  const approxCurve = (
    x0: number, y0: number,
    x1: number, y1: number,
    x2: number, y2: number,
    x3: number, y3: number,
  ) => {
    const pts: Point[] = [];
    for (let s = 1; s <= 8; s += 1) {
      const t = s / 8;
      const u = 1 - t;
      pts.push([
        u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
        u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
      ]);
    }
    current.push(...pts);
  };

  let pending: string | null = null;
  const pendingArgs: number[] = [];

  const execute = (cmd: string, args: number[]) => {
    switch (cmd) {
      case "M":
        flushSubpath();
        cx = args[0]; cy = args[1];
        sx = cx; sy = cy;
        addPoint(cx, cy);
        pending = "L";
        break;
      case "m":
        flushSubpath();
        cx += args[0]; cy += args[1];
        sx = cx; sy = cy;
        addPoint(cx, cy);
        pending = "l";
        break;
      case "L": addPoint(cx = args[0], cy = args[1]); break;
      case "l": addPoint(cx += args[0], cy += args[1]); break;
      case "H": addPoint(cx = args[0], cy); break;
      case "h": addPoint(cx += args[0], cy); break;
      case "V": addPoint(cx, cy = args[0]); break;
      case "v": addPoint(cx, cy += args[0]); break;
      case "C": {
        const ax = args[0], ay = args[1], bx = args[2], by = args[3], ex = args[4], ey = args[5];
        approxCurve(cx, cy, ax, ay, bx, by, ex, ey);
        ctrlX = bx; ctrlY = by;
        cx = ex; cy = ey;
        break;
      }
      case "c": {
        const ax = cx + args[0], ay = cy + args[1], bx = cx + args[2], by = cy + args[3];
        approxCurve(cx, cy, ax, ay, bx, by, cx + args[4], cy + args[5]);
        ctrlX = bx; ctrlY = by;
        cx += args[4]; cy += args[5];
        break;
      }
      case "S": {
        const r1x = 2 * cx - ctrlX, r1y = 2 * cy - ctrlY;
        approxCurve(cx, cy, r1x, r1y, args[0], args[1], args[2], args[3]);
        ctrlX = args[0]; ctrlY = args[1];
        cx = args[2]; cy = args[3];
        break;
      }
      case "s": {
        const r1x = 2 * cx - ctrlX, r1y = 2 * cy - ctrlY;
        approxCurve(cx, cy, r1x, r1y, cx + args[0], cy + args[1], cx + args[2], cy + args[3]);
        ctrlX = cx + args[0]; ctrlY = cy + args[1];
        cx += args[2]; cy += args[3];
        break;
      }
      case "Q": {
        const cx0 = cx, cy0 = cy;
        const qx = args[0], qy = args[1], ex = args[2], ey = args[3];
        // Квадратичную аппроксимируем кубической
        approxCurve(cx, cy, (cx0 + 2 * qx) / 3, (cy0 + 2 * qy) / 3, (ex + 2 * qx) / 3, (ey + 2 * qy) / 3, ex, ey);
        ctrlX = qx; ctrlY = qy;
        cx = ex; cy = ey;
        break;
      }
      case "q": {
        const qx = cx + args[0], qy = cy + args[1], ex = cx + args[2], ey = cy + args[3];
        approxCurve(cx, cy, (cx + 2 * qx) / 3, (cy + 2 * qy) / 3, (ex + 2 * qx) / 3, (ey + 2 * qy) / 3, ex, ey);
        ctrlX = qx; ctrlY = qy;
        cx = ex; cy = ey;
        break;
      }
      case "T": {
        const r1x = 2 * cx - ctrlX, r1y = 2 * cy - ctrlY;
        const ex = args[0], ey = args[1];
        approxCurve(cx, cy, r1x, r1y, (ex + 2 * r1x) / 3, (ey + 2 * r1y) / 3, ex, ey);
        ctrlX = r1x; ctrlY = r1y;
        cx = ex; cy = ey;
        break;
      }
      case "t": {
        const r1x = 2 * cx - ctrlX, r1y = 2 * cy - ctrlY;
        const ex = cx + args[0], ey = cy + args[1];
        approxCurve(cx, cy, r1x, r1y, (ex + 2 * r1x) / 3, (ey + 2 * r1y) / 3, ex, ey);
        ctrlX = r1x; ctrlY = r1y;
        cx = ex; cy = ey;
        break;
      }
      case "A": {
        const rx = args[0], ry = args[1];
        const large = args[3] === 1;
        const sweep = args[4] === 1;
        const ex = args[5], ey = args[6];
        const mx = (cx + ex) / 2 - (sweep ? 1 : -1) * (ey - cy) * 0.28;
        const my = (cy + ey) / 2 + (sweep ? 1 : -1) * (ex - cx) * 0.28;
        approxCurve(cx, cy, mx, my, mx, my, ex, ey);
        cx = ex; cy = ey;
        break;
      }
      case "a": {
        const rx = args[0], ry = args[1];
        const sweep = args[4] === 1;
        const ex = cx + args[5], ey = cy + args[6];
        const mx = (cx + ex) / 2 - (sweep ? 1 : -1) * (ey - cy) * 0.28;
        const my = (cy + ey) / 2 + (sweep ? 1 : -1) * (ex - cx) * 0.28;
        approxCurve(cx, cy, mx, my, mx, my, ex, ey);
        cx = ex; cy = ey;
        break;
      }
      case "Z":
      case "z":
        if (current.length >= 2) current.push([current[0][0], current[0][1]]);
        sawClose = true;
        cx = sx; cy = sy;
        break;
    }
  };

  // Парсинг d-атрибута
  const re = /([MmZzLlHhVvCcSsQqTtAa])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
  let token: RegExpExecArray | null;
  while ((token = re.exec(d)) !== null) {
    if (token[1]) {
      if (token[1] === "Z" || token[1] === "z") {
        if (pending && pendingArgs.length) execute(pending, pendingArgs.splice(0, pendingArgs.length));
        execute(token[1], []);
        pending = null;
        continue;
      }
      if (pending && pendingArgs.length >= expected[pending]) {
        execute(pending, pendingArgs.splice(0, expected[pending]));
        if (pendingArgs.length) continue;
      }
      pending = token[1];
    } else if (pending) {
      pendingArgs.push(parseFloat(token[2]));
      const need = expected[pending];
      while (pendingArgs.length >= need) {
        execute(pending, pendingArgs.splice(0, need));
      }
    }
  }
  if (pending && pendingArgs.length) execute(pending, pendingArgs);
  flushSubpath();
  return segments;
}

/** Извлекает атрибут тега. */
function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`));
  return m ? m[1] : null;
}

function numAttr(tag: string, name: string, fallback = 0): number {
  const raw = attr(tag, name);
  if (!raw) return fallback;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Видимый ли элемент: атрибуты display/visibility, inline-стиль и opacity. */
function isVisible(raw: string, parentFill: string | null, parentStroke: string | null): boolean {
  if (/\bdisplay\s*=\s*"none"/i.test(raw)) return false;
  if (/\bvisibility\s*=\s*"(hidden|collapse)"/i.test(raw)) return false;
  if (/(?:^|[\s;"'])display\s*:\s*none/i.test(raw)) return false;
  if (/(?:^|[\s;"'])visibility\s*:\s*hidden/i.test(raw)) return false;
  const opacity = raw.match(/\bopacity\s*=\s*"([\d.]+)"/);
  if (opacity && parseFloat(opacity[1]) === 0) return false;
  const fill = attr(raw, "fill") ?? parentFill;
  const stroke = attr(raw, "stroke") ?? parentStroke;
  return !(fill === "none" && (stroke === null || stroke === "none" || stroke === ""));
}

/** Результат метрики. */
export type SvgMetrics = {
  viewBox: Box;
  bbox: Box;
  fillArea: number;
  strokeArea: number;
  totalArea: number;
  bboxArea: number;
  density: number;
};

/**
 * Вычисляет метрики визуального веса SVG.
 * @param svgText — текст SVG-документа
 * @param steps — количество шагов для аппроксимации кривых (8 — достаточно)
 * @returns метрики
 */
export function computeSvgMetrics(svgText: string, steps = 8): SvgMetrics {
  const svgMatch = svgText.match(/<svg\b[^>]*>/i);
  let viewBox: Box = { x: 0, y: 0, width: 0, height: 0 };
  if (svgMatch) {
    const vb = svgMatch[0].match(/viewBox\s*=\s*"([^"]*)"/);
    if (vb) {
      const n = parseNumbers(vb[1]);
      if (n.length === 4) viewBox = { x: n[0], y: n[1], width: n[2], height: n[3] };
    } else {
      const w = svgMatch[0].match(/width\s*=\s*"([\d.]+)/);
      const h = svgMatch[0].match(/height\s*=\s*"([\d.]+)/);
      viewBox = { x: 0, y: 0, width: w ? parseFloat(w[1]) : 0, height: h ? parseFloat(h[1]) : 0 };
    }
  }

  // Убираем defs, комментарии, заголовок SVG
  const body = svgText
    .replace(/<svg\b[^>]*>/i, "")
    .replace(/<\/svg>/i, "")
    .replace(/<defs\b[\s\S]*?<\/defs>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  type Frame = { matrix: Matrix; fill: string | null; stroke: string | null; strokeW: number };
  const stack: Frame[] = [{ matrix: IDENTITY, fill: null, stroke: null, strokeW: 1 }];

  let totalFillArea = 0;
  let totalStrokeArea = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const tagRe = /<(\/?)(svg|g|path|rect|circle|ellipse|line|polygon|polyline)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let token: RegExpExecArray | null;

  while ((token = tagRe.exec(body)) !== null) {
    const closing = token[1] === "/";
    const name = token[2];
    const raw = token[3];

    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }

    const parent = stack[stack.length - 1];
    const fill = attr(raw, "fill") ?? parent.fill;
    const stroke = attr(raw, "stroke") ?? parent.stroke;
    const strokeW = numAttr(raw, "stroke-width", parent.strokeW);

    if (name === "svg" || name === "g") {
      stack.push({ matrix: multiply(parent.matrix, parseTransform(attr(raw, "transform"))), fill, stroke, strokeW });
      continue;
    }

    if (!isVisible(raw, parent.fill, parent.stroke)) continue;

    const m = multiply(parent.matrix, parseTransform(attr(raw, "transform")));

    const applyTo = (x: number, y: number): [number, number] => applyMatrix(m, x, y);

    // Обновляем bbox
    const pushBbox = (x: number, y: number) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    };

    if (name === "path") {
      const d = attr(raw, "d");
      if (!d) continue;
      const segments = parsePathElement(d, strokeW, stroke ?? "", fill);
      for (const seg of segments) {
        const pts: Point[] = seg.points.map((p) => applyTo(p[0], p[1]));
        for (const p of pts) pushBbox(p[0], p[1]);
        if (seg.fill) {
          totalFillArea += shoelaceArea(pts);
        }
        if (seg.stroke) {
          totalStrokeArea += polylineLength(pts) * seg.strokeWidth;
        }
      }
    } else if (name === "rect") {
      const x = numAttr(raw, "x");
      const y = numAttr(raw, "y");
      const w = numAttr(raw, "width");
      const h = numAttr(raw, "height");
      if (w > 0 && h > 0) {
        const pts: Point[] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map((p) => applyTo(p[0], p[1]));
        for (const p of pts) pushBbox(p[0], p[1]);
        if (fill && fill !== "none") totalFillArea += shoelaceArea(pts);
        if (stroke && stroke !== "none") totalStrokeArea += (w + h) * 2 * strokeW;
      }
    } else if (name === "circle") {
      const cx = numAttr(raw, "cx");
      const cy = numAttr(raw, "cy");
      const r = numAttr(raw, "r");
      if (r > 0) {
        const pts: Point[] = [];
        for (let a = 0; a < 360; a += 7.5) {
          const rad = (a * Math.PI) / 180;
          pts.push(applyTo(cx + r * Math.cos(rad), cy + r * Math.sin(rad)));
        }
        for (const p of pts) pushBbox(p[0], p[1]);
        if (fill && fill !== "none") totalFillArea += shoelaceArea(pts);
        if (stroke && stroke !== "none") totalStrokeArea += 2 * Math.PI * r * strokeW;
      }
    } else if (name === "ellipse") {
      const cx = numAttr(raw, "cx");
      const cy = numAttr(raw, "cy");
      const rx = numAttr(raw, "rx");
      const ry = numAttr(raw, "ry");
      if (rx > 0 && ry > 0) {
        const pts: Point[] = [];
        for (let a = 0; a < 360; a += 7.5) {
          const rad = (a * Math.PI) / 180;
          pts.push(applyTo(cx + rx * Math.cos(rad), cy + ry * Math.sin(rad)));
        }
        for (const p of pts) pushBbox(p[0], p[1]);
        if (fill && fill !== "none") totalFillArea += shoelaceArea(pts);
        if (stroke && stroke !== "none") {
          totalStrokeArea += 2 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2) * strokeW;
        }
      }
    } else if (name === "polygon" || name === "polyline") {
      const ptsStr = attr(raw, "points");
      if (!ptsStr) continue;
      const nums = parseNumbers(ptsStr);
      if (nums.length < 4) continue;
      const pts: Point[] = [];
      for (let i = 0; i < nums.length; i += 2) pts.push(applyTo(nums[i], nums[i + 1]));
      for (const p of pts) pushBbox(p[0], p[1]);
      if (name === "polygon" && fill && fill !== "none") totalFillArea += shoelaceArea(pts);
      if (stroke && stroke !== "none") totalStrokeArea += polylineLength(pts) * strokeW;
    } else if (name === "line") {
      const x1 = numAttr(raw, "x1");
      const y1 = numAttr(raw, "y1");
      const x2 = numAttr(raw, "x2");
      const y2 = numAttr(raw, "y2");
      const [ax, ay] = applyTo(x1, y1);
      const [bx, by] = applyTo(x2, y2);
      pushBbox(ax, ay);
      pushBbox(bx, by);
      totalStrokeArea += Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2) * strokeW;
    }
  }

  const bbox: Box = {
    x: minX === Infinity ? 0 : minX,
    y: minY === Infinity ? 0 : minY,
    width: Math.max(maxX - minX, 0),
    height: Math.max(maxY - minY, 0),
  };
  const bboxArea = Math.max(bbox.width * bbox.height, 0.001);

  return {
    viewBox,
    bbox,
    fillArea: totalFillArea,
    strokeArea: totalStrokeArea,
    totalArea: totalFillArea + totalStrokeArea,
    bboxArea,
    density: Math.min(1, (totalFillArea + totalStrokeArea) / bboxArea),
  };
}

/** Коэффициент для preferredScale на основе плотности контента. */
export const REFERENCE_DENSITY = 0.55;
export const MIN_DENSITY_SCALE = 0.45;

export function densityToScale(density: number): number {
  if (!Number.isFinite(density) || density >= REFERENCE_DENSITY) return 1;
  return Math.max(MIN_DENSITY_SCALE, Math.sqrt(density / REFERENCE_DENSITY));
}