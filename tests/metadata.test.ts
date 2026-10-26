import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeTags,
  validateColorScheme,
  validateLibraryComponent,
  validateLibraryManifest,
} from "../src/lib/metadata/validate.ts";
import { readLibrarySnapshot } from "../src/lib/library/librarySource.ts";

const VALID_COMPONENT = {
  id: "L-puzzle",
  name: "Пазлы",
  size: "L",
  role: "primary",
  sourceIllustrationId: "ill-01",
  svgPath: "/assets/illustrations/L/puzzle.svg",
  viewBox: { x: 0, y: 0, width: 120, height: 80 },
  intrinsicSize: { width: 120, height: 80 },
  tags: ["пазл"],
};

test("валидный компонент проходит проверку", () => {
  const result = validateLibraryComponent(VALID_COMPONENT);
  assert.equal(result.ok, true);
});

test("компонент с битым viewBox или не-SVG путём отклоняется", () => {
  const badBox = validateLibraryComponent({
    ...VALID_COMPONENT,
    viewBox: { x: 0, y: 0, width: 0, height: 10 },
  });
  assert.equal(badBox.ok, false);

  const badPath = validateLibraryComponent({ ...VALID_COMPONENT, svgPath: "/a/night.png" });
  assert.equal(badPath.ok, false);
  assert.ok(badPath.issues.some((i) => i.field === "svgPath"));
});

test("манифест отклоняет дубликаты идентификаторов", () => {
  const result = validateLibraryManifest({
    version: "1",
    components: [VALID_COMPONENT, { ...VALID_COMPONENT, name: "Дубль" }],
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.message.includes("Дубликат")));
});

test("манифест принимает корректный список", () => {
  const result = validateLibraryManifest({
    version: "1",
    components: [VALID_COMPONENT, { ...VALID_COMPONENT, id: "S-puzzle", size: "S" }],
  });
  assert.equal(result.ok, true);
});

test("цветовая схема требует корректные hex-значения и известные роли", () => {
  assert.equal(
    validateColorScheme({
      id: "scheme-1",
      name: "Схема 1",
      colors: [{ slot: "background", hex: "#F4F4F4" }],
    }).ok,
    true,
  );

  const bad = validateColorScheme({
    id: "scheme-2",
    name: "Схема 2",
    colors: [{ slot: "unknown", hex: "белый" }],
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.issues.length, 2);
});

test("normalizeTags убирает дубликаты, регистр и пробелы", () => {
  assert.deepEqual(normalizeTags([" Пазл ", "пазл", "", "Lamp"]), ["пазл", "lamp"]);
  assert.deepEqual(normalizeTags(null), []);
});

test("пустая библиотека показывает состояние «не импортировано» без заглушек", () => {
  const snapshot = readLibrarySnapshot();
  assert.equal(snapshot.status, "not-imported");
  assert.equal(snapshot.components.length, 0);
  assert.ok(snapshot.notice);
});
