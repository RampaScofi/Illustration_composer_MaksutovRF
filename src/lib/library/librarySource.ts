import type { LibraryComponent, LibraryManifest } from "@/types/library";
import type { ColorScheme } from "@/types/palette";

/**
 * Точка подключения библиотеки.
 *
 * На этапе 1 библиотека намеренно пуста: содержимое будет получено из
 * реального экспорта Figma-файла (страница «Библиотека компонентов»,
 * секции «Размер L» и «Размер S») и описано в docs/FIGMA_SOURCE.md.
 * Фиктивные SVG-компоненты здесь не создаются.
 */
export type LibraryStatus = "not-imported" | "ready" | "invalid";

export const LIBRARY_MANIFEST_PATH = "/assets/illustrations/manifest.json";
export const COLOR_SCHEMES_PATH = "/assets/palettes/schemes.json";

export const EMPTY_MANIFEST: LibraryManifest = {
  version: "0",
  components: [],
};

export type LibrarySnapshot = {
  status: LibraryStatus;
  components: LibraryComponent[];
  schemes: ColorScheme[];
  notice: string | null;
};

/**
 * Возвращает состояние библиотеки для интерфейса.
 * Пока манифест не выгружен из Figma, панель обязана показывать
 * честное состояние «не импортировано», а не заглушки с картинками.
 */
export function readLibrarySnapshot(
  manifest: LibraryManifest | null = null,
  schemes: ColorScheme[] = [],
): LibrarySnapshot {
  if (!manifest || manifest.components.length === 0) {
    return {
      status: "not-imported",
      components: [],
      schemes: [],
      notice:
        "Библиотека не подключена. Экспорт SVG-компонентов и цветовых схем из Figma выполняется на этапе 2.",
    };
  }

  return {
    status: "ready",
    components: manifest.components,
    schemes,
    notice: null,
  };
}
