import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSvgMetrics, densityToScale } from "../src/lib/svg/metrics.ts";

const wrap = (inner: string, vb = "0 0 100 100") =>
  `<svg width="100" height="100" viewBox="${vb}" fill="none" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;

test("сплошной квадрат заполняет bbox целиком", () => {
  const m = computeSvgMetrics(wrap('<path d="M0 0H100V100H0Z" fill="#111"/>'));
  assert.ok(m.density > 0.97, `density=${m.density}`);
});

test("круг вписан с коэффициентом ~пи/4", () => {
  const m = computeSvgMetrics(wrap('<circle cx="50" cy="50" r="50" fill="#111"/>'));
  assert.ok(Math.abs(m.density - Math.PI / 4) < 0.02, `density=${m.density}`);
});

test("тонкая рамка почти не имеет веса", () => {
  const m = computeSvgMetrics(
    wrap('<path d="M10 10H90V90H10Z" fill="none" stroke="#111" stroke-width="2"/>'),
  );
  // Периметр 320 × толщина 2 = 640 против bbox 80×80 = 6400 → ровно 0.1.
  assert.ok(m.density > 0.05 && m.density < 0.15, `density=${m.density}`);
});

test("невидимые элементы не влияют ни на границы, ни на вес", () => {
  const inner =
    '<path d="M0 0H100V100H0Z" fill="#111" display="none"/>' +
    '<path d="M0 0H50V100H0Z" fill="#111"/>';
  const m = computeSvgMetrics(wrap(inner));
  // Скрытый прямоугольник не должен расширять bbox.
  assert.equal(Math.round(m.bbox.width), 50, `bbox=${JSON.stringify(m.bbox)}`);
  assert.equal(Math.round(m.bbox.height), 100, `bbox=${JSON.stringify(m.bbox)}`);
  // Оставшаяся фигура заполняет свой bbox целиком.
  assert.ok(m.density > 0.97, `density=${m.density}`);
});

test("opacity=0 не участвует в метрике", () => {
  const m = computeSvgMetrics(
    wrap('<path d="M0 0H100V100H0Z" fill="#111" opacity="0"/><path d="M0 0H50V100H0Z" fill="#111"/>'),
  );
  assert.equal(Math.round(m.bbox.width), 50, `bbox=${JSON.stringify(m.bbox)}`);
});

test("transform масштабирует геометрию", () => {
  const small = computeSvgMetrics(wrap('<g transform="scale(0.5)"><path d="M0 0H100V100H0Z" fill="#111"/></g>'));
  assert.ok(Math.abs(small.bbox.width - 50) < 1, `bbox=${small.bbox.width}`);
  // Плотность не зависит от общего масштаба: форма та же.
  assert.ok(small.density > 0.9, `density=${small.density}`);
});

test("плотность не зависит от viewBox: метрика по bbox графики", () => {
  const full = computeSvgMetrics(wrap('<path d="M0 0H100V100H0Z" fill="#111"/>'));
  const padded = computeSvgMetrics(
    wrap('<path d="M20 20H80V80H20Z" fill="#111"/>', "0 0 200 200"),
  );
  assert.ok(full.density > 0.9 && padded.density > 0.9);
});

test("несколько фигур суммируются", () => {
  const m = computeSvgMetrics(
    wrap('<path d="M0 0H50V100H0Z" fill="#111"/><path d="M50 0H100V100H50Z" fill="#222"/>'),
  );
  assert.ok(m.density > 0.97, `density=${m.density}`);
});

test("кривые Безье учитываются в площади", () => {
  const m = computeSvgMetrics(
    wrap('<path d="M0 0 C 100 0, 100 100, 0 100 Z" fill="#111"/>'),
  );
  // Выпуклая форма справа: площадь заметно больше половины квадрата.
  assert.ok(m.density > 0.45, `density=${m.density}`);
});

test("плотный объект получает полный масштаб", () => {
  assert.equal(densityToScale(0.9), 1);
  assert.equal(densityToScale(0.55), 1);
});

test("разреженный объект уменьшается, но не исчезает", () => {
  const s = densityToScale(0.12);
  assert.ok(s > 0.4 && s < 0.7, `scale=${s}`);
  assert.ok(densityToScale(0) >= 0.45);
});