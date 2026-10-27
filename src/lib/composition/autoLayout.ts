import type { Box, Size } from "@/types/geometry";
import type { CompositionElement } from "@/types/composition";
import type { ComponentRole } from "@/types/library";

/**
 * Автоматическая компоновка сцены.
 *
 * Модель сцены — «стол»: объекты стоят на общей линии (базовой линии). Главный
 * объект крупный и почти по центру, вспомогательные стоят рядом с ним и друг с
 * другом, их нижние края совпадают с линией стола. Объекты не складываются
 * друг на друга вертикально и не разлетаются по холсту.
 *
 * Пропорции исходных SVG сохраняются, сами объекты не меняются: меняются
 * только позиция, размер экземпляра и порядок слоёв. Порядок слоёв — по глубине:
 * объект, нижний край которого ниже, ближе к зрителю и рисуется выше.
 *
 * Одинаковое зерно даёт одинаковую раскладку, без зерна каждый вызов даёт новую.
 */

export type LayoutItem = {
  componentId: string;
  role: ComponentRole;
  /** Исходный размер SVG (viewBox). */
  intrinsic: Size;
  /** Идентификатор категории: объекты одной категории не дублируются. */
  category: string;
};

export type AutoLayoutOptions = {
  canvas: Size;
  /**
   * Зерно случайности. Одинаковое зерно даёт одинаковую раскладку.
   * Без зерна каждый вызов даёт новую компоновку.
   */
  seed?: number;
};

/** Линия стола: доля высоты холста, на которой стоят нижние края объектов. */
const BASELINE: readonly [number, number] = [0.7, 0.86];
/** Главный объект: доля ширины холста. */
const MAIN_WIDTH: readonly [number, number] = [0.5, 0.72];
/** Главный объект: доля высоты холста. */
const MAIN_HEIGHT: readonly [number, number] = [0.5, 0.72];
/** Вспомогательный объект: доля высоты главного. */
const SECONDARY_HEIGHT: readonly [number, number] = [0.35, 0.6];
/** Вспомогательный объект: доля ширины главного. */
const SECONDARY_WIDTH = 0.7;
/**
 * Заход соседа на предыдущий объект, доля ширины соседа.
 * Отрицательное значение — небольшой зазор, положительное — перекрытие.
 */
const SECONDARY_OVERLAP: readonly [number, number] = [-0.06, 0.14];
/** Разброс нижних краёв вспомогательных объектов относительно линии стола, доля высоты холста. */
const LINE_JITTER = 0.012;
/** Вероятность, что группа обрезается краем холста. */
const CROP_CHANCE = 0.25;
/** Доля ширины группы, которая выходит за край холста при обрезке. */
const CROP_RANGE: readonly [number, number] = [0.08, 0.25];
/** Доля размера объекта, которая может выйти за край холста с каждой стороны. */
export const MAX_CROP = 0.25;
/** Вероятность появления фоновой копии главного объекта. */
const COPY_CHANCE = 0.35;
/** Фоновая копия: доля размера главного объекта. Всегда меньше него. */
const COPY_FACTOR: readonly [number, number] = [0.5, 0.7];
/** Сдвиг копии от центра главного, доля его ширины: копия выглядывает сбоку. */
const COPY_SHIFT: readonly [number, number] = [0.35, 0.5];
/** Подъём копии над линией стола, доля высоты холста: копия дальше от зрителя. */
const COPY_LIFT: readonly [number, number] = [0.04, 0.1];
/** Масштаб подложки относительно холста. */
const BACKGROUND_SCALE: readonly [number, number] = [0.92, 1];
/** Доля ширины холста, которую может занимать группа без обрезки. */
const GROUP_WIDTH_LIMIT = 0.94;
/** Доля ширины холста, которую может занимать группа при обрезке. */
const GROUP_WIDTH_LIMIT_CROPPED = 0.8;
/** Минимальный отступ группы от верхнего края, доля высоты холста. */
const TOP_MARGIN = 0.03;

/** Вписывает исходный размер в бокс с сохранением пропорций. */
export function fitInto(intrinsic: Size, box: Size): Size {
  if (intrinsic.width <= 0 || intrinsic.height <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(box.width / intrinsic.width, box.height / intrinsic.height);
  return { width: intrinsic.width * scale, height: intrinsic.height * scale };
}

export function safeBox(canvas: Size, paddingRatio = 0.06): Box {
  const pad = Math.min(canvas.width, canvas.height) * paddingRatio;
  return {
    x: pad,
    y: pad,
    width: Math.max(0, canvas.width - pad * 2),
    height: Math.max(0, canvas.height - pad * 2),
  };
}

export function boxesOverlap(a: Box, b: Box, margin = 0): boolean {
  return !(
    a.x + a.width + margin <= b.x ||
    b.x + b.width + margin <= a.x ||
    a.y + a.height + margin <= b.y ||
    b.y + b.height + margin <= a.y
  );
}

type Piece = { componentId: string; box: Box };

/** Генератор Mulberry32: детерминированная последовательность по зерну. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function between(rand: () => number, [min, max]: readonly [number, number]): number {
  return min + (max - min) * rand();
}

function jitter(rand: () => number, amplitude: number): number {
  return (rand() * 2 - 1) * amplitude;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function bottomOf(box: Box): number {
  return box.y + box.height;
}

/** Охватывающий прямоугольник группы. */
function unionOf(pieces: readonly Piece[]): Box {
  const left = Math.min(...pieces.map((p) => p.box.x));
  const top = Math.min(...pieces.map((p) => p.box.y));
  const right = Math.max(...pieces.map((p) => p.box.x + p.box.width));
  const bottom = Math.max(...pieces.map((p) => bottomOf(p.box)));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Масштабирует группу относительно точки (ax, ay), сохраняя взаимное расположение. */
function scaleAround(pieces: Piece[], k: number, ax: number, ay: number): void {
  for (const piece of pieces) {
    const { box } = piece;
    piece.box = {
      x: ax + (box.x - ax) * k,
      y: ay + (box.y - ay) * k,
      width: box.width * k,
      height: box.height * k,
    };
  }
}

function shiftBy(pieces: Piece[], dx: number): void {
  for (const piece of pieces) {
    piece.box = { ...piece.box, x: piece.box.x + dx };
  }
}

/**
 * Допустимый горизонтальный сдвиг группы: ни один объект не выходит за край
 * холста больше чем на MAX_CROP своего размера. Ограничение проверяется по
 * каждому объекту отдельно, а не по группе целиком.
 */
function horizontalShiftRange(pieces: readonly Piece[], canvasWidth: number): [number, number] {
  let min = -Infinity;
  let max = Infinity;
  for (const { box } of pieces) {
    min = Math.max(min, -box.width * MAX_CROP - box.x);
    max = Math.min(max, canvasWidth + box.width * MAX_CROP - (box.x + box.width));
  }
  return [min, max];
}

/**
 * Ограничивает позицию одного объекта: за край холста выходит не больше MAX_CROP
 * его размера.
 */
function keepMostlyInside(box: Box, canvas: Size): Box {
  return {
    ...box,
    x: clamp(box.x, -box.width * MAX_CROP, canvas.width - box.width * (1 - MAX_CROP)),
    y: clamp(box.y, -box.height * MAX_CROP, canvas.height - box.height * (1 - MAX_CROP)),
  };
}

function toElement(instanceId: string, componentId: string, box: Box, z: number): CompositionElement {
  return {
    instanceId,
    componentId,
    position: { x: box.x, y: box.y },
    size: { width: box.width, height: box.height },
    rotation: 0,
    z,
    visible: true,
  };
}

/** Случайное зерно, если вызывающий код его не передал. */
function freshSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

/**
 * Строит экземпляры композиции по плану подбора.
 *
 * Порядок слоёв снизу вверх: подложка, фоновая копия главного, объекты по
 * глубине (дальние ниже, ближние выше). Первый primary считается главным.
 */
export function buildAutoLayout(
  items: readonly LayoutItem[],
  { canvas, seed }: AutoLayoutOptions,
): CompositionElement[] {
  const background = items.find((item) => item.role === "background") ?? null;
  const primaries = items.filter((item) => item.role === "primary");
  const main = primaries[0];
  if (!main) return [];

  const rand = createRandom(seed ?? freshSeed());
  const width = canvas.width;
  const height = canvas.height;

  // Линия стола и главный объект. Высота ограничена линией, чтобы объект не уходил за верхний край.
  const baseline = height * between(rand, BASELINE);
  const mainSize = fitInto(main.intrinsic, {
    width: width * between(rand, MAIN_WIDTH),
    height: Math.min(height * between(rand, MAIN_HEIGHT), baseline),
  });
  if (mainSize.width <= 0 || mainSize.height <= 0) return [];

  const mainX = width / 2 - mainSize.width / 2 + jitter(rand, width * 0.05);
  const pieces: Piece[] = [
    {
      componentId: main.componentId,
      box: { x: mainX, y: baseline - mainSize.height, width: mainSize.width, height: mainSize.height },
    },
  ];

  // Вспомогательные объекты ставятся рядом с главным и друг с другом, чередуя стороны.
  let side = rand() < 0.5 ? -1 : 1;
  let left = mainX;
  let right = mainX + mainSize.width;
  for (const item of primaries.slice(1)) {
    const size = fitInto(item.intrinsic, {
      width: mainSize.width * SECONDARY_WIDTH,
      height: mainSize.height * between(rand, SECONDARY_HEIGHT),
    });
    if (size.width <= 0 || size.height <= 0) continue;

    const overlap = between(rand, SECONDARY_OVERLAP) * size.width;
    const bottom = baseline + jitter(rand, height * LINE_JITTER);
    let x: number;
    if (side > 0) {
      x = right - overlap;
      right = x + size.width;
    } else {
      x = left + overlap - size.width;
      left = x;
    }
    pieces.push({
      componentId: item.componentId,
      box: { x, y: bottom - size.height, width: size.width, height: size.height },
    });
    side = -side;
  }

  // Группу масштабируем целиком: сначала по ширине, затем по верхнему краю.
  const cropped = rand() < CROP_CHANCE;
  const maxGroupWidth = width * (cropped ? GROUP_WIDTH_LIMIT_CROPPED : GROUP_WIDTH_LIMIT);
  let group = unionOf(pieces);
  if (group.width > maxGroupWidth) {
    scaleAround(pieces, maxGroupWidth / group.width, group.x + group.width / 2, baseline);
    group = unionOf(pieces);
  }
  const minTop = height * TOP_MARGIN;
  if (group.y < minTop) {
    scaleAround(pieces, (baseline - minTop) / (baseline - group.y), group.x + group.width / 2, baseline);
    group = unionOf(pieces);
  }

  // Горизонтальное положение группы: по центру с небольшим сдвигом или с обрезкой краем.
  let desiredLeft: number;
  if (cropped) {
    const crop = between(rand, CROP_RANGE) * group.width;
    desiredLeft = rand() < 0.5 ? -crop : width - group.width + crop;
  } else {
    desiredLeft = (width - group.width) / 2 + jitter(rand, width * 0.03);
  }
  const [minShift, maxShift] = horizontalShiftRange(pieces, width);
  shiftBy(pieces, clamp(desiredLeft - group.x, minShift, maxShift));

  // Фоновая копия главного: меньше него, выглядывает сбоку и стоит дальше от зрителя.
  const mainBox = pieces[0].box;
  const copies: Piece[] = [];
  if (rand() < COPY_CHANCE) {
    const direction = rand() < 0.5 ? -1 : 1;
    const factor = between(rand, COPY_FACTOR);
    const copyWidth = mainBox.width * factor;
    const copyHeight = mainBox.height * factor;
    const centerX = mainBox.x + mainBox.width / 2 + direction * mainBox.width * between(rand, COPY_SHIFT);
    const copyBottom = baseline - height * between(rand, COPY_LIFT);
    copies.push({
      componentId: main.componentId,
      box: keepMostlyInside(
        {
          x: centerX - copyWidth / 2,
          y: copyBottom - copyHeight,
          width: copyWidth,
          height: copyHeight,
        },
        canvas,
      ),
    });
  }

  const layers: Piece[] = [];
  if (background) {
    const size = fitInto(background.intrinsic, {
      width: width * between(rand, BACKGROUND_SCALE),
      height: height * between(rand, BACKGROUND_SCALE),
    });
    layers.push({
      componentId: background.componentId,
      box: {
        x: (width - size.width) / 2 + jitter(rand, width * 0.02),
        y: (height - size.height) / 2 + jitter(rand, height * 0.02),
        width: size.width,
        height: size.height,
      },
    });
  }
  layers.push(...copies);
  layers.push(...[...pieces].sort((a, b) => bottomOf(a.box) - bottomOf(b.box)));

  return layers.map((layer, index) =>
    toElement(`i${index + 1}`, layer.componentId, layer.box, index + 1),
  );
}