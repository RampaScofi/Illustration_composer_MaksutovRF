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

/**
 * Полная конфигурация цветовой схемы.
 * Слоты идут в фиксированном порядке исходных материалов Figma:
 * три цвета фоновых объектов, три цвета главных объектов, два нейтральных.
 * Именно этот порядок задаёт соответствие цветов при переключении схемы.
 */
export type ColorSchemeConfig = {
  id: string;
  name: string;
  /** Короткое название для переключателя в интерфейсе. */
  shortName: string;
  /** Цвет холста, связанный со схемой в исходной спецификации. */
  canvas: HexColor;
  /** Цвета фоновых объектов (слоты 1–3). */
  background: readonly [HexColor, HexColor, HexColor];
  /** Цвета главных объектов (слоты 4–6). */
  object: readonly [HexColor, HexColor, HexColor];
  /** Нейтральные цвета: контур и светлые детали (слоты 7–8). */
  neutral: readonly [HexColor, HexColor];
};

/** Вариант фона холста из исходного задания. */
export type CanvasBackground = {
  id: string;
  name: string;
  /** Базовый цвет холста: используется как заливка-подложка. */
  hex: HexColor;
  /**
   * Путь к декоративной подложке из библиотеки Figma (линии, пятна).
   * Если путь не задан, холст заливается цветом `hex`.
   */
  svgPath?: string;
};
