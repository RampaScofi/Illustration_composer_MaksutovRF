import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { LibraryManifest } from "../src/types/library.ts";
import { createCatalog } from "../src/lib/library/catalog.ts";
import { matchComponents, selectCompositionPlan } from "../src/lib/semantic/matcher.ts";
import { buildAutoLayout } from "../src/lib/composition/autoLayout.ts";
import { CANVAS_FORMATS, resolveCanvasSize } from "../src/lib/composition/canvas.ts";

const manifest = JSON.parse(
  readFileSync(new URL("../public/assets/illustrations/manifest.json", import.meta.url), "utf8"),
) as LibraryManifest;

const catalog = createCatalog(manifest);

test("в библиотеке нет компонентов с неподтверждённым названием", () => {
  const unknown = manifest.components.filter((c) => !c.nameConfirmed);
  assert.deepEqual(unknown.map((c) => c.id), []);
});

test("объект «Ваза с цветами» назван и имеет поисковые синонимы", () => {
  const vases = manifest.components.filter((c) => c.name === "Ваза с цветами");
  assert.ok(vases.length > 0, "компонент должен присутствовать в каталоге");

  for (const vase of vases) {
    assert.ok(vase.nameConfirmed);
    for (const alias of ["ваза", "цветы", "букет", "букет в вазе", "растение"]) {
      assert.ok(vase.aliases.includes(alias), `${vase.id}: нет синонима «${alias}»`);
    }
  }
});

test("поиск находит вазу по каждому синониму и не создаёт дублей", () => {
  for (const query of ["ваза", "цветы", "букет", "букет в вазе", "растение", "ВАЗА"]) {
    const found = catalog.search(query).filter((c) => c.name === "Ваза с цветами");
    assert.ok(found.length > 0, `поиск «${query}» должен находить вазу`);
    const ids = found.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length, "дубликаты недопустимы");
  }
});

const PROMPTS = [
  "Обучение и саморазвитие",
  "Идеи превращаются в результат",
  "Работа и продуктивность",
  "Творчество и вдохновение",
  "Знания и развитие",
  "Технологии и коммуникация",
];

for (const prompt of PROMPTS) {
  test(`запрос «${prompt}» собирает композицию из существующих объектов`, () => {
    const result = matchComponents(prompt, manifest.components);
    assert.ok(result.hasMatches, "должны быть совпадения");

    const plan = selectCompositionPlan(result, { size: "L" });
    assert.ok(plan.main, "должен быть главный объект");
    assert.ok(plan.items.length >= 1);

    const known = new Set(manifest.components.map((c) => c.id));
    for (const item of plan.items) {
      assert.ok(known.has(item.component.id), "нельзя выбирать несуществующие объекты");
      assert.equal(item.component.size, "L");
      assert.notEqual(item.component.role, "backdrop");
    }

    // Компоновка работает для всех шести форматов.
    for (const format of CANVAS_FORMATS) {
      const layout = buildAutoLayout(
        plan.items.map((item) => ({
          componentId: item.component.id,
          role: item.component.role,
          intrinsic: item.component.intrinsicSize,
          category: item.component.sourceIllustrationId,
        })),
        { canvas: resolveCanvasSize(format.id) },
      );
      assert.ok(layout.length >= 1, `формат ${format.id}: пустая компоновка`);
    }
  });
}

test("нерелевантный запрос не подменяется случайной композицией", () => {
  const result = matchComponents("квантовая хромодинамика", manifest.components);
  assert.equal(result.hasMatches, false);
  const plan = selectCompositionPlan(result, { size: "L" });
  assert.deepEqual(plan.items, []);
});
