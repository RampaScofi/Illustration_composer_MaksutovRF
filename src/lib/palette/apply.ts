import type { LibraryComponent } from "@/types/library";
import type { ColorMapping } from "@/types/palette";
import { repaintSvg } from "./mapping.ts";
import { buildRepaintMapping } from "./schemes.ts";

/**
 * Единая точка применения цветовой схемы к разметке компонентов.
 * Одна и та же функция используется и на холсте, и при экспорте,
 * поэтому предпросмотр и итоговый SVG не расходятся.
 */
export function mappingForComponent(
  component: LibraryComponent,
  schemeId: string | null,
): ColorMapping {
  return buildRepaintMapping(schemeId, component.repaint);
}

/**
 * Перекрашивает содержимое библиотеки под выбранную схему.
 * Компоненты, для которых отображение пустое, возвращаются без изменений.
 */
export function repaintContents(
  svgContents: ReadonlyMap<string, string>,
  components: ReadonlyMap<string, LibraryComponent>,
  schemeId: string | null,
): Map<string, string> {
  const result = new Map<string, string>();

  for (const [id, markup] of svgContents) {
    const component = components.get(id);
    if (!component) {
      result.set(id, markup);
      continue;
    }

    const mapping = mappingForComponent(component, schemeId);
    result.set(id, Object.keys(mapping).length > 0 ? repaintSvg(markup, mapping) : markup);
  }

  return result;
}
