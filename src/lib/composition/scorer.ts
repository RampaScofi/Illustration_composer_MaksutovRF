import type { Size } from "../../types/geometry.ts";
import { areaOf, boundsOf, clamp, unionBoxes, type Piece } from "./pieces.ts";
import { collisionPenalty, hasHardViolation } from "./collision.ts";

/**
 * Composition Scorer: оценивает одну раскладку и позволяет сравнивать варианты.
 *
 * Компоненты (каждый от 0 до 1, больше — лучше):
 * balance   — группа симметрично относительно центра холста;
 * hierarchy — главный объект крупнее остальных и занимает разумную долю холста;
 * space     — группа занимает разумную долю холста (не пустая и не тесная);
 * clean     — мало нежелательных перекрытий.
 *
 * Невалидная раскладка (жёсткое нарушение) получает total = -1 и всегда проигрывает валидной.
 */

export type Score = {
  balance: number;
  hierarchy: number;
  space: number;
  clean: number;
  valid: boolean;
  total: number;
};

/**
 * Доля холста, которую должен занимать главный объект.
 * Верхняя граница заметно ниже половины холста: как только главный объект
 * перерастает её, он перестаёт читаться как часть сцены и начинает
 * перекрывать соседей.
 */
const MAIN_COVERAGE: readonly [number, number] = [0.1, 0.3];
/** Доля холста, которую группа должна занимать. */
const GROUP_COVERAGE: readonly [number, number] = [0.2, 0.75];

const WEIGHTS = { balance: 0.35, hierarchy: 0.3, space: 0.2, clean: 0.15 } as const;

/** Оценка доли, попадающей в диапазон [min, max]: 1 внутри, плавно убывает снаружи. */
function rangeScore(value: number, [min, max]: readonly [number, number]): number {
  if (value <= 0) return 0;
  if (value < min) return clamp(value / min, 0, 1);
  if (value > max) return clamp(max / value, 0, 1);
  return 1;
}

export function scoreLayout(pieces: readonly Piece[], canvas: Size): Score {
  const valid = pieces.length > 0 && !hasHardViolation(pieces, canvas);
  const canvasArea = canvas.width * canvas.height;
  const bounds = pieces.map(boundsOf);
  const group = unionBoxes(bounds);

  const offset = canvas.width > 0 ? Math.abs(group.x + group.width / 2 - canvas.width / 2) / canvas.width : 0;
  const balance = clamp(1 - offset * 4, 0, 1);

  let hierarchy = 0;
  let space = 0;
  if (canvasArea > 0 && bounds.length > 0) {
    const mainArea = areaOf(bounds[0]);
    const others = bounds.slice(1).map(areaOf);
    const maxOther = others.length > 0 ? Math.max(...others) : 0;
    const sizeScore = maxOther > 0 ? clamp(mainArea / (maxOther * 1.5), 0, 1) : 1;
    const coverageScore = rangeScore(mainArea / canvasArea, MAIN_COVERAGE);
    hierarchy = (sizeScore + coverageScore) / 2;
    space = rangeScore(areaOf(group) / canvasArea, GROUP_COVERAGE);
  }

  const clean = 1 / (1 + collisionPenalty(pieces));
  const total = valid
    ? WEIGHTS.balance * balance + WEIGHTS.hierarchy * hierarchy + WEIGHTS.space * space + WEIGHTS.clean * clean
    : -1;

  return { balance, hierarchy, space, clean, valid, total };
}

/** true, если оценка a лучше оценки b. Валидная всегда лучше невалидной; при равенстве побеждает первая. */
export function isBetterScore(a: Score, b: Score | null): boolean {
  if (!b) return true;
  if (a.valid !== b.valid) return a.valid;
  return a.total > b.total;
}