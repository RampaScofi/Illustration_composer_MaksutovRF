import test from "node:test";
import assert from "node:assert/strict";

import {
  CANVAS_FORMATS,
  contentBox,
  findCanvasFormat,
  resolveCanvasSize,
} from "../src/lib/composition/canvas.ts";

test("findCanvasFormat возвращает формат по id и null для неизвестного", () => {
  assert.equal(findCanvasFormat("16:9")?.width, 1920);
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
  ];
  for (const [id, ratio] of required) {
    const format = findCanvasFormat(id as never);
    assert.ok(format, `формат ${id} должен быть доступен`);
    assert.ok(Math.abs(format!.width / format!.height - ratio) < 1e-9, `пропорция ${id} неверна`);
  }
});
