import type { Composition } from "@/types/composition";
import type { Size } from "@/types/geometry";
import type { LibraryComponent } from "@/types/library";
import { uniqueSvgIds } from "../library/catalog-validation.ts";

/**
 * Собрать итоговый SVG-документ из компонентов и их экземпляров.
 * Формирует самостоятельный SVG с корректными преобразованиями и порядком слоёв.
 * Экспортирует только векторную графику, без UI-элементов редактора.
 * @param debug — добавлять data-атрибуты экземпляров (только для тестов).
 */
export function buildCompositionSvg(
  composition: Composition,
  components: Map<string, LibraryComponent>,
  svgContents: Map<string, string>,
  canvasSize: Size,
  debug = false,
): string {
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

    // Извлечь defs и удалить из содержимого
    const defsMatch = /<defs[\s>][\s\S]*?<\/defs>/i.exec(rawSvg);
    const bodySvg = rawSvg.replace(/<defs[\s>][\s\S]*?<\/defs>/gi, "");

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

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    defsBlock,
    ...bodyParts,
    `</svg>`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Извлечь внутреннее содержимое <svg>...</svg>.
 */
function extractInnerSvgContent(svg: string): string | null {
  const match = /<svg[\s>][\s\S]*?(?<inner>[\s\S]*?)<\/svg>/i.exec(svg);
  return match?.groups?.inner?.trim() ?? null;
}
