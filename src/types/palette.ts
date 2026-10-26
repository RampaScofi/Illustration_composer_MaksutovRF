/** Шестнадцатеричный цвет в формате #rrggbb (нормализованный). */
export type HexColor = string;

/** Роль цвета внутри схемы. */
export type PaletteSlot = "background" | "object" | "neutral";

export type PaletteColor = {
  slot: PaletteSlot;
  hex: HexColor;
};

/**
 * Цветовая схема. В исходном файле их три, количество может расти,
 * поэтому идентификатор — строка, а не фиксированное перечисление.
 */
export type ColorScheme = {
  id: string;
  name: string;
  colors: PaletteColor[];
};

/**
 * Отображение «исходный цвет → целевой цвет».
 * Применяется к готовым SVG без изменения геометрии объектов.
 */
export type ColorMapping = Record<HexColor, HexColor>;
