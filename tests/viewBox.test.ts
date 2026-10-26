import test from "node:test";
import assert from "node:assert/strict";

import {
  aspectRatio,
  fitInside,
  parseViewBox,
  serializeViewBox,
  uniformScale,
} from "../src/lib/svg/viewBox.ts";

test("parseViewBox принимает стандартную запись через пробел", () => {
  assert.deepEqual(parseViewBox("0 0 120 80"), { x: 0, y: 0, width: 120, height: 80 });
});

test("parseViewBox принимает разделители-запятые и переносы строк", () => {
  assert.deepEqual(parseViewBox("-10, -20 , 300\t400"), { x: -10, y: -20, width: 300, height: 400 });
});

test("parseViewBox отклоняет пустое значение, мусор и нулевые размеры", () => {
  assert.equal(parseViewBox(undefined), null);
  assert.equal(parseViewBox(""), null);
  assert.equal(parseViewBox("   "), null);
  assert.equal(parseViewBox("0 0 0"), null);
  assert.equal(parseViewBox("0 0 10 abc"), null);
  assert.equal(parseViewBox("0 0 -10 20"), null);
});

test("serializeViewBox даёт строку, которую parseViewBox читает обратно", () => {
  const box = parseViewBox("5 6 7 8");
  assert.ok(box);
  assert.deepEqual(parseViewBox(serializeViewBox(box)), box);
});

test("fitInside вписывает источник в цель с сохранением пропорций", () => {
  const result = fitInside({ width: 200, height: 100 }, { x: 0, y: 0, width: 100, height: 100 });
  assert.deepEqual(result, { x: 0, y: 25, width: 100, height: 50 });
});

test("uniformScale выбирает меньший из двух масштабов", () => {
  assert.equal(uniformScale({ width: 100, height: 50 }, { width: 200, height: 200 }), 2);
  assert.equal(uniformScale({ width: 100, height: 50 }, { width: 50, height: 40 }), 0.5);
});

test("aspectRatio делит ширину на высоту", () => {
  assert.equal(aspectRatio({ width: 3, height: 2 }), 1.5);
});
