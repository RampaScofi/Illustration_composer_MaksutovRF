import type { Composition } from "@/types/composition";
import type { Size } from "@/types/geometry";
import type { LibraryComponent } from "@/types/library";
import type { ColorMapping } from "@/types/palette";
import { uniqueSvgIds } from "../library/catalog-validation.ts";
import { repaintSvg } from "../palette/mapping.ts";

export type ExportOptions = {
  /** Добавлять data-атрибуты экземпляров (только для тестов и отладки). */
  debug?: boolean;
  /** Цвет фона холста. Фон рисуется отдельным слоем под объектами. */
  background?: string | null;
  /**
   * Компонент-подложка из библиотеки Figma (`role: backdrop`).
   * Рисуется поверх цветной заливки и под объектами, вписывается как cover.
   */
  backdropId?: string | null;
  /** Отображение цветов для конкретного компонента (перекраска схемой). */
  repaint?: (componentId: string) => ColorMapping;
};

/**
 * Собрать итоговый SVG-документ из компонентов и их экземпляров.
 * Формирует самостоятельный SVG с корректными преобразованиями и порядком слоёв.
 * Экспортирует только векторную графику, без UI-элементов редактора.
 */
export function buildCompositionSvg(
  composition: Composition,
  components: Map<string, LibraryComponent>,
  svgContents: Map<string, string>,
  canvasSize: Size,
  options: ExportOptions = {},
): string {
  const { debug = false, background = null, backdropId = null, repaint } = options;
  const width = canvasSize.width;
  const height = canvasSize.height;

  const elements = [...composition.elements].sort((a, b) => a.z - b.z);

  const allDefs: string[] = [];
  const bodyParts: string[] = [];

  for (const el of elements) {
    const comp = components.get(el.componentId);
    if (!comp) continue;

    const rawSvg = svgContents.get(el.componentId);
    if (!rawSvg) continue;

    // Перекраска применяется до выделения defs, чтобы цвета в defs
    // и в содержимом оставались согласованными.
    const mapping = repaint ? repaint(el.componentId) : {};
    const sourceSvg =
      Object.keys(mapping).length > 0 ? repaintSvg(rawSvg, mapping) : rawSvg;

    // Извлечь defs и удалить из содержимого
    const defsMatch = /<defs[\s>][\s\S]*?<\/defs>/i.exec(sourceSvg);
    const bodySvg = sourceSvg.replace(/<defs[\s>][\s\S]*?<\/defs>/gi, "");

    if (defsMatch) {
      // Уникализировать ID в defs и содержимом
      const prefix = `comp_${el.instanceId}`;
      const uniqueDefs = uniqueSvgIds(defsMatch[0], prefix);
      allDefs.push(uniqueDefs);
    }

    // Уникализировать ID в содержимом элемента
    const prefix = `comp_${el.instanceId}`;
    const uniqueBody = uniqueSvgIds(bodySvg, prefix);

    // Извлечь содержимое <svg> (внутреннее содержимое без внешнего тега)
    const inner = extractInnerSvgContent(uniqueBody);
    if (!inner) continue;

    // Построить трансформацию: translate → rotate → scale
    const cx = el.position.x + el.size.width / 2;
    const cy = el.position.y + el.size.height / 2;

    const parts: string[] = [];
    parts.push(`translate(${cx}, ${cy})`);
    if (el.rotation !== 0) {
      parts.push(`rotate(${el.rotation})`);
    }
    parts.push(`translate(${-cx}, ${-cy})`);
    // Масштабирование: вписываем исходный viewBox в целевой размер экземпляра
    const scaleX = el.size.width / comp.intrinsicSize.width;
    const scaleY = el.size.height / comp.intrinsicSize.height;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = el.position.x + (el.size.width - comp.intrinsicSize.width * scale) / 2;
    const offsetY = el.position.y + (el.size.height - comp.intrinsicSize.height * scale) / 2;
    parts.push(`translate(${offsetX}, ${offsetY})`);
    parts.push(`scale(${scale})`);

    const transform = parts.join(" ");

    const attrs = debug
      ? ` data-instance-id="${el.instanceId}" data-component-id="${el.componentId}"`
      : "";
    bodyParts.push(`<g transform="${transform}"${attrs}>${inner}</g>`);
  }

  const defsBlock = allDefs.length > 0 ? `<defs>${allDefs.join("")}</defs>` : "";

  // Фон холста — отдельный слой под объектами, не перекрывает содержимое.
  const backgroundBlock = background
    ? `<rect x="0" y="0" width="${width}" height="${height}" fill="${background}"/>`
    : "";

  // Декоративная подложка из библиотеки: вписывается как cover, поэтому
  // один и тот же SVG подходит для любого формата холста.
  const backdropBlock = buildBackdropBlock(backdropId, components, svgContents, width, height);

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    defsBlock,
    backgroundBlock,
    backdropBlock,
    ...bodyParts,
    `</svg>`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Слой подложки: вложенный SVG с cover-вписыванием и уникальными ID. */
function buildBackdropBlock(
  backdropId: string | null,
  components: Map<string, LibraryComponent>,
  svgContents: Map<string, string>,
  width: number,
  height: number,
): string {
  if (!backdropId) return "";

  const comp = components.get(backdropId);
  const rawSvg = svgContents.get(backdropId);
  if (!comp || !rawSvg) return "";

  const inner = extractInnerSvgContent(uniqueSvgIds(rawSvg, "backdrop"));
  if (!inner) return "";

  const box = `0 0 ${comp.intrinsicSize.width} ${comp.intrinsicSize.height}`;
  return `<svg x="0" y="0" width="${width}" height="${height}" viewBox="${box}" preserveAspectRatio="xMidYMid slice">${inner}</svg>`;
}

/**
 * Извлечь внутреннее содержимое <svg>...</svg> (без атрибутов корневого тега).
 */
function extractInnerSvgContent(svg: string): string | null {
  const match = /<svg\b[^>]*>([\s\S]*)<\/svg>/i.exec(svg);
  return match?.[1]?.trim() ?? null;
}
