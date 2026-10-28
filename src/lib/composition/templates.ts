import type { Size } from "../../types/geometry.ts";

/**
 * Layout Templates Engine: выбор шаблона раскладки по формату холста.
 *
 * A — главный объект с вспомогательными вдоль линии стола (по умолчанию);
 * B — диагональ от главного к противоположному нижнему краю;
 * C — компактная группа из 2–3 объектов, вспомогательные заходят друг на друга;
 * D — горизонталь: широкие форматы (16:9, 4:3, 3:1);
 * E — вертикаль: высокие форматы (4:5, 9:16).
 *
 * Квадрат (1:1): один главный — A, 2–3 — C, больше трёх — A или B по зерну.
 */
export type LayoutPreset = "A" | "B" | "C" | "D" | "E";

/** Отношение ширины к высоте, с которого холст считается горизонтальным. */
export const WIDE_RATIO = 1.25;
/** Отношение ширины к высоте, до которого холст считается вертикальным. */
export const TALL_RATIO = 0.85;

export function canvasRatio(canvas: Size): number {
  return canvas.height > 0 ? canvas.width / canvas.height : 1;
}

/** Выбирает шаблон по формату холста и числу главных объектов. Зерно нужно только для квадрата. */
export function choosePreset(canvas: Size, primaryCount: number, seed: number): LayoutPreset {
  const ratio = canvasRatio(canvas);
  if (ratio >= WIDE_RATIO) return "D";
  if (ratio <= TALL_RATIO) return "E";
  if (primaryCount <= 1) return "A";
  if (primaryCount <= 3) return "C";
  return (seed >>> 0) % 2 === 0 ? "A" : "B";
}