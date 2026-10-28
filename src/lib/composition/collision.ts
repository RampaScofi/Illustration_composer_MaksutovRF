import type { Size } from "../../types/geometry.ts";
import { areaOf, boundsOf, fitsCanvas, overlapArea, type Piece } from "./pieces.ts";

/**
 * Collision Validator: проверяет перекрытия экземпляров по политике overlapPolicy.
 *
 * allow — перекрытие допустимо (штрафа нет);
 * avoid — перекрытие нежелательно, штраф пропорционален площади;
 * forbid — перекрытие недопустимо: раскладка считается невалидной.
 *
 * Отдельное правило: главный объект может закрыть соседями не больше
 * MAIN_OCCLUSION_LIMIT своей площади, иначе раскладка получает штраф.
 */

/** Доля площади главного объекта, которую могут закрыть соседи. */
export const MAIN_OCCLUSION_LIMIT = 0.2;

/**
 * Допустимая доля перекрытия даже при политике "allow".
 * Полностью запрещать наложения не нужно: лёгкий заход соседей — нормальный
 * приём. Но когда один объект наезжает на другой больше, чем на эту долю его
 * собственной площади, перекрытие становится заметным дефектом, и раскладка
 * должна за него отвечать.
 */
export const SOFT_OVERLAP_LIMIT = 0.12;

/** Штраф за перекрытие сверх SOFT_OVERLAP при допустимой политике. */
function softOverlapPenalty(ratio: number): number {
  if (ratio <= SOFT_OVERLAP_LIMIT) return 0;
  return (ratio - SOFT_OVERLAP_LIMIT) * 40;
}

export type Collision = {
  a: number;
  b: number;
  area: number;
  /** Доля площади меньшего из двух объектов, которую занимает перекрытие. */
  ratio: number;
  avoid: boolean;
  forbid: boolean;
};

/** Все пары с перекрытием, включая допустимые (allow). Индексы — в pieces. */
export function findCollisions(pieces: readonly Piece[]): Collision[] {
  const bounds = pieces.map(boundsOf);
  const result: Collision[] = [];
  for (let i = 0; i < pieces.length; i += 1) {
    for (let j = i + 1; j < pieces.length; j += 1) {
      const area = overlapArea(bounds[i], bounds[j]);
      if (area <= 0) continue;
      const smaller = Math.min(areaOf(bounds[i]), areaOf(bounds[j]));
      result.push({
        a: i,
        b: j,
        area,
        ratio: smaller > 0 ? area / smaller : 1,
        avoid: pieces[i].overlap === "avoid" || pieces[j].overlap === "avoid",
        forbid: pieces[i].overlap === "forbid" || pieces[j].overlap === "forbid",
      });
    }
  }
  return result;
}

/** Жёсткие нарушения: запрещённое перекрытие или выход за край холста больше допустимого. */
export function hasHardViolation(pieces: readonly Piece[], canvas: Size): boolean {
  if (findCollisions(pieces).some((c) => c.forbid)) return true;
  return pieces.some((piece) => !fitsCanvas(boundsOf(piece), canvas));
}

/** Мягкий штраф за нежелательные перекрытия и закрытие главного объекта. Меньше — лучше. */
export function collisionPenalty(pieces: readonly Piece[]): number {
  let penalty = 0;
  for (const collision of findCollisions(pieces)) {
    if (collision.forbid) penalty += 100 + collision.ratio * 100;
    else if (collision.avoid) penalty += collision.ratio * 20;
    else penalty += softOverlapPenalty(collision.ratio);
  }

  const main = pieces[0];
  if (main) {
    const mainBox = boundsOf(main);
    const mainArea = areaOf(mainBox);
    if (mainArea > 0) {
      let covered = 0;
      for (const collision of findCollisions(pieces)) {
        if (collision.a === 0 || collision.b === 0) covered += collision.area;
      }
      const share = Math.min(1, covered / mainArea);
      if (share > MAIN_OCCLUSION_LIMIT) penalty += (share - MAIN_OCCLUSION_LIMIT) * 100;
    }
  }
  return penalty;
}