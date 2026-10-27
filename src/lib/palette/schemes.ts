import type {
  CanvasBackground,
  ColorMapping,
  ColorSchemeConfig,
  HexColor,
} from "@/types/palette";
import type { RepaintConstraint, ComponentSize } from "@/types/library";

/**
 * Три цветовые схемы исходного задания.
 *
 * Значения взяты из исходного файла Figma: группы схем в библиотеке
 * (`21:29569/21:29570/21:29579` для размера L и `24:6124/24:6133/24:6142`
 * для размера S). Порядок цветов внутри каждой группы одинаков, поэтому
 * переключение схемы — это позиционное сопоставление слотов, а не подбор
 * цветов «на глаз».
 *
 * Схема `violet` — базовая: именно в этих цветах экспортированы SVG-файлы.
 */
export const COLOR_SCHEMES: readonly ColorSchemeConfig[] = [
  {
    id: "violet",
    name: "Схема 1 · фиолетовая",
    shortName: "Фиолетовая",
    canvas: "#d7cdf5",
    background: ["#d7cdf5", "#aa9bf0", "#7864d7"],
    object: ["#f9ecb0", "#f9a3aa", "#ffe3e1"],
    neutral: ["#181817", "#ffffff"],
  },
  {
    id: "peach",
    name: "Схема 2 · персиковая",
    shortName: "Персиковая",
    canvas: "#fdd7b9",
    background: ["#fdd7b9", "#fac896", "#d27532"],
    object: ["#f9ecb0", "#80dada", "#beebeb"],
    neutral: ["#181817", "#ffffff"],
  },
  {
    id: "mint",
    name: "Схема 3 · мятная",
    shortName: "Мятная",
    canvas: "#beebeb",
    background: ["#beebeb", "#80dada", "#5abebe"],
    object: ["#ffd4f2", "#6d7bfc", "#b6c6fe"],
    neutral: ["#181817", "#ffffff"],
  },
] as const;

/** Схема, в цветах которой подготовлены SVG библиотеки. */
export const BASE_SCHEME_ID = "violet";

/** Три варианта фона холста — декоративные подложки из исходного файла Figma. */
export const CANVAS_BACKGROUNDS: readonly CanvasBackground[] = [
  {
    id: "violet",
    name: "Фиолетовый",
    hex: "#d7cdf5",
    svgPath: "/assets/illustrations/L/backdrop/backdrop-violet.svg",
  },
  {
    id: "peach",
    name: "Персиковый",
    hex: "#fdd7b9",
    svgPath: "/assets/illustrations/L/backdrop/backdrop-peach.svg",
  },
  {
    id: "mint",
    name: "Мятный",
    hex: "#beebeb",
    svgPath: "/assets/illustrations/L/backdrop/backdrop-mint.svg",
  },
] as const;

export function getScheme(id: string | null): ColorSchemeConfig | null {
  if (!id) return null;
  return COLOR_SCHEMES.find((s) => s.id === id) ?? null;
}

export function getBaseScheme(): ColorSchemeConfig {
  return getScheme(BASE_SCHEME_ID)!;
}

export function getCanvasBackground(id: string | null): CanvasBackground | null {
  if (!id) return null;
  return CANVAS_BACKGROUNDS.find((b) => b.id === id) ?? null;
}

/** Фон, связанный со схемой в исходной спецификации. */
export function backgroundForScheme(schemeId: string | null): CanvasBackground {
  const scheme = getScheme(schemeId);
  if (!scheme) return CANVAS_BACKGROUNDS[0];
  return getCanvasBackground(scheme.id) ?? CANVAS_BACKGROUNDS[0];
}

/** Все цвета схемы в порядке слотов: background → object → neutral. */
export function schemeColors(scheme: ColorSchemeConfig): HexColor[] {
  return [...scheme.background, ...scheme.object, ...scheme.neutral];
}

/**
 * Отображение «цвет исходной схемы → цвет целевой схемы» по позициям слотов.
 * Цвета, которых нет в исходной палитре, не затрагиваются.
 */
export function buildSchemeMapping(
  from: ColorSchemeConfig,
  to: ColorSchemeConfig,
): ColorMapping {
  const source = schemeColors(from);
  const target = schemeColors(to);
  const mapping: ColorMapping = {};

  for (let i = 0; i < Math.min(source.length, target.length); i += 1) {
    mapping[source[i]] = target[i];
  }

  return mapping;
}

/**
 * Отображение с учётом ограничения перекраски компонента:
 * - full — все слоты;
 * - monochrome-only — только цвета фоновых объектов;
 * - none — компонент не перекрашивается (задний фон схемы).
 */
export function buildRepaintMapping(
  schemeId: string | null,
  repaint: RepaintConstraint,
): ColorMapping {
  if (repaint === "none") return {};

  const target = getScheme(schemeId);
  if (!target || target.id === BASE_SCHEME_ID) return {};

  const base = getBaseScheme();
  const mapping = buildSchemeMapping(base, target);
  if (repaint === "full") return mapping;

  const allowed = new Set(base.background);
  const filtered: ColorMapping = {};
  for (const [from, to] of Object.entries(mapping)) {
    if (allowed.has(from)) filtered[from] = to;
  }
  return filtered;
}

/** CSS-цвет фона холста для выбранного варианта. */
export function canvasColor(backgroundId: string | null): HexColor {
  return getCanvasBackground(backgroundId)?.hex ?? CANVAS_BACKGROUNDS[0].hex;
}

/**
 * Идентификатор компонента-подложки для выбранного фона и размерного набора.
 * В библиотеке Figma фон выгружен как отдельный SVG (`role: backdrop`)
 * в двух размерах, поэтому подложка берётся из манифеста, а не рисуется кодом.
 */
export function backdropComponentId(
  backgroundId: string | null,
  size: ComponentSize,
): string {
  const id = getCanvasBackground(backgroundId)?.id ?? CANVAS_BACKGROUNDS[0].id;
  return `${size}-backdrop-backdrop-${id}`;
}
