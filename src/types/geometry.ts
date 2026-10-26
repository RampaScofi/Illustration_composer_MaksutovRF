/**
 * Базовые геометрические типы.
 * Используются всеми слоями: SVG-обработка, сборка композиции, экспорт.
 */

export type ViewBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export type Size = {
  width: number;
  height: number;
};

export type Box = Point & Size;

/** Поворот элемента в градусах вокруг собственной точки вращения. */
export type Rotation = number;
