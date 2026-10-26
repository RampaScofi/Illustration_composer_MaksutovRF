import type { Box, Size, ViewBox } from "@/types/geometry";

const SEPARATOR = /[,;\s]+/;

/**
 * Разбирает строку viewBox ("minX minY width height").
 * Возвращает null для некорректного значения — вызывающий код обязан
 * отказать в импорте компонента, а не подставлять «приблизительные» размеры.
 */
export function parseViewBox(raw: string | null | undefined): ViewBox | null {
  if (!raw) return null;

  const parts = raw.trim().split(SEPARATOR).filter(Boolean);
  if (parts.length !== 4) return null;

  const numbers = parts.map(Number);
  if (numbers.some((n) => !Number.isFinite(n))) return null;

  const [x, y, width, height] = numbers;
  if (width <= 0 || height <= 0) return null;

  return { x, y, width, height };
}

/** Собирает строку viewBox, пригодную для записи в SVG-атрибут. */
export function serializeViewBox(viewBox: ViewBox): string {
  return [viewBox.x, viewBox.y, viewBox.width, viewBox.height].join(" ");
}

export function aspectRatio(size: Size): number {
  return size.width / size.height;
}

/**
 * Вписывает источник в целевой бокс с сохранением пропорций (аналог CSS contain).
 * Используется для размещения компонента на холсте без деформации вектора.
 */
export function fitInside(source: Size, target: Box): Box {
  const scale = Math.min(target.width / source.width, target.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;

  return {
    x: target.x + (target.width - width) / 2,
    y: target.y + (target.height - height) / 2,
    width,
    height,
  };
}

/**
 * Масштаб единой размерной сетки холста: сколько пикселей холста
 * приходится на единицу координат исходного viewBox.
 */
export function uniformScale(source: Size, target: Size): number {
  return Math.min(target.width / source.width, target.height / source.height);
}
