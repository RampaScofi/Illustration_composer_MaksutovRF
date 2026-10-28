import test from "node:test";
import assert from "node:assert/strict";

import type { LibraryComponent } from "../src/types/library.ts";
import { normalizeText, stemWord, tokenize } from "../src/lib/semantic/normalize.ts";
import {
  MAX_PRIMARY_OBJECTS,
  matchComponents,
  selectCompositionPlan,
} from "../src/lib/semantic/matcher.ts";

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
    svgPath: "/x.svg",
    viewBox: { x: 0, y: 0, width: 100, height: 100 },
    intrinsicSize: { width: 100, height: 100 },
    schemes: ["violet"],
    repaint: "full",
    sourceNodeCount: 1,
    ...overrides,
  };
}

const LIBRARY: LibraryComponent[] = [
  makeComponent({ id: "L-primary-book", name: "Книга", aliases: ["book"], tags: ["обучение", "знания", "чтение"], sourceIllustrationId: "L-book" }),
  makeComponent({ id: "L-background-book", name: "Книга", role: "background", repaint: "monochrome-only", sourceIllustrationId: "L-book" }),
  makeComponent({ id: "L-primary-puzzle", name: "Пазлы", tags: ["обучение", "развитие", "задача"], sourceIllustrationId: "L-puzzle" }),
  makeComponent({ id: "L-primary-lamp", name: "Лампа", aliases: ["торшер"], tags: ["идея", "вдохновение", "работа"], sourceIllustrationId: "L-lamp" }),
  makeComponent({ id: "L-background-lamp", name: "Лампа", role: "background", repaint: "monochrome-only", tags: ["обучение", "знание"], sourceIllustrationId: "L-lamp" }),
  makeComponent({ id: "L-primary-phone", name: "Телефон", aliases: ["смартфон"], tags: ["технологии", "коммуникация"], sourceIllustrationId: "L-phone" }),
  makeComponent({ id: "L-primary-wallet", name: "Кошелек", aliases: ["кошелек", "бумажник"], tags: ["деньги", "финансы"], sourceIllustrationId: "L-wallet" }),
  makeComponent({
    id: "L-primary-group-344",
    name: "Ваза с цветами",
    aliases: ["ваза", "цветы", "букет", "букет в вазе", "растение"],
    tags: ["природа", "растение", "декор", "подарок"],
    sourceIllustrationId: "L-group-344",
  }),
  makeComponent({ id: "S-primary-book", name: "Книга", size: "S", tags: ["обучение", "знания"], sourceIllustrationId: "S-book" }),
];

test("нормализация приводит регистр, «ё» и пунктуацию", () => {
  assert.equal(normalizeText("  Ёжик, ИДЕЯ!  "), "ежик идея");
  assert.equal(normalizeText("Кошелёк — деньги"), "кошелек деньги");
});

test("стемминг сводит формы одного слова", () => {
  assert.equal(stemWord("обучение"), stemWord("обучения"));
  assert.equal(stemWord("знания"), stemWord("знание"));
  assert.equal(stemWord("идеи"), stemWord("идея"));
  assert.notEqual(stemWord("книга"), stemWord("лампа"));
});

test("токенизация убирает служебные слова", () => {
  const tokens = tokenize("Идеи превращаются в результат");
  assert.ok(tokens.length > 0);
  assert.ok(!tokens.includes("в"));
  assert.ok(tokens.some((t) => t.startsWith("иде")));
});

test("запрос «обучение и саморазвитие» находит объекты про знания", () => {
  const result = matchComponents("Обучение и саморазвитие", LIBRARY);
  assert.ok(result.hasMatches);
  const ids = result.candidates.map((c) => c.component.id);
  assert.ok(ids.includes("L-primary-book"));
  assert.ok(ids.includes("L-primary-puzzle"));
  // Смысловая связь «саморазвитие» → знания/чтение сработала.
  assert.ok(result.concepts.length > 0);
});

test("ассоциации расширяют запрос: «саморазвитие» тянет знания", () => {
  const result = matchComponents("саморазвитие", LIBRARY);
  const book = result.candidates.find((c) => c.component.id === "L-primary-book");
  assert.ok(book, "книга должна попасть в кандидаты через ассоциацию");
  assert.ok(book!.score > 0);
  assert.ok(book!.concepts.length > 0, "должно быть объяснение смыслового поля");
});

test("синонимы ищутся: «букет» находит вазу с цветами", () => {
  const result = matchComponents("букет", LIBRARY);
  assert.equal(result.candidates[0]?.component.id, "L-primary-group-344");
});

test("вариант написания «е/ё» не мешает поиску", () => {
  const result = matchComponents("кошелёк", LIBRARY);
  assert.equal(result.candidates[0]?.component.id, "L-primary-wallet");
});

test("нерелевантный запрос не даёт совпадений", () => {
  const result = matchComponents("квантовая хромодинамика", LIBRARY);
  assert.equal(result.hasMatches, false);
  assert.deepEqual(result.candidates, []);
});

test("подбор возвращает только существующие компоненты", () => {
  const result = matchComponents("технологии", LIBRARY);
  const known = new Set(LIBRARY.map((c) => c.id));
  for (const candidate of result.candidates) {
    assert.ok(known.has(candidate.component.id));
  }
});

test("план композиции: главный объект, взаимодополняющие, фон другой категории", () => {
  const result = matchComponents("обучение и знания", LIBRARY);
  const plan = selectCompositionPlan(result, { size: "L" });

  assert.ok(plan.main);
  assert.ok(plan.primary.length >= 1);
  assert.ok(plan.primary.length <= MAX_PRIMARY_OBJECTS);
  assert.ok(plan.background);
  // Фоновый вариант не должен быть тем же предметом, что объект переднего
  // плана: иначе одна и та же иллюстрация оказывается и главным объектом, и
  // подложкой, и подложка перетягивает на себя всю сцену.
  const primaryCategories = new Set(plan.primary.map((p) => p.component.sourceIllustrationId));
  assert.ok(!primaryCategories.has(plan.background!.component.sourceIllustrationId));
  // Дубликатов категорий нет.
  const categories = plan.primary.map((p) => p.component.sourceIllustrationId);
  assert.equal(new Set(categories).size, categories.length);
});

test("план композиции уважает размерный набор", () => {
  const result = matchComponents("обучение", LIBRARY);
  const plan = selectCompositionPlan(result, { size: "S" });
  for (const item of plan.items) {
    assert.equal(item.component.size, "S");
  }
});

test("план пуст, если совпадений нет", () => {
  const result = matchComponents("квантовая хромодинамика", LIBRARY);
  const plan = selectCompositionPlan(result, { size: "L" });
  assert.deepEqual(plan.items, []);
  assert.equal(plan.main, null);
});
