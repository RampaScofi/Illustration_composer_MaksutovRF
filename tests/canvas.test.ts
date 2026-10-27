import test from "node:test";
import assert from "node:assert/strict";

import {
  CANVAS_FORMATS,
  adaptElementsToCanvas,
  contentBox,
  findCanvasFormat,
  fitCanvas,
  resolveCanvasSize,
} from "../src/lib/composition/canvas.ts";
import type { CompositionElement } from "../src/types/composition.ts";

test("findCanvasFormat возвращает формат по id и null для неизвестного", () => {
  assert.equal(findCanvasFormat("16:9")?.width, 1600);
  // @ts-expect-error намеренная проверка неизвестного идентификатора
  assert.equal(findCanvasFormat("21:9"), null);
});

test("resolveCanvasSize применяет пользовательский размер и игнорирует некорректный", () => {
  assert.deepEqual(resolveCanvasSize("1:1", { width: 800, height: 800 }), { width: 800, height: 800 });
  assert.deepEqual(resolveCanvasSize("1:1", { width: -5, height: 0 }), { width: 1200, height: 1200 });
});

test("contentBox оставляет симметричные поля внутри холста", () => {
  const box = contentBox({ width: 1000, height: 500 }, 0.1);
  assert.deepEqual(box, { x: 100, y: 50, width: 800, height: 400 });
});

test("все форматы имеют положительные размеры и уникальные id", () => {
  const ids = new Set(CANVAS_FORMATS.map((f) => f.id));
  assert.equal(ids.size, CANVAS_FORMATS.length);
  for (const format of CANVAS_FORMATS) {
    assert.ok(format.width > 0 && format.height > 0);
  }
});

test("обязательные форматы задания 1:1, 4:5, 16:9 присутствуют с верными пропорциями", () => {
  const required: Array<[string, number]> = [
    ["1:1", 1],
    ["4:5", 4 / 5],
    ["16:9", 16 / 9],
    ["4:3", 4 / 3],
    ["9:16", 9 / 16],
    ["3:1", 3],
  ];
  for (const [id, ratio] of required) {
    const format = findCanvasFormat(id as never);
    assert.ok(format, `формат ${id} должен быть доступен`);
    assert.ok(Math.abs(format!.width / format!.height - ratio) < 1e-9, `пропорция ${id} неверна`);
  }
});

test("вертикальные форматы действительно вертикальные, квадрат — квадратный", () => {
  const square = findCanvasFormat("1:1")!;
  const portrait45 = findCanvasFormat("4:5")!;
  const stories = findCanvasFormat("9:16")!;

  assert.equal(square.width, square.height);
  assert.ok(portrait45.height > portrait45.width);
  assert.ok(stories.height > stories.width);
  assert.ok(stories.height / stories.width > portrait45.height / portrait45.width);
});

test("fitCanvas вписывает холст в контейнер без растягивания по одной оси", () => {
  const container = { width: 800, height: 300 };

  const square = fitCanvas(container, { width: 1200, height: 1200 });
  assert.ok(Math.abs(square.width - square.height) < 1e-9);
  assert.ok(square.width <= 800 && square.height <= 300);

  const stories = fitCanvas(container, { width: 675, height: 1200 });
  assert.ok(stories.height > stories.width);
  assert.ok(Math.abs(stories.width / stories.height - 675 / 1200) < 1e-9);
  assert.ok(stories.height <= 300);

  const wide = fitCanvas(container, { width: 1600, height: 900 });
  assert.ok(wide.width > wide.height);
  assert.ok(Math.abs(wide.width / wide.height - 16 / 9) < 1e-9);
  assert.ok(wide.width <= 800 && wide.height <= 300);
});

test("fitCanvas не делит на ноль при пустом контейнере", () => {
  assert.deepEqual(fitCanvas({ width: 0, height: 0 }, { width: 100, height: 100 }), {
    width: 0,
    height: 0,
  });
});

test("adaptElementsToCanvas удерживает объекты в границах и не искажает пропорции", () => {
  const elements: CompositionElement[] = [
    {
      instanceId: "a",
      componentId: "c",
      position: { x: 1500, y: 800 },
      size: { width: 400, height: 200 },
      rotation: 0,
      z: 1,
      visible: true,
    },
  ];

  const adapted = adaptElementsToCanvas(elements, { width: 675, height: 1200 });
  const el = adapted[0];

  assert.ok(el.position.x >= 0);
  assert.ok(el.position.y >= 0);
  assert.ok(el.position.x + el.size.width <= 675 + 1e-9);
  assert.ok(el.position.y + el.size.height <= 1200 + 1e-9);
  // Пропорции экземпляра сохранены (уменьшение равномерное).
  assert.ok(Math.abs(el.size.width / el.size.height - 2) < 1e-9);
});
