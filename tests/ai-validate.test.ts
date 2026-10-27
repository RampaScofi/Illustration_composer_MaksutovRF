import test from "node:test";
import assert from "node:assert/strict";

import type { AiCatalogEntry } from "../src/lib/ai/types.ts";
import { validateAiResponse } from "../src/lib/ai/validate.ts";

const catalog: AiCatalogEntry[] = [
  { id: "book", name: "Книга", aliases: ["книги"], tags: ["знания"], role: "primary", category: "c-learn" },
  { id: "bulb", name: "Лампочка", aliases: [], tags: ["идея"], role: "primary", category: "c-idea" },
  { id: "gear", name: "Шестерня", aliases: [], tags: ["работа"], role: "primary", category: "c-work" },
  { id: "book2", name: "Книга 2", aliases: [], tags: [], role: "primary", category: "c-learn" },
  { id: "bg-blue", name: "Фон", aliases: [], tags: [], role: "background", category: "c-bg" },
  { id: "tool", name: "Инструмент", aliases: [], tags: [], role: "primary", category: "c-tool" },
  { id: "art", name: "Картина", aliases: [], tags: [], role: "primary", category: "c-art" },
  { id: "food", name: "Еда", aliases: [], tags: [], role: "primary", category: "c-food" },
];

function wrap(variants: unknown): string {
  return JSON.stringify({ variants });
}

test("принимает корректный вариант и возвращает проверенный план", () => {
  const raw = wrap([
    { title: "Учёба", reason: "книга", primary: ["book"], background: "bg-blue" },
  ]);
  const result = validateAiResponse(raw, catalog, 3);
  assert.equal(result.rejected, 0);
  assert.deepEqual(result.variants, [
    { title: "Учёба", reason: "книга", primaryIds: ["book"], backgroundId: "bg-blue" },
  ]);
});

test("снимает Markdown-ограждение вокруг JSON", () => {
  const raw = "```json\n" + wrap([{ title: "Т", primary: ["bulb"] }]) + "\n```";
  const result = validateAiResponse(raw, catalog, 3);
  assert.equal(result.variants.length, 1);
  assert.equal(result.variants[0].backgroundId, null);
});

test("неизвестный id отбрасывает весь вариант", () => {
  const raw = wrap([
    { title: "Плохо", primary: ["unknown-object"] },
    { title: "Хорошо", primary: ["gear"] },
  ]);
  const result = validateAiResponse(raw, catalog, 3);
  assert.equal(result.rejected, 1);
  assert.deepEqual(result.variants.map((v) => v.title), ["Хорошо"]);
});

test("роль background нельзя использовать как primary и наоборот", () => {
  const raw = wrap([
    { title: "А", primary: ["bg-blue"] },
    { title: "Б", primary: ["gear"], background: "gear" },
  ]);
  const result = validateAiResponse(raw, catalog, 3);
  assert.equal(result.variants.length, 0);
  assert.equal(result.rejected, 2);
});

test("два объекта одной категории в варианте запрещены", () => {
  const raw = wrap([{ title: "Двойная", primary: ["book", "book2"] }]);
  const result = validateAiResponse(raw, catalog, 3);
  assert.equal(result.variants.length, 0);
  assert.equal(result.rejected, 1);
});

test("больше MAX_PRIMARY primary и пустой список отбрасываются", () => {
  const raw = wrap([
    { title: "Много", primary: ["book", "bulb", "gear", "tool", "art", "food"] },
    { title: "Пусто", primary: [] },
  ]);
  const result = validateAiResponse(raw, catalog, 3);
  assert.equal(result.variants.length, 0);
  assert.equal(result.rejected, 2);
});

test("одинаковые варианты схлопываются и считаются отказом", () => {
  const raw = wrap([
    { title: "Первый", primary: ["bulb"] },
    { title: "Второй", primary: ["bulb"] },
  ]);
  const result = validateAiResponse(raw, catalog, 3);
  assert.equal(result.variants.length, 1);
  assert.equal(result.rejected, 1);
});

test("число вариантов ограничено запрошенным значением", () => {
  const raw = wrap([
    { title: "1", primary: ["bulb"] },
    { title: "2", primary: ["gear"] },
    { title: "3", primary: ["book"] },
  ]);
  const result = validateAiResponse(raw, catalog, 2);
  assert.equal(result.variants.length, 2);
});

test("длинные title и reason обрезаются, а не пропускаются", () => {
  const long = "я".repeat(500);
  const raw = wrap([{ title: long, reason: long, primary: ["bulb"] }]);
  const result = validateAiResponse(raw, catalog, 3);
  assert.equal(result.variants[0].title.length, 80);
  assert.equal(result.variants[0].reason.length, 300);
});

test("ответ не JSON или без variants возвращает пустой результат", () => {
  assert.deepEqual(validateAiResponse("привет", catalog, 3), { variants: [], rejected: 0 });
  assert.deepEqual(validateAiResponse("{}", catalog, 3), { variants: [], rejected: 0 });
  assert.deepEqual(validateAiResponse('{"variants":"x"}', catalog, 3), {
    variants: [],
    rejected: 0,
  });
});
