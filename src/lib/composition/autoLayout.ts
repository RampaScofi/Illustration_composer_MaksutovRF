import type { Box, Size } from "@/types/geometry";
import type { CompositionElement } from "@/types/composition";
import type { ComponentRole } from "@/types/library";

/**
 * Автоматическая компоновка сцены.
 *
 * Расставляет главный объект, вспомогательные объекты и фоновые копии:
 * объекты могут быть смещены от центра, перекрывать друг друга и частично
 * выходить за край холста. Пропорции исходных SVG сохраняются, сами объекты
 * не меняются — только позиция, размер экземпляра и порядок слоёв.
 *
 * Раскладка зависит от зерна случайности: одинаковое зерно даёт одинаковый
 * результат, без зерна каждый вызов даёт новую компоновку.
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

/** Диапазоны размеров: доля от ширины и высоты холста, объект вписывается с сохранением пропорций. */
const MAIN_SCALE: readonly [number, number] = [0.5, 0.8];
const SECONDARY_SCALE: readonly [number, number] = [0.22, 0.4];
const BACKGROUND_SCALE: readonly [number, number] = [0.8, 0.95];
/** Фоновая копия главного объекта: доля от масштаба главного. Всегда меньше него. */
const COPY_FACTOR: readonly [number, number] = [0.45, 0.7];
/** Смещение фоновой копии от главного, в долях холста. */
const COPY_DISTANCE: readonly [number, number] = [0.15, 0.35];
/** Доля размера объекта, которая может выйти за край холста с каждой стороны. */
const MAX_CROP = 0.25;
/** Сколько случайных позиций проверяется для вспомогательного объекта. */
const PLACEMENT_TRIES = 24;
/** Вспомогательный объект не крупнее этой доли главного по площади. */
const SECONDARY_AREA_LIMIT = 0.6;
/** Вероятность, что вспомогательный объект встанет под главным, а не над ним. */
const BELOW_MAIN_CHANCE = 0.3;
/** Вероятность появления фоновых копий главного объекта. */
const COPY_CHANCE = 0.6;

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

type Placed = { box: Box; weight: number };
type Layer = { componentId: string; box: Box };

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function area(size: Size): number {
  return size.width * size.height;
}

function intersectionArea(a: Box, b: Box): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

function centeredAt(cx: number, cy: number, size: Size): Box {
  return { x: cx - size.width / 2, y: cy - size.height / 2, width: size.width, height: size.height };
}

/** Ограничивает позицию: за край холста выходит не больше MAX_CROP размера. */
function keepMostlyInside(box: Box, canvas: Size): Box {
  return {
    ...box,
    x: clamp(box.x, -box.width * MAX_CROP, canvas.width - box.width * (1 - MAX_CROP)),
    y: clamp(box.y, -box.height * MAX_CROP, canvas.height - box.height * (1 - MAX_CROP)),
  };
}

/** Случайная позиция, которая допускает частичный выход за край холста. */
function randomPosition(size: Size, canvas: Size, rand: () => number): Box {
  const minX = -size.width * MAX_CROP;
  const maxX = canvas.width - size.width * (1 - MAX_CROP);
  const minY = -size.height * MAX_CROP;
  const maxY = canvas.height - size.height * (1 - MAX_CROP);
  return {
    x: minX + (maxX - minX) * rand(),
    y: minY + (maxY - minY) * rand(),
    width: size.width,
    height: size.height,
  };
}

/**
 * Из случайных позиций выбирает ту, где объект меньше всего перекрывает уже
 * размещённые. Небольшой шум не даёт раскладке стать одинаковой: часть
 * объектов перекрывается намеренно.
 */
function pickSpot(size: Size, placed: readonly Placed[], canvas: Size, rand: () => number): Box {
  let best = randomPosition(size, canvas, rand);
  let bestScore = Infinity;
  for (let i = 0; i < PLACEMENT_TRIES; i += 1) {
    const candidate = randomPosition(size, canvas, rand);
    const overlap = placed.reduce(
      (sum, item) => sum + item.weight * intersectionArea(item.box, candidate),
      0,
    );
    const score = overlap / Math.max(area(size), 1) + rand() * 0.2;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
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

function jitter(rand: () => number, amplitude: number): number {
  return (rand() * 2 - 1) * amplitude;
}

function scaledSize(intrinsic: Size, canvas: Size, scale: number): Size {
  return fitInto(intrinsic, { width: canvas.width * scale, height: canvas.height * scale });
}

/** Случайное зерно, если вызывающий код его не передал. */
function freshSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

/**
 * Строит экземпляры композиции по плану подбора.
 *
 * Порядок слоёв снизу вверх: подложка, фоновые копии главного, главный объект,
 * вспомогательные объекты (часть из них встаёт под главным). Первый primary
 * считается главным. Все primary попадают на холст: объекты могут перекрываться
 * и частично выходить за край.
 */
export function buildAutoLayout(
  items: readonly LayoutItem[],
  { canvas, seed }: AutoLayoutOptions,
): CompositionElement[] {
  const background = items.find((item) => item.role === "background") ?? null;
  const primaries = items.filter((item) => item.role === "primary");
  if (primaries.length === 0) return [];

  const rand = createRandom(seed ?? freshSeed());
  const short = Math.min(canvas.width, canvas.height);
  const stack: Layer[] = [];
  const placed: Placed[] = [];

  if (background) {
    const size = scaledSize(background.intrinsic, canvas, between(rand, BACKGROUND_SCALE));
    const box = centeredAt(
      canvas.width / 2 + jitter(rand, canvas.width * 0.06),
      canvas.height / 2 + jitter(rand, canvas.height * 0.06),
      size,
    );
    stack.push({ componentId: background.componentId, box });
  }

  const main = primaries[0];
  const mainSize = scaledSize(main.intrinsic, canvas, between(rand, MAIN_SCALE));
  if (mainSize.width <= 0 || mainSize.height <= 0) return [];
  const mainArea = area(mainSize);

  // Главный объект смещён от центра, но не уходит в угол полностью.
  const mainBox = keepMostlyInside(
    centeredAt(
      canvas.width * (0.5 + jitter(rand, 0.25)),
      canvas.height * (0.5 + jitter(rand, 0.25)),
      mainSize,
    ),
    canvas,
  );

  // Фоновые копии того же объекта: меньше главного и лежат за ним.
  if (rand() < COPY_CHANCE) {
    const copies = 1 + Math.floor(rand() * 2);
    for (let i = 0; i < copies; i += 1) {
      const factor = between(rand, COPY_FACTOR);
      const size = { width: mainSize.width * factor, height: mainSize.height * factor };
      const angle = rand() * Math.PI * 2;
      const distance = between(rand, COPY_DISTANCE) * short;
      const center = { x: mainBox.x + mainBox.width / 2, y: mainBox.y + mainBox.height / 2 };
      const box = keepMostlyInside(
        centeredAt(
          center.x + Math.cos(angle) * distance,
          center.y + Math.sin(angle) * distance,
          size,
        ),
        canvas,
      );
      stack.push({ componentId: main.componentId, box });
      placed.push({ box, weight: 0.3 });
    }
  }

  const mainEntry: Layer = { componentId: main.componentId, box: mainBox };
  stack.push(mainEntry);
  placed.push({ box: mainBox, weight: 1 });

  for (const item of primaries.slice(1)) {
    let size = scaledSize(item.intrinsic, canvas, between(rand, SECONDARY_SCALE));
    if (size.width <= 0 || size.height <= 0) continue;

    // Вспомогательный объект не должен по площади приближаться к главному.
    const limit = SECONDARY_AREA_LIMIT * mainArea;
    if (area(size) > limit) {
      const k = Math.sqrt(limit / area(size));
      size = { width: size.width * k, height: size.height * k };
    }

    const box = pickSpot(size, placed, canvas, rand);
    const entry: Layer = { componentId: item.componentId, box };
    const below = rand() < BELOW_MAIN_CHANCE;
    stack.splice(below ? stack.indexOf(mainEntry) : stack.length, 0, entry);
    placed.push({ box, weight: 1 });
  }

  return stack.map((layer, index) =>
    toElement(`i${index + 1}`, layer.componentId, layer.box, index + 1),
  );
}
