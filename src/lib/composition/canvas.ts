import type { CanvasFormat, CanvasFormatId, CompositionElement } from "@/types/composition";
import type { Box, Size } from "@/types/geometry";

/**
 * Форматы холста. Значения — логические единицы векторного viewBox итогового
 * документа; растеризация не выполняется. Пропорции точные, без округления
 * под экран: 1:1, 4:5, 9:16, 4:3, 16:9, 3:1.
 */
export const CANVAS_FORMATS: readonly CanvasFormat[] = [
  { id: "16:9", label: "Широкий 16:9", width: 1600, height: 900 },
  { id: "4:3", label: "Альбомный 4:3", width: 1200, height: 900 },
  { id: "1:1", label: "Квадрат 1:1", width: 1200, height: 1200 },
  { id: "4:5", label: "Вертикальный 4:5", width: 960, height: 1200 },
  { id: "9:16", label: "Stories 9:16", width: 675, height: 1200 },
  { id: "3:1", label: "Панорамный 3:1", width: 1800, height: 600 },
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

/**
 * Вписывает холст в контейнер предпросмотра с сохранением пропорций
 * (аналог object-fit: contain). Возвращает размеры видимой области холста:
 * вертикальные форматы остаются вертикальными, растягивания по одной оси нет.
 */
export function fitCanvas(container: Size, canvas: Size): Size {
  if (canvas.width <= 0 || canvas.height <= 0) {
    return { width: 0, height: 0 };
  }
  if (container.width <= 0 || container.height <= 0) {
    return { width: 0, height: 0 };
  }

  const scale = Math.min(container.width / canvas.width, container.height / canvas.height);
  return { width: canvas.width * scale, height: canvas.height * scale };
}

/**
 * Приводит существующие экземпляры в границы нового формата.
 * Размер уменьшается только если объект не помещается, пропорции
 * экземпляра сохраняются; позиция прижимается к безопасной зоне.
 */
export function adaptElementsToCanvas(
  elements: readonly CompositionElement[],
  canvas: Size,
  paddingRatio = 0.02,
): CompositionElement[] {
  const padX = canvas.width * paddingRatio;
  const padY = canvas.height * paddingRatio;
  const maxWidth = Math.max(1, canvas.width - padX * 2);
  const maxHeight = Math.max(1, canvas.height - padY * 2);

  return elements.map((el) => {
    const k = Math.min(1, maxWidth / el.size.width, maxHeight / el.size.height);
    const width = el.size.width * k;
    const height = el.size.height * k;

    const x = Math.min(Math.max(el.position.x, padX), canvas.width - padX - width);
    const y = Math.min(Math.max(el.position.y, padY), canvas.height - padY - height);

    return {
      ...el,
      size: { width, height },
      position: { x, y },
    };
  });
}
