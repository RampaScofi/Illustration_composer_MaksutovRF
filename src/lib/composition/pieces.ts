import type { Box, Size } from "../../types/geometry.ts";
import type { OverlapPolicy } from "../../types/library.ts";

/**
 * Общие примитивы движков компоновки: геометрия, случайность, экземпляры.
 * Все боксы в координатах холста. Поворот выполняется вокруг центра бокса.
 * Геометрия исходного SVG не меняется: объект масштабируется и смещается целиком.
 */

/** Доля размера объекта, которая может выйти за край холста с каждой стороны. */
export const MAX_CROP = 0.25;

/** Допуск на ошибки округления при сравнении координат. */
export const EPS = 1e-6;

/** Минимальный масштаб объекта относительно доступного места. */
export const MIN_PREFERRED_SCALE = 0.2;

/** Роль экземпляра в композиции. */
export type PieceRole = "main" | "secondary" | "copy" | "background";

/** Минимум данных объекта, нужный для расстановки. */
export type SizedItem = {
  componentId: string;
  /** Исходный размер SVG (viewBox). Пропорции сохраняются всегда. */
  intrinsic: Size;
  preferredScale?: number;
  overlapPolicy?: OverlapPolicy;
  rotationRange?: readonly [number, number];
};

/** Размещённый экземпляр. */
export type Piece = {
  componentId: string;
  role: PieceRole;
  /** Невращённый прямоугольник экземпляра. */
  box: Box;
  /** Угол поворота в градусах вокруг центра бокса. */
  angle: number;
  overlap: OverlapPolicy;
  rotationRange?: readonly [number, number];
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Масштаб из preferredScale: отсутствующее или некорректное значение — 1. */
export function scaleOf(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return clamp(value, MIN_PREFERRED_SCALE, 1);
}

/** Генератор Mulberry32: детерминированная последовательность по зерну. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function between(rand: () => number, [min, max]: readonly [number, number]): number {
  return min + (max - min) * rand();
}

export function jitter(rand: () => number, amplitude: number): number {
  return (rand() * 2 - 1) * amplitude;
}

export function bottomOf(box: Box): number {
  return box.y + box.height;
}

export function areaOf(box: Box): number {
  return Math.max(0, box.width) * Math.max(0, box.height);
}

/** Вписывает исходный размер в бокс с сохранением пропорций. */
export function fitInto(intrinsic: Size, box: Size): Size {
  if (intrinsic.width <= 0 || intrinsic.height <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(box.width / intrinsic.width, box.height / intrinsic.height);
  return { width: intrinsic.width * scale, height: intrinsic.height * scale };
}

export function safeBox(canvas: Size, paddingRatio = 0.06): Box {
  const pad = Math.min(canvas.width, canvas.height) * paddingRatio;
  return {
    x: pad,
    y: pad,
    width: Math.max(0, canvas.width - pad * 2),
    height: Math.max(0, canvas.height - pad * 2),
  };
}

export function boxesOverlap(a: Box, b: Box, margin = 0): boolean {
  return !(
    a.x + a.width + margin <= b.x ||
    b.x + b.width + margin <= a.x ||
    a.y + a.height + margin <= b.y ||
    b.y + b.height + margin <= a.y
  );
}

export function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(bottomOf(a), bottomOf(b)) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Охватывающий прямоугольник набора боксов. Пустой набор даёт нулевой бокс. */
export function unionBoxes(boxes: readonly Box[]): Box {
  if (boxes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => bottomOf(b)));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Охватывающий прямоугольник повёрнутого бокса (поворот вокруг центра). */
export function rotatedBounds(box: Box, angle: number): Box {
  if (angle === 0) return box;
  const rad = (angle * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const width = box.width * cos + box.height * sin;
  const height = box.width * sin + box.height * cos;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

/** Границы экземпляра на холсте с учётом поворота. */
export function boundsOf(piece: Piece): Box {
  return rotatedBounds(piece.box, piece.angle);
}

/** Бокс не выходит за край холста больше чем на MAX_CROP своего размера. */
export function fitsCanvas(box: Box, canvas: Size): boolean {
  return (
    box.x >= -box.width * MAX_CROP - EPS &&
    box.y >= -box.height * MAX_CROP - EPS &&
    box.x + box.width <= canvas.width + box.width * MAX_CROP + EPS &&
    box.y + box.height <= canvas.height + box.height * MAX_CROP + EPS
  );
}

/** Ограничивает позицию бокса: за край холста выходит не больше MAX_CROP его размера. */
export function keepMostlyInside(box: Box, canvas: Size): Box {
  return {
    ...box,
    x: clamp(box.x, -box.width * MAX_CROP, canvas.width - box.width * (1 - MAX_CROP)),
    y: clamp(box.y, -box.height * MAX_CROP, canvas.height - box.height * (1 - MAX_CROP)),
  };
}

/**
 * Допустимый горизонтальный сдвиг группы: ни один бокс не выходит за край
 * холста больше чем на MAX_CROP своего размера.
 */
export function horizontalShiftRange(boxes: readonly Box[], canvasWidth: number): [number, number] {
  let min = -Infinity;
  let max = Infinity;
  for (const box of boxes) {
    min = Math.max(min, -box.width * MAX_CROP - box.x);
    max = Math.min(max, canvasWidth + box.width * MAX_CROP - (box.x + box.width));
  }
  return [min, max];
}

/** Масштаб группы относительно точки (ax, ay) с сохранением взаимного расположения. Меняет pieces. */
export function scaleAround(pieces: Piece[], k: number, ax: number, ay: number): void {
  for (const piece of pieces) {
    const { box } = piece;
    piece.box = {
      x: ax + (box.x - ax) * k,
      y: ay + (box.y - ay) * k,
      width: box.width * k,
      height: box.height * k,
    };
  }
}

/** Сдвиг группы по горизонтали. Меняет pieces. */
export function shiftBy(pieces: Piece[], dx: number): void {
  for (const piece of pieces) {
    piece.box = { ...piece.box, x: piece.box.x + dx };
  }
}

/** Создаёт экземпляр из объекта библиотеки. Поворот и перекрытие берутся из метаданных. */
export function pieceFrom(item: SizedItem, box: Box, role: PieceRole): Piece {
  return {
    componentId: item.componentId,
    role,
    box,
    angle: 0,
    overlap: item.overlapPolicy ?? "allow",
    rotationRange: item.rotationRange,
  };
}