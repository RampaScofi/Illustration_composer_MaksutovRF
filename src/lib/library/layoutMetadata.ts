import type { LayoutItem } from "../composition/autoLayout.ts";
import type { LibraryComponent, OverlapPolicy, RotationPolicy } from "../../types/library.ts";
import { densityToScale } from "../svg/metrics.ts";

/**
 * Умолчания и правила для метаданных компоновки.
 *
 * Компонент без новых полей получает нейтральные значения: масштаб 1,
 * без поворота, перекрытия разрешены, конфликтов нет. Поэтому текущая библиотека
 * работает без изменений, а метаданные можно уточнять постепенно, без правок движка.
 * Значения из манифеста проверяются здесь: неизвестная строка заменяется умолчанием.
 */

/** Диапазон поворота по умолчанию, градусы. Применяется только при политике, допускающей поворот. */
export const DEFAULT_ROTATION_RANGE: readonly [number, number] = [-10, 10];

/** Предельный угол по политике, градусы. "locked" не поворачивается вообще. */
export const ROTATION_CAP: Readonly<Record<RotationPolicy, number>> = {
  locked: 0,
  upright: 5,
  limited: 15,
  free: 45,
};

/**
 * Политика для компонентов без явного rotationPolicy (в том числе всей текущей библиотеки).
 * Поворот разрешён в пределах DEFAULT_ROTATION_RANGE. Явное "locked" отключает поворот.
 */
export const DEFAULT_ROTATION_POLICY: RotationPolicy = "limited";

const ROTATION_POLICIES = Object.keys(ROTATION_CAP) as RotationPolicy[];
const OVERLAP_POLICIES: readonly OverlapPolicy[] = ["allow", "avoid", "forbid"];

export const MIN_SCALE = 0.2;
export const MAX_SCALE = 1;

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function isValidRange(range: unknown): range is [number, number] {
  return (
    Array.isArray(range) &&
    range.length === 2 &&
    typeof range[0] === "number" &&
    typeof range[1] === "number" &&
    Number.isFinite(range[0]) &&
    Number.isFinite(range[1]) &&
    range[0] <= range[1]
  );
}

/** Приводит масштаб к диапазону [MIN_SCALE, MAX_SCALE]. Отсутствующее значение — 1. */
export function sanitizeScale(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

/**
 * Эффективный диапазон поворота: пересечение заданного диапазона с пределом политики.
 * Отсутствующая или неизвестная политика — DEFAULT_ROTATION_POLICY. Для "locked" всегда [0, 0].
 */
export function effectiveRotationRange(
  policy: RotationPolicy | undefined,
  range?: readonly [number, number],
): [number, number] {
  const cap = ROTATION_CAP[pick(policy, ROTATION_POLICIES, DEFAULT_ROTATION_POLICY)];
  const [min, max] = isValidRange(range) ? range : DEFAULT_ROTATION_RANGE;
  const lo = Math.max(min, -cap);
  const hi = Math.min(max, cap);
  return lo <= hi ? [lo, hi] : [0, 0];
}

/** Два объекта не должны стоять в одной композиции, если хотя бы один указал другой в avoidWith. */
export function conflicts(a: LibraryComponent, b: LibraryComponent): boolean {
  return (a.avoidWith ?? []).includes(b.id) || (b.avoidWith ?? []).includes(a.id);
}

/**
 * Масштаб для движка компоновки.
 *
 * Явный preferredScale из манифеста — ручная настройка, она приоритетна.
 * Если его нет, масштаб берётся из измеренной плотности графики: объект,
 * у которого viewBox расчерчен редкими штрихами, визуально легче своего
 * прямоугольника, и без поправки он перетягивает на себя всю сцену.
 */
export function effectiveScale(component: LibraryComponent): number {
  const manual = typeof component.preferredScale === "number" ? component.preferredScale : null;
  if (manual !== null) return sanitizeScale(manual);
  if (typeof component.contentDensity === "number") {
    return sanitizeScale(densityToScale(component.contentDensity));
  }
  return 1;
}

/** Элемент для движка компоновки с уже проверенными метаданными. */
export function layoutItemFromComponent(component: LibraryComponent): LayoutItem {
  return {
    componentId: component.id,
    role: component.role,
    intrinsic: component.intrinsicSize,
    category: component.sourceIllustrationId,
    preferredScale: effectiveScale(component),
    rotationRange: effectiveRotationRange(component.rotationPolicy, component.rotationRange),
    overlapPolicy: pick(component.overlapPolicy, OVERLAP_POLICIES, "allow"),
  };
}