import type { Box, Size } from "../../types/geometry.ts";
import type { CompositionElement } from "../../types/composition.ts";
import type { ComponentRole } from "../../types/library.ts";
import {
  areaOf,
  bottomOf,
  between,
  clamp,
  createRandom,
  fitInto,
  horizontalShiftRange,
  jitter,
  keepMostlyInside,
  overlapArea,
  pieceFrom,
  scaleAround,
  scaleOf,
  shiftBy,
  unionBoxes,
  type Piece,
  type SizedItem,
} from "./pieces.ts";
import { applyRotations } from "./rotationPolicy.ts";
import { choosePreset, type LayoutPreset } from "./templates.ts";
import { isBetterScore, scoreLayout, type Score } from "./scorer.ts";
import { SOFT_OVERLAP_LIMIT } from "./collision.ts";

export { MAX_CROP, createRandom, fitInto, safeBox, boxesOverlap } from "./pieces.ts";
export { choosePreset, type LayoutPreset } from "./templates.ts";

/**
 * Geometry Engine: автоматическая компоновка сцены.
 *
 * Модель сцены — «стол»: объекты стоят на общей линии (базовой линии). Главный
 * объект крупный и почти по центру, вспомогательные стоят рядом с ним и друг с
 * другом, их нижние края совпадают с линией стола. Объекты не складываются
 * друг на друга вертикально и не разлетаются по холсту.
 *
 * Пропорции исходных SVG сохраняются, сами объекты не меняются: меняются
 * позиция, размер экземпляра, поворот (через трансформацию экземпляра) и порядок
 * слоёв. Порядок слоёв — по глубине: объект, нижний край которого ниже, ближе к
 * зрителю и рисуется выше.
 *
 * Пресет выбирает Layout Templates Engine, допустимость перекрытий проверяет
 * Collision Validator, поворот — Rotation Policy Engine, выбор лучшего варианта —
 * Composition Scorer. Одинаковое зерно даёт одинаковую раскладку, без зерна
 * каждый вызов даёт новую.
 */

export type LayoutItem = SizedItem & {
  role: ComponentRole;
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

type Candidate = { pieces: Piece[]; layers: Piece[] };

/** Линия стола: доля высоты холста, на которой стоят нижние края объектов. */
const BASELINE: readonly [number, number] = [0.7, 0.86];
/**
 * Главный объект: доля ширины холста.
 * Верхняя граница выбрана так, чтобы предмет с пропорциями, близкими к
 * пропорциям холста, не заполнял собой всю сцену: при in-box fit лимитирующей
 * становится высота, и завышенная квота превращает объект в «огромный контур».
 */
const MAIN_WIDTH: readonly [number, number] = [0.44, 0.62];
/** Главный объект: доля высоты холста. */
const MAIN_HEIGHT: readonly [number, number] = [0.44, 0.6];
/** Вспомогательный объект: доля высоты главного. Заметно меньше, чтобы читалась иерархия. */
const SECONDARY_HEIGHT: readonly [number, number] = [0.32, 0.5];
/** Вспомогательный объект: доля ширины главного. */
const SECONDARY_WIDTH = 0.58;
/**
 * Заход соседа на предыдущий объект, доля ширины соседа.
 * Отрицательное значение — небольшой зазор, положительное — перекрытие.
 * Верхняя граница ограничена: заход не должен скрывать существенную часть
 * соседнего предмета.
 */
const SECONDARY_OVERLAP: readonly [number, number] = [-0.05, 0.07];
/** Разброс нижних краёв вспомогательных объектов относительно линии стола, доля высоты холста. */
const LINE_JITTER = 0.012;
/** Вероятность, что группа обрезается краем холста. */
const CROP_CHANCE = 0.25;
/** Доля ширины группы, которая выходит за край холста при обрезке. */
const CROP_RANGE: readonly [number, number] = [0.08, 0.25];
/** Вероятность появления фоновой копии главного объекта. */
const COPY_CHANCE = 0.2;
/** Фоновая копия: доля размера главного объекта. Всегда меньше него. */
const COPY_FACTOR: readonly [number, number] = [0.5, 0.7];
/**
 * Сдвиг копии от центра главного, доля его ширины.
 * Больше 0.75 — копия стоит рядом и только касается главного, а не накладывается:
 * при прежних 0.35–0.5 копированный объект закрывал до 60% площади оригинала.
 */
const COPY_SHIFT: readonly [number, number] = [0.78, 1.0];
/** Подъём копии над линией стола, доля высоты холста: копия дальше от зрителя. */
const COPY_LIFT: readonly [number, number] = [0.04, 0.1];
/**
 * Масштаб фонового объекта относительно холста.
 * Фона в библиотеке — это предметные иллюстрации в приглушённой раскраске,
 * а не декоративные подложки (те вынесены в role "backdrop"). Растягивать
 * такой предмет на 92–100% холста нельзя: он становится главным по размеру,
 * перекрывает сцену и ломает иерархию.
 */
const BACKGROUND_SCALE: readonly [number, number] = [0.42, 0.6];
/** Положение фона: доля высоты холста до нижнего края фона — дальний план за линией стола. */
const BACKGROUND_BOTTOM: readonly [number, number] = [0.5, 0.62];
/** Доля ширины холста, которую может занимать группа без обрезки. */
const GROUP_WIDTH_LIMIT = 0.94;
/** Доля ширины холста, которую может занимать группа при обрезке. */
const GROUP_WIDTH_LIMIT_CROPPED = 0.8;
/** Минимальный отступ группы от верхнего края, доля высоты холста. */
const TOP_MARGIN = 0.03;
/** Сколько кандидатов раскладки сравнивается. */
const CANDIDATE_COUNT = 8;

/** Параметры стола для пресетов, где объекты стоят в ряд. */
type TableStyle = {
  baseline: readonly [number, number];
  mainWidth: readonly [number, number];
  mainHeight: readonly [number, number];
  secondaryHeight: readonly [number, number];
  secondaryWidth: number;
  overlap: readonly [number, number];
};

const HERO_STYLE: TableStyle = {
  baseline: BASELINE,
  mainWidth: MAIN_WIDTH,
  mainHeight: MAIN_HEIGHT,
  secondaryHeight: SECONDARY_HEIGHT,
  secondaryWidth: SECONDARY_WIDTH,
  overlap: SECONDARY_OVERLAP,
};

const COMPACT_STYLE: TableStyle = {
  baseline: [0.72, 0.86],
  mainWidth: [0.38, 0.5],
  mainHeight: [0.38, 0.52],
  secondaryHeight: [0.44, 0.62],
  secondaryWidth: 0.62,
  overlap: [0.0, 0.08],
};

const WIDE_STYLE: TableStyle = {
  baseline: [0.66, 0.8],
  mainWidth: [0.28, 0.38],
  mainHeight: [0.46, 0.64],
  secondaryHeight: [0.5, 0.72],
  secondaryWidth: 0.62,
  overlap: [-0.05, 0.05],
};

/** Вспомогательные объекты ставятся рядом с главным, стороны чередуются. Первый элемент — главный. */
function arrangeTable(
  main: LayoutItem,
  secondaries: readonly LayoutItem[],
  canvas: Size,
  style: TableStyle,
  rand: () => number,
): Piece[] | null {
  const mainScale = scaleOf(main.preferredScale);
  const baseline = canvas.height * between(rand, style.baseline);
  const mainSize = fitInto(main.intrinsic, {
    width: canvas.width * between(rand, style.mainWidth) * mainScale,
    height: Math.min(canvas.height * between(rand, style.mainHeight) * mainScale, baseline),
  });
  if (mainSize.width <= 0 || mainSize.height <= 0) return null;

  const mainBox: Box = {
    x: canvas.width / 2 - mainSize.width / 2 + jitter(rand, canvas.width * 0.05),
    y: baseline - mainSize.height,
    width: mainSize.width,
    height: mainSize.height,
  };
  const pieces: Piece[] = [pieceFrom(main, mainBox, "main")];

  let side = rand() < 0.5 ? -1 : 1;
  let left = mainBox.x;
  let right = mainBox.x + mainBox.width;
  for (const item of secondaries) {
    const size = fitInto(item.intrinsic, {
      width: mainSize.width * style.secondaryWidth * scaleOf(item.preferredScale),
      height: mainSize.height * between(rand, style.secondaryHeight) * scaleOf(item.preferredScale),
    });
    if (size.width <= 0 || size.height <= 0) continue;

    const overlap = between(rand, style.overlap) * size.width;
    const bottom = baseline + jitter(rand, canvas.height * LINE_JITTER);
    let x: number;
    if (side > 0) {
      x = right - overlap;
      right = x + size.width;
    } else {
      x = left + overlap - size.width;
      left = x;
    }
    pieces.push(
      pieceFrom(item, { x, y: bottom - size.height, width: size.width, height: size.height }, "secondary"),
    );
    side = -side;
  }
  return pieces;
}

/** Диагональ: главный слева или справа сверху, вспомогательные уходят к противоположному нижнему краю. */
function arrangeDiagonal(
  main: LayoutItem,
  secondaries: readonly LayoutItem[],
  canvas: Size,
  rand: () => number,
): Piece[] | null {
  const width = canvas.width;
  const height = canvas.height;
  const mainScale = scaleOf(main.preferredScale);
  const dir = rand() < 0.5 ? -1 : 1;
  const mainBottom = height * between(rand, [0.5, 0.62]);
  const mainSize = fitInto(main.intrinsic, {
    width: width * between(rand, [0.4, 0.5]) * mainScale,
    height: Math.min(height * between(rand, [0.42, 0.56]) * mainScale, mainBottom),
  });
  if (mainSize.width <= 0 || mainSize.height <= 0) return null;

  const centerX = width / 2 - dir * width * between(rand, [0.12, 0.18]);
  const pieces: Piece[] = [
    pieceFrom(
      main,
      {
        x: centerX - mainSize.width / 2,
        y: mainBottom - mainSize.height,
        width: mainSize.width,
        height: mainSize.height,
      },
      "main",
    ),
  ];

  const stepY = Math.min(height * 0.13, (height * 0.95 - mainBottom) / Math.max(1, secondaries.length));
  secondaries.forEach((item, index) => {
    const itemScale = scaleOf(item.preferredScale);
    const size = fitInto(item.intrinsic, {
      width: mainSize.width * 0.7 * itemScale,
      height: mainSize.height * between(rand, [0.5, 0.7]) * itemScale,
    });
    if (size.width <= 0 || size.height <= 0) return;
    const step = index + 1;
    const center = centerX + dir * mainSize.width * 0.75 * step;
    const bottom = mainBottom + stepY * step + jitter(rand, height * LINE_JITTER);
    pieces.push(
      pieceFrom(
        item,
        { x: center - size.width / 2, y: bottom - size.height, width: size.width, height: size.height },
        "secondary",
      ),
    );
  });
  return pieces;
}

/** Вертикаль: главный в верхней части, вспомогательные чередуются слева и справа под ним. */
function arrangeTall(
  main: LayoutItem,
  secondaries: readonly LayoutItem[],
  canvas: Size,
  rand: () => number,
): Piece[] | null {
  const width = canvas.width;
  const height = canvas.height;
  const mainScale = scaleOf(main.preferredScale);
  const mainBottom = height * between(rand, [0.56, 0.66]);
  const mainSize = fitInto(main.intrinsic, {
    width: width * between(rand, [0.6, 0.78]) * mainScale,
    height: Math.min(height * between(rand, [0.4, 0.5]) * mainScale, mainBottom),
  });
  if (mainSize.width <= 0 || mainSize.height <= 0) return null;

  const mainBox: Box = {
    x: width / 2 - mainSize.width / 2 + jitter(rand, width * 0.04),
    y: mainBottom - mainSize.height,
    width: mainSize.width,
    height: mainSize.height,
  };
  const pieces: Piece[] = [pieceFrom(main, mainBox, "main")];

  const stepY = secondaries.length > 0
    ? Math.min(height * 0.2, (height * 0.95 - mainBottom) / secondaries.length)
    : 0;
  let side = rand() < 0.5 ? -1 : 1;
  secondaries.forEach((item, index) => {
    const itemScale = scaleOf(item.preferredScale);
    const size = fitInto(item.intrinsic, {
      width: mainSize.width * 0.6 * itemScale,
      height: mainSize.height * between(rand, [0.5, 0.7]) * itemScale,
    });
    if (size.width <= 0 || size.height <= 0) return;
    const bottom = mainBottom + stepY * (index + 1) + jitter(rand, height * LINE_JITTER);
    const overlap = between(rand, [0.05, 0.2]) * size.width;
    const x = side > 0
      ? mainBox.x + mainBox.width - overlap
      : mainBox.x + overlap - size.width;
    side = -side;
    pieces.push(
      pieceFrom(item, { x, y: bottom - size.height, width: size.width, height: size.height }, "secondary"),
    );
  });
  return pieces;
}

/** Расставляет объекты выбранным пресетом. Первый элемент результата — главный объект. */
function arrange(
  preset: LayoutPreset,
  main: LayoutItem,
  secondaries: readonly LayoutItem[],
  canvas: Size,
  rand: () => number,
): Piece[] | null {
  switch (preset) {
    case "B":
      return arrangeDiagonal(main, secondaries, canvas, rand);
    case "E":
      return arrangeTall(main, secondaries, canvas, rand);
    case "C":
      return arrangeTable(main, secondaries, canvas, COMPACT_STYLE, rand);
    case "D":
      return arrangeTable(main, secondaries, canvas, WIDE_STYLE, rand);
    default:
      return arrangeTable(main, secondaries, canvas, HERO_STYLE, rand);
  }
}

/** Строит одного кандидата раскладки. Возвращает null, если главный объект не размещается. */
function composeCandidate(
  items: readonly LayoutItem[],
  canvas: Size,
  seed: number,
  preset: LayoutPreset,
): Candidate | null {
  const background = items.find((item) => item.role === "background") ?? null;
  const primaries = items.filter((item) => item.role === "primary");
  const main = primaries[0];
  if (!main) return null;

  const rand = createRandom(seed);
  const width = canvas.width;
  const height = canvas.height;

  // Раскладка по пресету. Главный объект — первый элемент результата.
  const pieces = arrange(preset, main, primaries.slice(1), canvas, rand);
  if (!pieces) return null;

  // Опорная линия группы: нижний край главного объекта.
  const baseline = bottomOf(pieces[0].box);

  // Группу масштабируем целиком: сначала по ширине, затем по верхнему краю.
  const cropped = rand() < CROP_CHANCE;
  const maxGroupWidth = width * (cropped ? GROUP_WIDTH_LIMIT_CROPPED : GROUP_WIDTH_LIMIT);
  let group = unionBoxes(pieces.map((p) => p.box));
  if (group.width > maxGroupWidth) {
    scaleAround(pieces, maxGroupWidth / group.width, group.x + group.width / 2, baseline);
    group = unionBoxes(pieces.map((p) => p.box));
  }
  const minTop = height * TOP_MARGIN;
  if (group.y < minTop) {
    scaleAround(pieces, (baseline - minTop) / (baseline - group.y), group.x + group.width / 2, baseline);
    group = unionBoxes(pieces.map((p) => p.box));
  }

  // Горизонтальное положение группы: по центру с небольшим сдвигом или с обрезкой краем.
  let desiredLeft: number;
  if (cropped) {
    const crop = between(rand, CROP_RANGE) * group.width;
    desiredLeft = rand() < 0.5 ? -crop : width - group.width + crop;
  } else {
    desiredLeft = (width - group.width) / 2 + jitter(rand, width * 0.03);
  }
  const [minShift, maxShift] = horizontalShiftRange(pieces.map((p) => p.box), width);
  shiftBy(pieces, clamp(desiredLeft - group.x, minShift, maxShift));

  // Поворот по политике объектов; принимается только при сохранении границ и оценки.
  applyRotations(pieces, canvas, rand);

  // Фоновая копия главного: меньше него, стоит сбоку и дальше от зрителя.
  // Копию отбрасываем, если после удержания в холсте она наползает на
  // оригинал: прижим к краю уменьшает фактический сдвиг, и копия, которая
  // задумывалась как сосед, превращается в закрытый наполовину дубль.
  const mainBox = pieces[0].box;
  const copies: Piece[] = [];
  if (rand() < COPY_CHANCE) {
    const direction = rand() < 0.5 ? -1 : 1;
    const factor = between(rand, COPY_FACTOR);
    const copyWidth = mainBox.width * factor;
    const copyHeight = mainBox.height * factor;
    const centerX = mainBox.x + mainBox.width / 2 + direction * mainBox.width * between(rand, COPY_SHIFT);
    const copyBottom = baseline - height * between(rand, COPY_LIFT);
    const copyBox = keepMostlyInside(
      {
        x: centerX - copyWidth / 2,
        y: copyBottom - copyHeight,
        width: copyWidth,
        height: copyHeight,
      },
      canvas,
    );
    const smaller = Math.min(areaOf(mainBox), areaOf(copyBox));
    const covered = smaller > 0 ? overlapArea(mainBox, copyBox) / smaller : 1;
    if (covered <= SOFT_OVERLAP_LIMIT) {
      copies.push({
        componentId: main.componentId,
        role: "copy",
        box: copyBox,
        angle: 0,
        overlap: "allow",
      });
    }
  }

  const layers: Piece[] = [];
  if (background) {
    const size = fitInto(background.intrinsic, {
      width: width * between(rand, BACKGROUND_SCALE),
      height: height * between(rand, BACKGROUND_SCALE),
    });
    // Дальний план: верхняя часть холста. Нижний край привязан к линии
    // дальнего плана, но фон не выходит за верхний край — это подложка,
    // а не объект, который можно обрезать.
    const bottom = height * between(rand, BACKGROUND_BOTTOM);
    layers.push({
      componentId: background.componentId,
      role: "background",
      box: {
        x: clamp((width - size.width) / 2 + jitter(rand, width * 0.06), 0, Math.max(0, width - size.width)),
        y: Math.max(0, bottom - size.height),
        width: size.width,
        height: size.height,
      },
      angle: 0,
      overlap: "allow",
    });
  }
  layers.push(...copies);
  layers.push(...[...pieces].sort((a, b) => bottomOf(a.box) - bottomOf(b.box)));

  return { pieces, layers };
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
 * Выбирается лучший из нескольких кандидатов по Composition Scorer: сначала
 * валидные, затем по общей оценке. Первый кандидат использует зерно напрямую,
 * поэтому одинаковое зерно даёт одинаковый результат.
 */
export function buildAutoLayout(
  items: readonly LayoutItem[],
  { canvas, seed }: AutoLayoutOptions,
): CompositionElement[] {
  const base = seed ?? freshSeed();
  const primaryCount = items.filter((item) => item.role === "primary").length;
  // Пресет один на весь вызов: кандидаты сравнимы между собой.
  const preset = choosePreset(canvas, primaryCount, base);

  let best: Candidate | null = null;
  let bestScore: Score | null = null;

  for (let k = 0; k < CANDIDATE_COUNT; k += 1) {
    const candidate = composeCandidate(
      items,
      canvas,
      (base + Math.imul(k, 0x9e3779b9)) >>> 0,
      preset,
    );
    if (!candidate) continue;
    const score = scoreLayout(candidate.pieces, canvas);
    if (isBetterScore(score, bestScore)) {
      best = candidate;
      bestScore = score;
    }
  }

  if (!best) return [];

  return best.layers.map((layer, index) => ({
    instanceId: `i${index + 1}`,
    componentId: layer.componentId,
    position: { x: layer.box.x, y: layer.box.y },
    size: { width: layer.box.width, height: layer.box.height },
    rotation: layer.angle,
    z: index + 1,
    visible: true,
  }));
}