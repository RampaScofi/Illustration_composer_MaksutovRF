import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { LibraryComponent, LibraryManifest } from "../src/types/library.ts";
import type { Composition } from "../src/types/composition.ts";
import {
  CANVAS_BACKGROUNDS,
  COLOR_SCHEMES,
  backdropComponentId,
  backgroundForScheme,
  buildRepaintMapping,
  buildSchemeMapping,
  canvasColor,
  getBaseScheme,
  getScheme,
  schemeColors,
} from "../src/lib/palette/schemes.ts";
import { repaintSvg } from "../src/lib/palette/mapping.ts";
import { repaintContents } from "../src/lib/palette/apply.ts";
import { buildCompositionSvg } from "../src/lib/composition/exportSvg.ts";

const manifest = JSON.parse(
  readFileSync(new URL("../public/assets/illustrations/manifest.json", import.meta.url), "utf8"),
) as LibraryManifest;

test("в конфигурации ровно три схемы с уникальными идентификаторами", () => {
  assert.equal(COLOR_SCHEMES.length, 3);
  const ids = COLOR_SCHEMES.map((s) => s.id);
  assert.equal(new Set(ids).size, 3);
  for (const scheme of COLOR_SCHEMES) {
    assert.ok(scheme.name.length > 0);
    assert.equal(schemeColors(scheme).length, 8);
  }
});

test("цвета схем совпадают с исходным манифестом Figma", () => {
  assert.equal(manifest.schemes.length, 3);

  for (const scheme of COLOR_SCHEMES) {
    const source = manifest.schemes.find((s) => s.id === scheme.id);
    assert.ok(source, `схема ${scheme.id} должна быть в манифесте`);

    const fromManifest = source!.colors.map((c) => c.hex.toLowerCase());
    const fromConfig = schemeColors(scheme).map((c) => c.toLowerCase());
    assert.deepEqual(fromConfig, fromManifest, `схема ${scheme.id}: цвета расходятся`);
  }
});

test("базовая схема — та, в которой подготовлены SVG", () => {
  const base = getBaseScheme();
  assert.equal(base.id, "violet");
  assert.deepEqual(buildRepaintMapping(base.id, "full"), {});
  assert.deepEqual(buildRepaintMapping(null, "full"), {});
});

test("переключение схемы сопоставляет цвета по слотам", () => {
  const violet = getScheme("violet")!;
  const peach = getScheme("peach")!;
  const mapping = buildSchemeMapping(violet, peach);

  assert.equal(mapping["#d7cdf5"], "#fdd7b9");
  assert.equal(mapping["#aa9bf0"], "#fac896");
  assert.equal(mapping["#7864d7"], "#d27532");
  assert.equal(mapping["#f9ecb0"], "#f9ecb0");
  assert.equal(mapping["#f9a3aa"], "#80dada");
  assert.equal(mapping["#ffe3e1"], "#beebeb");
  // Нейтральные цвета не меняются.
  assert.equal(mapping["#181817"], "#181817");
  assert.equal(mapping["#ffffff"], "#ffffff");
});

test("каждая пара схем даёт полное отображение восьми слотов", () => {
  for (const from of COLOR_SCHEMES) {
    for (const to of COLOR_SCHEMES) {
      const mapping = buildSchemeMapping(from, to);
      assert.equal(Object.keys(mapping).length, 8);
      for (const hex of Object.values(mapping)) {
        assert.match(hex, /^#[0-9a-f]{6}$/);
      }
    }
  }
});

test("ограничение repaint=none отключает перекраску", () => {
  assert.deepEqual(buildRepaintMapping("peach", "none"), {});
  assert.deepEqual(buildRepaintMapping("mint", "none"), {});
});

test("ограничение monochrome-only меняет только цвета фоновых объектов", () => {
  const mapping = buildRepaintMapping("mint", "monochrome-only");
  const keys = Object.keys(mapping);
  assert.deepEqual(keys.sort(), ["#7864d7", "#aa9bf0", "#d7cdf5"]);
});

test("перекраска меняет цвета, но не геометрию SVG", () => {
  const markup =
    '<svg viewBox="0 0 10 10"><path d="M0 0L10 10Z" fill="#d7cdf5"/><path d="M1 1L2 2Z" fill="#f9a3aa"/></svg>';
  const mapping = buildRepaintMapping("peach", "full");
  const painted = repaintSvg(markup, mapping);

  assert.ok(painted.includes("#fdd7b9"));
  assert.ok(painted.includes("#80dada"));
  assert.ok(painted.includes('d="M0 0L10 10Z"'), "геометрия не должна меняться");
  assert.ok(painted.includes('d="M1 1L2 2Z"'));
});

test("неизвестные цвета сохраняются при перекраске", () => {
  const markup = '<path d="M0 0L1 1Z" fill="#123456"/>';
  const painted = repaintSvg(markup, buildRepaintMapping("mint", "full"));
  assert.ok(painted.includes("#123456"));
});

test("repaintContents применяет схему ко всем компонентам библиотеки", () => {
  const components = new Map<string, LibraryComponent>(
    manifest.components.map((c) => [c.id, c]),
  );
  const primary = manifest.components.find((c) => c.role === "primary")!;
  const backdrop = manifest.components.find((c) => c.role === "backdrop")!;

  const contents = new Map<string, string>([
    [primary.id, '<path d="M0 0L1 1Z" fill="#d7cdf5"/>'],
    [backdrop.id, '<path d="M0 0L1 1Z" fill="#d7cdf5"/>'],
  ]);

  const painted = repaintContents(contents, components, "peach");
  assert.ok(painted.get(primary.id)!.includes("#fdd7b9"), "главный объект перекрашен");
  assert.ok(painted.get(backdrop.id)!.includes("#d7cdf5"), "задний фон не перекрашивается");
});

test("три варианта фона заданы точными исходными цветами", () => {
  assert.equal(CANVAS_BACKGROUNDS.length, 3);
  assert.deepEqual(
    CANVAS_BACKGROUNDS.map((b) => b.hex),
    ["#d7cdf5", "#fdd7b9", "#beebeb"],
  );
  assert.equal(new Set(CANVAS_BACKGROUNDS.map((b) => b.id)).size, 3);
});

test("фон связан со схемой и меняется при её переключении", () => {
  assert.equal(backgroundForScheme("violet").hex, "#d7cdf5");
  assert.equal(backgroundForScheme("peach").hex, "#fdd7b9");
  assert.equal(backgroundForScheme("mint").hex, "#beebeb");
  assert.equal(canvasColor("mint"), "#beebeb");
  assert.equal(canvasColor("unknown"), "#d7cdf5");
});

test("у каждого фона есть декоративная подложка из библиотеки Figma", () => {
  for (const background of CANVAS_BACKGROUNDS) {
    assert.ok(background.svgPath, `фон ${background.id} должен ссылаться на SVG`);

    const component = manifest.components.find(
      (c) => c.id === backdropComponentId(background.id, "L"),
    );
    assert.ok(component, `фон ${background.id}: подложка отсутствует в манифесте`);
    assert.equal(component!.role, "backdrop");
    assert.equal(component!.svgPath, background.svgPath);

    const svg = readFileSync(
      new URL(`../public${background.svgPath}`, import.meta.url),
      "utf8",
    );
    assert.match(svg, /<svg[\s>]/, `фон ${background.id}: файл не похож на SVG`);
    assert.ok(
      svg.toLowerCase().includes(background.hex),
      `фон ${background.id}: базовый цвет отсутствует в SVG`,
    );
  }
});

test("подложка выбирается по фону и размерному набору", () => {
  assert.equal(backdropComponentId("violet", "L"), "L-backdrop-backdrop-violet");
  assert.equal(backdropComponentId("peach", "S"), "S-backdrop-backdrop-peach");
  assert.equal(backdropComponentId("unknown", "L"), "L-backdrop-backdrop-violet");

  for (const size of ["L", "S"] as const) {
    for (const background of CANVAS_BACKGROUNDS) {
      const id = backdropComponentId(background.id, size);
      assert.ok(
        manifest.components.some((c) => c.id === id),
        `в манифесте нет подложки ${id}`,
      );
    }
  }
});

test("экспорт рисует подложку под объектами и уникализирует её ID", () => {
  const backdrop = manifest.components.find(
    (c) => c.id === "L-backdrop-backdrop-peach",
  )!;
  const backdropSvg = readFileSync(
    new URL(`../public${backdrop.svgPath}`, import.meta.url),
    "utf8",
  );

  const svg = buildCompositionSvg(
    COMPOSITION,
    new Map([
      ["c", makeComponent()],
      [backdrop.id, backdrop],
    ]),
    new Map([
      ["c", '<svg viewBox="0 0 100 50"><path d="M0 0L100 50Z" fill="#d7cdf5"/></svg>'],
      [backdrop.id, backdropSvg],
    ]),
    { width: 1200, height: 1200 },
    { background: "#fdd7b9", backdropId: backdrop.id },
  );

  const backdropIndex = svg.indexOf('preserveAspectRatio="xMidYMid slice"');
  const objectIndex = svg.indexOf('<g transform="translate(');

  assert.ok(backdropIndex > 0, "подложка должна попасть в экспорт");
  assert.ok(backdropIndex < objectIndex, "подложка должна идти до объектов");
  assert.ok(
    svg.indexOf('fill="#fdd7b9"') < backdropIndex,
    "цветная заливка остаётся под подложкой",
  );
  assert.ok(svg.includes("backdrop__clip0_21_25399"), "ID подложки должны быть уникальны");
  assert.ok(!svg.includes('id="clip0_21_25399"'), "исходный ID не должен остаться");
});

test("без backdropId экспорт не добавляет слой подложки", () => {
  const svg = buildCompositionSvg(
    COMPOSITION,
    new Map([["c", makeComponent()]]),
    new Map([["c", '<svg viewBox="0 0 100 50"><path d="M0 0L1 1Z" fill="#d7cdf5"/></svg>']]),
    { width: 1200, height: 1200 },
    { background: "#fdd7b9" },
  );

  assert.ok(!svg.includes("preserveAspectRatio"));
});

// ==================== ЭКСПОРТ ====================

test("экспорт не вставляет атрибуты корневого <svg> внутрь групп объектов", () => {
  const svg = buildCompositionSvg(
    COMPOSITION,
    new Map([["c", makeComponent()]]),
    new Map([
      ["c", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><path d="M0 0L1 1Z" fill="#d7cdf5"/></svg>'],
    ]),
    { width: 1200, height: 1200 },
  );

  assert.ok(!svg.includes('xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><path'));
  assert.ok(svg.includes('<path d="M0 0L1 1Z" fill="#d7cdf5"/>'), "содержимое объекта должно остаться");
  assert.equal((svg.match(/<svg[\s>]/g) ?? []).length, 1, "должен быть только корневой <svg>");
});

function makeComponent(overrides: Partial<LibraryComponent> = {}): LibraryComponent {
  return {
    id: "c",
    name: "Тест",
    nameConfirmed: true,
    aliases: [],
    tags: [],
    sourceIllustrationId: "c",
    size: "L",
    role: "primary",
    svgPath: "/c.svg",
    viewBox: { x: 0, y: 0, width: 100, height: 50 },
    intrinsicSize: { width: 100, height: 50 },
    schemes: ["violet"],
    repaint: "full",
    sourceNodeCount: 1,
    ...overrides,
  };
}

const COMPOSITION: Composition = {
  id: "t",
  title: "t",
  format: "1:1",
  componentSize: "L",
  colorSchemeId: "peach",
  elements: [
    {
      instanceId: "i1",
      componentId: "c",
      position: { x: 10, y: 10 },
      size: { width: 100, height: 50 },
      rotation: 0,
      z: 1,
      visible: true,
    },
  ],
};

test("экспорт добавляет фон холста отдельным слоем под объектами", () => {
  const svg = buildCompositionSvg(
    COMPOSITION,
    new Map([["c", makeComponent()]]),
    new Map([["c", '<svg viewBox="0 0 100 50"><path d="M0 0L100 50Z" fill="#d7cdf5"/></svg>']]),
    { width: 1200, height: 1200 },
    { background: "#fdd7b9" },
  );

  const backgroundIndex = svg.indexOf('fill="#fdd7b9"');
  const objectIndex = svg.indexOf("<path");

  assert.ok(backgroundIndex > 0, "фон должен присутствовать в экспорте");
  assert.ok(backgroundIndex < objectIndex, "фон должен идти до объектов");
  assert.ok(svg.includes('width="1200" height="1200"'));
});

test("экспорт без фона не добавляет лишний прямоугольник", () => {
  const svg = buildCompositionSvg(
    COMPOSITION,
    new Map([["c", makeComponent()]]),
    new Map([["c", '<svg viewBox="0 0 100 50"><path d="M0 0L1 1Z" fill="#d7cdf5"/></svg>']]),
    { width: 1200, height: 1200 },
  );
  assert.ok(!svg.includes("<rect"));
});

test("экспорт сохраняет применённые цвета схемы", () => {
  const svg = buildCompositionSvg(
    COMPOSITION,
    new Map([["c", makeComponent()]]),
    new Map([["c", '<svg viewBox="0 0 100 50"><path d="M0 0L1 1Z" fill="#d7cdf5"/></svg>']]),
    { width: 1200, height: 1200 },
    { repaint: () => buildRepaintMapping("peach", "full") },
  );

  assert.ok(svg.includes("#fdd7b9"));
  assert.ok(!svg.includes("#d7cdf5"));
});

test("экспорт уважает repaint=none у компонента", () => {
  const svg = buildCompositionSvg(
    COMPOSITION,
    new Map([["c", makeComponent({ repaint: "none" })]]),
    new Map([["c", '<svg viewBox="0 0 100 50"><path d="M0 0L1 1Z" fill="#d7cdf5"/></svg>']]),
    { width: 1200, height: 1200 },
    { repaint: () => buildRepaintMapping("peach", "none") },
  );

  assert.ok(svg.includes("#d7cdf5"));
});
