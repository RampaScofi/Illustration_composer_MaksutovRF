import type { ColorMapping, HexColor } from "@/types/palette";

const SHORT_HEX = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const LONG_HEX = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i;

/**
 * Приводит цвет к каноничному виду #rrggbb (строчные буквы).
 * Поддерживает #rgb и #rrggbbaa; для #rrggbbaa альфа отбрасывается,
 * потому что палитра описывает сплошные заливки библиотеки.
 */
export function normalizeHex(input: string): HexColor | null {
  const value = input.trim();
  if (!value.startsWith("#")) return null;

  const short = SHORT_HEX.exec(value);
  if (short) {
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  }

  const long = LONG_HEX.exec(value);
  if (long) {
    return `#${long[1]}`.toLowerCase();
  }

  return null;
}

export function isHexColor(input: string): boolean {
  return normalizeHex(input) !== null;
}

/**
 * Строит отображение по позициям: i-й исходный цвет → i-й цвет схемы.
 * Лишние целевые цвета игнорируются, недостающие — не отображаются,
 * чтобы перекраска не подменяла цвета «наугад».
 */
export function buildColorMapping(sourceColors: string[], targetColors: string[]): ColorMapping {
  const mapping: ColorMapping = {};

  const count = Math.min(sourceColors.length, targetColors.length);
  for (let i = 0; i < count; i += 1) {
    const from = normalizeHex(sourceColors[i] ?? "");
    const to = normalizeHex(targetColors[i] ?? "");
    if (from && to) {
      mapping[from] = to;
    }
  }

  return mapping;
}

export function mapColor(color: string, mapping: ColorMapping): HexColor {
  const normalized = normalizeHex(color);
  if (!normalized) return color.trim();

  return mapping[normalized] ?? normalized;
}

const HEX_TOKEN = /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi;

/**
 * Перекрашивает SVG-разметку по отображению цветов.
 * Заменяются только литералы цветов — геометрия, структура слоёв
 * и атрибуты трансформаций остаются нетронутыми.
 * Пустое отображение возвращает исходную разметку без изменений.
 */
export function repaintSvg(markup: string, mapping: ColorMapping): string {
  const entries = Object.entries(mapping);
  if (entries.length === 0) return markup;

  const normalizedEntries: [HexColor, HexColor][] = entries
    .map(([from, to]) => [normalizeHex(from), normalizeHex(to)] as const)
    .filter((pair): pair is [HexColor, HexColor] => pair[0] !== null && pair[1] !== null);

  if (normalizedEntries.length === 0) return markup;

  return markup.replace(HEX_TOKEN, (token) => {
    const normalized = normalizeHex(token);
    if (!normalized) return token;

    const hit = normalizedEntries.find(([from]) => from === normalized);
    return hit ? hit[1] : token;
  });
}

/** Собирает уникальные цвета, встречающиеся в разметке. */
export function extractColors(markup: string): HexColor[] {
  const found = new Set<HexColor>();

  for (const match of markup.matchAll(HEX_TOKEN)) {
    const normalized = normalizeHex(match[0]);
    if (normalized) found.add(normalized);
  }

  return [...found];
}
