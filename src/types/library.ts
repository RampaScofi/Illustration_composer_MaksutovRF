import type { Size, ViewBox } from "./geometry";
import type { ColorScheme } from "./palette";

/** Два размера компонентов библиотеки. */
export type ComponentSize = "L" | "S";

/** Роль объекта в сцене. */
export type ComponentRole = "primary" | "background" | "backdrop";

/**
 * Ограничение по перекраске:
 * "full" — можно перекрасить в любой цвет из палитры.
 * "monochrome-only" — фоновый объект, допускает только нейтральные слоты.
 * "none" — задний фон, не перекрашивается.
 */
export type RepaintConstraint = "full" | "monochrome-only" | "none";

/**
 * Один переиспользуемый векторный компонент.
 * Ссылается на заранее подготовленный SVG-файл.
 */
export type LibraryComponent = {
  /** Стабильный идентификатор внутри библиотеки. */
  id: string;
  /** Человекочитаемое имя, например «Пазлы», «Книга». */
  name: string;
  /** Подтверждено ли имя из исходного Figma-файла (true = имя не техническое). */
  nameConfirmed: boolean;
  /** Синонимы для поиска (разные регистры, единственное/множественное число). */
  aliases: string[];
  /** Смысловые метки для подбора по метафоре (этап AI-подбора). */
  tags: string[];
  /** Иллюстрация-источник, из которой извлечён компонент. */
  sourceIllustrationId: string;
  /** Node ID во Figma для прослеживаемости происхождения объекта. */
  figmaNodeId?: string;
  size: ComponentSize;
  role: ComponentRole;
  /** Путь к SVG-файлу внутри библиотеки, например /assets/illustrations/L/primary/puzzle.svg */
  svgPath: string;
  viewBox: ViewBox;
  intrinsicSize: Size;
  /** Идентификаторы цветовых схем, в которых объект встречается в исходнике. */
  schemes: string[];
  /** Ограничение по перекраске. */
  repaint: RepaintConstraint;
  /** Количество дочерних узлов во Figma (для аудита сложности). */
  sourceNodeCount: number;
};

/**
 * Манифест библиотеки — единая точка входа для панели библиотеки и сборщика.
 * Состоит из компонентов и цветовых схем, полученных из Figma.
 */
export type LibraryManifest = {
  version: string;
  sourceFileKey?: string;
  sourcePageId?: string;
  generatedAt?: string;
  schemes: ColorScheme[];
  components: LibraryComponent[];
};
