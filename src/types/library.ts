import type { Size, ViewBox } from "./geometry";

/**
 * Два размера компонентов библиотеки.
 * В исходном Figma-файле иллюстрации разделены на секции «Размер L» и «Размер S»,
 * разница — в детализации. Конструктор обязан давать выбор размера.
 */
export type ComponentSize = "L" | "S";

/**
 * Роль объекта в сцене.
 * «Главные объекты» — цветные, «Фоновые объекты» — монохромные.
 * Ограничение исходника: цвета объектов не могут использоваться в фонах,
 * цвета фонов могут использоваться в объектах.
 */
export type ComponentRole = "primary" | "background";

/**
 * Один переиспользуемый векторный компонент.
 * Ссылается на заранее подготовленный SVG-файл, а не на сгенерированное изображение.
 */
export type LibraryComponent = {
  /** Стабильный идентификатoр внутри библиотеки. */
  id: string;
  /** Человекочитаемое имя, например «Пазлы», «Телефон». */
  name: string;
  size: ComponentSize;
  role: ComponentRole;
  /** Иллюстрация-источник, из которой извлечён компонент. */
  sourceIllustrationId: string;
  /** Node ID во Figma для прослеживаемости происхождения объекта. */
  figmaNodeId?: string;
  /** Путь к SVG-файлу внутри библиотеки, например /assets/illustrations/L/puzzle.svg */
  svgPath: string;
  viewBox: ViewBox;
  intrinsicSize: Size;
  /** Смысловые метки для подбора по метафоре (этап AI-подбора). */
  tags: string[];
};

/**
 * Манифест библиотеки — единая точка входа дляPanели библиотеки и сборщика.
 * Содержимое формируется из реального экспорта Figma, а не создаётся вручную.
 */
export type LibraryManifest = {
  version: string;
  sourceFileKey?: string;
  generatedAt?: string;
  components: LibraryComponent[];
};
