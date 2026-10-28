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

/** Визуальный вес объекта: влияет на баланс композиции. */
export type VisualWeight = "light" | "medium" | "heavy";

/**
 * Политика поворота при автокомпоновке:
 * "locked" — не поворачивать; "upright" — лёгкий наклон до нескольких градусов;
 * "limited" — поворот в пределах rotationRange; "free" — то же, но допускается больший диапазон.
 */
export type RotationPolicy = "locked" | "upright" | "limited" | "free";

/**
 * Допустимость перекрытия с соседними объектами:
 * "allow" — допустимо; "avoid" — по возможности без перекрытия; "forbid" — не перекрывать.
 */
export type OverlapPolicy = "allow" | "avoid" | "forbid";

/**
 * Один переиспользуемый векторный компонент.
 * Ссылается на заранее подготовленный SVG-файл.
 *
 * Поля композиции (с visualWeight до compositionHints) необязательны: отсутствующие
 * значения заполняются нейтральными умолчаниями в lib/library/metadata.ts.
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

   /** Визуальный вес. По умолчанию: primary — medium, background — light. */
  visualWeight?: VisualWeight;
  /** Предпочтительный масштаб относительно доступного места, от 0.2 до 1. */
  preferredScale?: number;
  /**
   * Плотность графики: доля охватывающего прямоугольника, реально покрытая
   * заливаемыми фигурами и штрихами (0..1). Разрежённые объекты (тонкие
   * линии, много пустоты) имеют малую плотность и в компоновке занимают
   * меньшую долю холста при том же viewBox. Измеряется по SVG-файлу.
   */
  contentDensity?: number;
  /** Политика поворота. По умолчанию locked. */
  rotationPolicy?: RotationPolicy;
  /** Диапазон поворота в градусах [min, max]. По умолчанию [-10, 10]. */
  rotationRange?: [number, number];
  /** Может ли объект повторяться в одной композиции. По умолчанию false. */
  allowDuplicate?: boolean;
  /** Тематические группы, например ["обучение", "идеи"]. */
  groupTags?: string[];
  /** id объектов, с которыми сочетается. Информативно: используется для предпочтения. */
  compatibleWith?: string[];
  /** id объектов, с которыми нельзя ставить в одну композицию. */
  avoidWith?: string[];
  /** Политика перекрытия. По умолчанию allow. */
  overlapPolicy?: OverlapPolicy;
  /** Свободные подсказки для будущих правил композиции. */
  compositionHints?: string[];
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
