import type { CanvasFormat, CanvasFormatId } from "@/types/composition";
import type { Box, Size } from "@/types/geometry";

/**
 * Форматы холста. Значения по умолчанию — логические единицы векторного
 * viewBox итогового документа, растеризация не выполняется.
 */
export const CANVAS_FORMATS: readonly CanvasFormat[] = [
  { id: "16:9", label: "Обложка 16:9", width: 1920, height: 1080 },
  { id: "4:3", label: "Статья 4:3", width: 1600, height: 1200 },
  { id: "1:1", label: "Квадрат 1:1", width: 1200, height: 1200 },
  { id: "4:5", label: "Вертикаль 4:5", width: 1080, height: 1350 },
  { id: "9:16", label: "Сторис 9:16", width: 1080, height: 1920 },
  { id: "3:1", label: "Баннер 3:1", width: 1800, height: 600 },
] as const;

export function findCanvasFormat(id: CanvasFormatId): CanvasFormat | null {
  return CANVAS_FORMATS.find((format) => format.id === id) ?? null;
}

export function resolveCanvasSize(id: CanvasFormatId, custom?: Partial<Size>): Size {
  const format = findCanvasFormat(id);
  const base = format ?? CANVAS_FORMATS[0];

  const width = custom?.width && custom.width > 0 ? custom.width : base.width;
  const height = custom?.height && custom.height > 0 ? custom.height : base.height;

  return { width, height };
}

/**
 * Поля вокруг холста, в пределах которых допускается размещать объекты,
 * чтобы композиция не выходила за границы экспортируемого документа.
 */
export function contentBox(canvas: Size, paddingRatio = 0.04): Box {
  const paddingX = canvas.width * paddingRatio;
  const paddingY = canvas.height * paddingRatio;

  return {
    x: paddingX,
    y: paddingY,
    width: canvas.width - paddingX * 2,
    height: canvas.height - paddingY * 2,
  };
}
