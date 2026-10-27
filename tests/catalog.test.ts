import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { ComponentCatalog, createCatalog, emptyCatalog } from "../src/lib/library/catalog.ts";
import {
  checkUniqueIds,
  extractDefs,
  findConflicts,
  stripDefs,
  uniqueSvgIds,
  validateCatalog,
} from "../src/lib/library/catalog-validation.ts";
import { buildCompositionSvg } from "../src/lib/composition/exportSvg.ts";
import type { LibraryComponent } from "../src/types/library.ts";
import type { Composition } from "../src/types/composition.ts";

const FIXTURES = path.join(import.meta.dirname, "fixtures");

function loadFixture(name: string): string {
  return readFileSync(path.join(FIXTURES, name), "utf8");
}

function makeComponent(overrides: Partial<LibraryComponent> = {}): LibraryComponent {
  return {
    id: "L-primary-puzzle",
    name: "Пазлы",
    nameConfirmed: true,
    aliases: ["пазл", "puzzle"],
    tags: ["обучение", "развитие"],
    sourceIllustrationId: "L-puzzle",
    size: "L",
    role: "primary",
    svgPath: "/assets/illustrations/L/primary/puzzle.svg",
    viewBox: { x: 0, y: 0, width: 545, height: 314 },
    intrinsicSize: { width: 545, height: 314 },
    schemes: ["violet", "peach", "mint"],
    repaint: "full",
    sourceNodeCount: 57,
    ...overrides,
  };
}

// ==================== КАТАЛОГ ====================

test("каталог получает компонент по ID и возвращает null для неизвестного", () => {
  const catalog = new ComponentCatalog([makeComponent(), makeComponent({ id: "S-primary-book", name: "Книга" })]);
  assert.equal(catalog.getById("L-primary-puzzle")?.name, "Пазлы");
  assert.equal(catalog.getById("unknown"), null);
  assert.equal(catalog.has("L-primary-puzzle"), true);
});

test("поиск регистронезависимый и работает по имени, синонимам и тегам", () => {
  const catalog = new ComponentCatalog([
    makeComponent(),
    makeComponent({ id: "S-primary-book", name: "Книга", aliases: ["book"], tags: ["знания"] }),
    makeComponent({ id: "L-primary-lamp", name: "Лампа", aliases: ["торшер"], tags: ["идея", "освещение"] }),
  ]);

  assert.equal(catalog.search("Пазлы").length, 1);
  assert.equal(catalog.search("пазл").length, 1);
  assert.equal(catalog.search("пазлы").length, 1);
  assert.equal(catalog.search("ПУЗЛ").length, 0);
  assert.equal(catalog.search("PAZLY").length, 0);
  assert.equal(catalog.search("книга")[0]?.id, "S-primary-book");
  assert.equal(catalog.search("book")[0]?.id, "S-primary-book");
  assert.equal(catalog.search("знания")[0]?.id, "S-primary-book");
  assert.equal(catalog.search("торшер")[0]?.id, "L-primary-lamp");
  assert.equal(catalog.search("идея")[0]?.id, "L-primary-lamp");
});

test("пустой запрос возвращает все компоненты", () => {
  const catalog = new ComponentCatalog([makeComponent(), makeComponent({ id: "x" })]);
  assert.equal(catalog.search("").length, 2);
  assert.equal(catalog.search("   ").length, 2);
});

test("поиск ранжирует: точное имя выше, чем тег", () => {
  const catalog = new ComponentCatalog([
    makeComponent({ id: "a", name: "Книга", tags: ["обучение"] }),
    makeComponent({ id: "b", name: "Пазлы", tags: ["книга", "обучение"] }),
  ]);
  const results = catalog.search("книга");
  assert.equal(results[0].id, "a");
});

test("фильтры по размеру и роли", () => {
  const catalog = new ComponentCatalog([
    makeComponent({ id: "a", size: "L", role: "primary" }),
    makeComponent({ id: "b", size: "S", role: "primary" }),
    makeComponent({ id: "c", size: "L", role: "background" }),
  ]);
  assert.deepEqual(catalog.filterBySize("L").map((c) => c.id), ["a", "c"]);
  assert.deepEqual(catalog.filterByRole("primary").map((c) => c.id), ["a", "b"]);
});

test("findByTags возвращает уникальные компоненты без дублей", () => {
  const catalog = new ComponentCatalog([
    makeComponent({ id: "a", tags: ["обучение", "развитие"] }),
    makeComponent({ id: "b", tags: ["обучение"] }),
  ]);
  const found = catalog.findByTags(["обучение", "развитие"]);
  assert.equal(found.length, 2);
});

test("пустой каталог корректен", () => {
  const catalog = emptyCatalog();
  assert.equal(catalog.count(), 0);
  assert.deepEqual(catalog.search("что-то"), []);
  assert.deepEqual(catalog.getAllTags(), []);
});

test("createCatalog из манифеста", () => {
  const catalog = createCatalog({
    version: "1",
    schemes: [],
    components: [makeComponent({ id: "z" })],
  });
  assert.equal(catalog.count(), 1);
  assert.equal(catalog.getById("z")?.name, "Пазлы");
});

// ==================== ВАЛИДАЦИЯ КАТАЛОГА ====================

test("дубликаты ID обнаруживаются", () => {
  const dupes = checkUniqueIds([makeComponent({ id: "a" }), makeComponent({ id: "a" })]);
  assert.deepEqual(dupes, ["a"]);
});

test("валидация каталога ловит битые компоненты и дубликаты", () => {
  const issues = validateCatalog([
    makeComponent({ id: "a" }),
    makeComponent({ id: "a" }),
    makeComponent({ id: "", svgPath: "/x.png" }),
  ]);
  assert.ok(issues.some((i) => i.message.includes("Дубликат")));
  assert.ok(issues.some((i) => i.field === "id"));
  assert.ok(issues.some((i) => i.field === "svgPath"));
});

// ==================== УНИКАЛИЗАЦИЯ ID ====================

test("uniqueSvgIds префиксирует id и обновляет url(#) ссылки", () => {
  const svg = loadFixture("sample-with-defs.svg");
  const result = uniqueSvgIds(svg, "inst1");
  assert.ok(result.includes('id="inst1__clip0"'));
  assert.ok(result.includes('url(#inst1__clip0)'));
  assert.ok(!/id="clip0"/.test(result));
});

test("uniqueSvgIds безопасен для SVG без id", () => {
  const svg = loadFixture("sample-plain.svg");
  assert.equal(uniqueSvgIds(svg, "x"), svg);
});

test("findConflicts находит пересекающиеся id", () => {
  const svg = loadFixture("sample-with-defs.svg");
  assert.deepEqual(findConflicts(svg, new Set(["clip0"])), ["clip0"]);
  assert.deepEqual(findConflicts(svg, new Set(["other"])), []);
});

test("extractDefs и stripDefs работают в паре", () => {
  const svg = loadFixture("sample-with-defs.svg");
  const defs = extractDefs(svg);
  assert.ok(defs.includes("clipPath"));
  const stripped = stripDefs(svg);
  assert.ok(!stripped.includes("clipPath"));
  assert.ok(stripped.includes("rect"));
});

// ==================== ЭКСПОРТ КОМПОЗИЦИИ ====================

test("экспорт формирует корректный SVG-документ с viewBox холста", () => {
  const comp = makeComponent({ id: "c1" });
  const composition: Composition = {
    id: "test",
    title: "Тест",
    format: "1:1",
    componentSize: "L",
    colorSchemeId: null,
    elements: [
      {
        instanceId: "i1",
        componentId: "c1",
        position: { x: 10, y: 20 },
        size: { width: 100, height: 60 },
        rotation: 0,
        z: 1,
        visible: true,
      },
    ],
  };

  const svg = buildCompositionSvg(
    composition,
    new Map([["c1", comp]]),
    new Map([["c1", loadFixture("sample-plain.svg")]]),
    { width: 1200, height: 1200 },
    { debug: true },
  );

  assert.ok(svg.startsWith("<?xml"));
  assert.ok(svg.includes('viewBox="0 0 1200 1200"'));
  assert.ok(svg.includes("data-instance-id=\"i1\""));
  assert.ok(svg.includes("<circle"));
  assert.ok(svg.endsWith("</svg>"));
});

test("экспорт сохраняет порядок слоёв (z) в выходном документе", () => {
  const a = makeComponent({ id: "a" });
  const b = makeComponent({ id: "b" });
  const composition: Composition = {
    id: "t",
    title: "t",
    format: "16:9",
    componentSize: "L",
    colorSchemeId: null,
    elements: [
      { instanceId: "top", componentId: "b", position: { x: 0, y: 0 }, size: { width: 50, height: 50 }, rotation: 0, z: 5, visible: true },
      { instanceId: "bottom", componentId: "a", position: { x: 0, y: 0 }, size: { width: 50, height: 50 }, rotation: 0, z: 1, visible: true },
    ],
  };

  const svg = buildCompositionSvg(
    composition,
    new Map([["a", a], ["b", b]]),
    new Map([["a", loadFixture("sample-plain.svg")], ["b", loadFixture("sample-plain.svg")]]),
    { width: 1920, height: 1080 },
    { debug: true },
  );

  const bottomIdx = svg.indexOf('data-instance-id="bottom"');
  const topIdx = svg.indexOf('data-instance-id="top"');
  assert.ok(bottomIdx < topIdx, "низкий z должен идти раньше в SVG");
});

test("экспорт не содержит UI-элементов редактора", () => {
  const comp = makeComponent({ id: "c" });
  const composition: Composition = {
    id: "t",
    title: "t",
    format: "1:1",
    componentSize: "L",
    colorSchemeId: null,
    elements: [
      { instanceId: "i", componentId: "c", position: { x: 0, y: 0 }, size: { width: 50, height: 50 }, rotation: 0, z: 1, visible: true },
    ],
  };
  const svg = buildCompositionSvg(
    composition,
    new Map([["c", comp]]),
    new Map([["c", loadFixture("sample-plain.svg")]]),
    { width: 1200, height: 1200 },
  );
  assert.ok(!svg.includes("stroke-dasharray"));
  assert.ok(!svg.includes("Композиция"));
  assert.ok(!svg.includes("<button"));
  assert.ok(!svg.includes("data-instance-id"), "в экспорт не должны попадать UI-атрибуты");
  assert.ok(!svg.includes("data-component-id"), "в экспорт не должны попадать UI-атрибуты");
});

test("экспорт уникализирует ID при повторном использовании компонента с defs", () => {
  const comp = makeComponent({ id: "c" });
  const composition: Composition = {
    id: "t",
    title: "t",
    format: "1:1",
    componentSize: "L",
    colorSchemeId: null,
    elements: [
      { instanceId: "one", componentId: "c", position: { x: 0, y: 0 }, size: { width: 50, height: 50 }, rotation: 0, z: 1, visible: true },
      { instanceId: "two", componentId: "c", position: { x: 60, y: 0 }, size: { width: 50, height: 50 }, rotation: 0, z: 2, visible: true },
    ],
  };
  const svg = buildCompositionSvg(
    composition,
    new Map([["c", comp]]),
    new Map([["c", loadFixture("sample-with-defs.svg")]]),
    { width: 1200, height: 1200 },
  );

  assert.ok(svg.includes('id="comp_one__clip0"'));
  assert.ok(svg.includes('id="comp_two__clip0"'));
  assert.ok(svg.includes('url(#comp_one__clip0)'));
  assert.ok(svg.includes('url(#comp_two__clip0)'));
  assert.ok(!/url\(#clip0\)/.test(svg), "сылая ссылка без префикса недопустима");
});

test("экспорт корректно применяет поворот и равномерный масштаб", () => {
  const comp = makeComponent({ id: "c", intrinsicSize: { width: 100, height: 50 } });
  const composition: Composition = {
    id: "t",
    title: "t",
    format: "1:1",
    componentSize: "L",
    colorSchemeId: null,
    elements: [
      { instanceId: "i", componentId: "c", position: { x: 0, y: 0 }, size: { width: 200, height: 100 }, rotation: 45, z: 1, visible: true },
    ],
  };
  const svg = buildCompositionSvg(
    composition,
    new Map([["c", comp]]),
    new Map([["c", loadFixture("sample-plain.svg")]]),
    { width: 1200, height: 1200 },
  );

  assert.ok(svg.includes("rotate(45)"));
  assert.ok(svg.includes("scale(2)"));
  // Равномерный масштаб: scale(2) из min(200/100, 100/50)=2
  assert.ok(!svg.includes("scale(2,2)"), "недопустимо раздельное масштабирование");
});

test("экспорт пропускает отсутствующий компонент без падения", () => {
  const composition: Composition = {
    id: "t",
    title: "t",
    format: "1:1",
    componentSize: "L",
    colorSchemeId: null,
    elements: [
      { instanceId: "i", componentId: "missing", position: { x: 0, y: 0 }, size: { width: 50, height: 50 }, rotation: 0, z: 1, visible: true },
    ],
  };
  const svg = buildCompositionSvg(composition, new Map(), new Map(), { width: 1200, height: 1200 });
  assert.ok(svg.includes("</svg>"));
  assert.ok(!svg.includes("missing"));
});
