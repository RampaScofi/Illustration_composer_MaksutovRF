import test from "node:test";
import assert from "node:assert/strict";

import {
  buildColorMapping,
  extractColors,
  isHexColor,
  mapColor,
  normalizeHex,
  repaintSvg,
} from "../src/lib/palette/mapping.ts";

test("normalizeHex канонизирует форматы #rgb и #rrggbbaa", () => {
  assert.equal(normalizeHex("#ABC"), "#aabbcc");
  assert.equal(normalizeHex("#AABBCC"), "#aabbcc");
  assert.equal(normalizeHex(" #aabbccdd "), "#aabbcc");
  assert.equal(normalizeHex("aabbcc"), null);
  assert.equal(normalizeHex("#xyz"), null);
  assert.equal(isHexColor("#ffffff"), true);
});

test("buildColorMapping сопоставляет по позициям без догадок", () => {
  const mapping = buildColorMapping(["#ffffff", "#000000", "#7864d7"], ["#f9ecb0", "#181817"]);
  assert.deepEqual(mapping, { "#ffffff": "#f9ecb0", "#000000": "#181817" });
});

test("mapColor возвращает отображённый цвет либо исходный нормализованный", () => {
  assert.equal(mapColor("#FFFFFF", { "#ffffff": "#181817" }), "#181817");
  assert.equal(mapColor("#123456", {}), "#123456");
  assert.equal(mapColor("red", {}), "red");
});

test("repaintSvg меняет только литералы цветов, геометрия сохраняется", () => {
  const markup = '<rect fill="#7864D7" width="10"/><path stroke="#7864d7"/>';
  const repainted = repaintSvg(markup, { "#7864d7": "#f9a3aa" });
  assert.equal(repainted, '<rect fill="#f9a3aa" width="10"/><path stroke="#f9a3aa"/>');
});

test("repaintSvg с пустым отображением не трогает разметку", () => {
  const markup = '<rect fill="#7864d7"/>';
  assert.equal(repaintSvg(markup, {}), markup);
});

test("extractColors собирает уникальные цвета", () => {
  const colors = extractColors('<a fill="#fff"/><b fill="#ffffff"/><c fill="#7864d7"/>');
  assert.deepEqual(colors, ["#ffffff", "#7864d7"]);
});
