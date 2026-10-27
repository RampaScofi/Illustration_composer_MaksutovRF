import test from "node:test";
import assert from "node:assert/strict";

import {
  buildVariantLayout,
  variantToLayoutItems,
} from "../src/lib/ai/variants.ts";
import type { AiVariantPlan } from "../src/lib/ai/types.ts";
import type { LibraryComponent } from "../src/types/library.ts";

function component(
  id: string,
  role: LibraryComponent["role"],
  category: string,
): LibraryComponent {
  return {
    id,
    name: `Объект ${id}`,
    nameConfirmed: true,
    aliases: [],
    tags: [],
    sourceIllustrationId: category,
    size: "L",
    role,
    svgPath: `/assets/illustrations/L/${role}/${id}.svg`,
    viewBox: { x: 0, y: 0, width: 100, height: 100 },
    intrinsicSize: { width: 100, height: 100 },
    schemes: [],
    repaint: role === "background" ? "none" : "full",
    sourceNodeCount: 1,
  };
}

const LIBRARY = new Map<string, LibraryComponent>(
  [
    component("book", "primary", "learning"),
    component("bulb", "primary", "ideas"),
    component("sky", "background", "sky-cat"),
  ].map((c) => [c.id, c]),
);

const CANVAS = { width: 1600, height: 900 };

function plan(overrides: Partial<AiVariantPlan>): AiVariantPlan {
  return {
    title: "Вариант",
    reason: "причина",
    primaryIds: ["book"],
    backgroundId: null,
    ...overrides,
  };
}

test("variantToLayoutItems: переводит проверенный вариант в элементы автолейаута", () => {
  const items = variantToLayoutItems(
    plan({ primaryIds: ["book", "bulb"], backgroundId: "sky" }),
    LIBRARY,
  );
  assert.ok(items);
  assert.deepEqual(
    items.map((item) => [item.componentId, item.role]),
    [
      ["book", "primary"],
      ["bulb", "primary"],
      ["sky", "background"],
    ],
  );
});

test("variantToLayoutItems: неизвестный id отбрасывает весь вариант", () => {
  assert.equal(variantToLayoutItems(plan({ primaryIds: ["ghost"] }), LIBRARY), null);
});

test("variantToLayoutItems: роль не совпадает — вариант отбрасывается", () => {
  assert.equal(variantToLayoutItems(plan({ primaryIds: ["sky"] }), LIBRARY), null);
  assert.equal(
    variantToLayoutItems(plan({ primaryIds: ["book"], backgroundId: "bulb" }), LIBRARY),
    null,
  );
});

test("variantToLayoutItems: пустой вариант без объектов возвращает null", () => {
  assert.equal(
    variantToLayoutItems(plan({ primaryIds: [], backgroundId: null }), LIBRARY),
    null,
  );
});

test("buildVariantLayout: возвращает элементы, заголовок, причину и имена", () => {
  const layout = buildVariantLayout(
    plan({ title: "Учёба", reason: "про книги", primaryIds: ["book"] }),
    LIBRARY,
    CANVAS,
  );
  assert.ok(layout);
  assert.equal(layout.title, "Учёба");
  assert.equal(layout.reason, "про книги");
  assert.deepEqual(layout.names, ["Объект book"]);
  // Фоновые копии главного могут добавляться, поэтому проверяем наличие, а не число.
  assert.ok(layout.elements.some((element) => element.componentId === "book"));
});

test("buildVariantLayout: невалидный вариант не даёт раскладки", () => {
  assert.equal(
    buildVariantLayout(plan({ primaryIds: ["ghost"] }), LIBRARY, CANVAS),
    null,
  );
});

test("buildVariantLayout: раскладка детерминирована при одинаковом зерне", () => {
  const first = buildVariantLayout(plan({ primaryIds: ["book", "bulb"] }), LIBRARY, CANVAS, 7);
  const second = buildVariantLayout(plan({ primaryIds: ["book", "bulb"] }), LIBRARY, CANVAS, 7);
  assert.deepEqual(first, second);
});
