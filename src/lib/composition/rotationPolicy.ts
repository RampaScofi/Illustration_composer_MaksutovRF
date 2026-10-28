import type { Size } from "../../types/geometry.ts";
import { boundsOf, fitsCanvas, type Piece } from "./pieces.ts";
import { scoreLayout } from "./scorer.ts";

/**
 * Rotation Policy Engine: поворот экземпляров по политике и диапазону из метаданных.
 *
 * Угол берётся из rotationRange объекта. Поворот принимается, только если
 * повёрнутый объект остаётся в границах холста и общая оценка раскладки
 * падает не больше чем на MAX_SCORE_LOSS.
 * Ручной поворот пользователя сюда не относится: он не трогается.
 */

/** Допустимое падение оценки раскладки из-за поворота. */
export const MAX_SCORE_LOSS = 0.02;

/**
 * Угол из диапазона. Случайное число тратится всегда, чтобы
 * последовательность зерна не зависела от наличия поворота.
 */
export function pickAngle(rand: () => number, range?: readonly [number, number]): number {
  const t = rand();
  if (!range || range[0] > range[1]) return 0;
  return Math.round(range[0] + (range[1] - range[0]) * t) || 0;
}

/** Применяет повороты к экземплярам. Меняет pieces. */
export function applyRotations(pieces: Piece[], canvas: Size, rand: () => number): void {
  for (const piece of pieces) {
    const angle = pickAngle(rand, piece.rotationRange);
    if (angle === 0) continue;

    const before = scoreLayout(pieces, canvas).total;
    const previous = piece.angle;
    piece.angle = angle;
    const keeps = fitsCanvas(boundsOf(piece), canvas);
    const accepted = keeps && scoreLayout(pieces, canvas).total >= before - MAX_SCORE_LOSS;
    if (!accepted) piece.angle = previous;
  }
}