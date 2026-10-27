import type { ComponentSize, LibraryComponent } from "../../types/library.ts";
import type { AiCatalogEntry, AiComposeRequest } from "./types.ts";

/**
 * Контракт взаимодействия с моделью.
 *
 * Модель выбирает только объекты из переданного каталога и формулирует варианты.
 * Координаты, размеры, повороты и цвета задаёт приложение. Ответ проверяется
 * в validate.ts; всё, что не проходит проверку, отбрасывается.
 */

/** Количество вариантов, которое запрашивается по умолчанию. */
export const DEFAULT_VARIANT_COUNT = 3;
/** Максимум объектов переднего плана в одном варианте. */
export const MAX_PRIMARY = 5;
export const MAX_TITLE = 80;
export const MAX_REASON = 300;

export const SYSTEM_PROMPT = [
  "Ты подбираешь объекты для векторной иллюстрации в приложении VectorMuse.",
  "По описанию пользователя выбери объекты ТОЛЬКО из переданного каталога.",
  "",
  "Правила:",
  "1. Используй только поле id из каталога. Не придумывай id, названия и новые объекты.",
  "2. Не указывай координаты, размеры, углы поворота и цвета: раскладку и палитру выполняет приложение.",
  `4. В каждом варианте от 1 до ${MAX_PRIMARY} объектов в поле primary. Все они должны иметь role=primary.`,
  "5. В поле background укажи не более одного id с role=background или null.",
  "6. В одном варианте не выбирай два объекта с одинаковым category.",
  "7. Если точного совпадения нет, выбери наиболее близкие по смыслу объекты. Пустых вариантов не возвращай.",
  "8. Объекты подбирай по теме описания. Не добавляй объекты, которые к теме не относятся, ради количества.",
  "9. Варианты должны отличаться не только набором объектов, но и настроением: например, один — главный объект крупно, другой — несколько объектов вместе.",
  "10. Ответ — только JSON без пояснений и без Markdown-ограждений.",
  "",
  "Формат ответа:",
  '{"variants":[{"title":"короткое название до 80 символов","reason":"почему подходит, до 300 символов","primary":["id"],"background":"id или null"}]}',
].join("\n");

/** Сообщение пользователя: описание, размер и каталог. Ключи API сюда не попадают. */
export function buildUserMessage(request: AiComposeRequest): string {
  return JSON.stringify({
    description: request.prompt,
    size: request.size,
    variantCount: request.variantCount,
    catalog: request.catalog,
  });
}

/** Каталог для модели: компоненты выбранного размерного набора без подложек из Figma. */
export function buildAiCatalog(
  components: readonly LibraryComponent[],
  size: ComponentSize,
): AiCatalogEntry[] {
  return components.flatMap((component) => {
    if (component.size !== size) return [];
    if (component.role !== "primary" && component.role !== "background") return [];
    return [
      {
        id: component.id,
        name: component.name,
        aliases: component.aliases.slice(0, 20),
        tags: component.tags.slice(0, 30),
        role: component.role,
        category: component.sourceIllustrationId,
      },
    ];
  });
}
