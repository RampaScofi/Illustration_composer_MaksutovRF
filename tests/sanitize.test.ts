import test from "node:test";
import assert from "node:assert/strict";

import { findUnsafeConstructs, isSvgDocument, sanitizeSvgMarkup } from "../src/lib/svg/sanitize.ts";

const SAFE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0H10" fill="#7864d7"/></svg>';

test("isSvgDocument распознает корневой svg, игнорируя пролог и комментарии", () => {
  assert.equal(isSvgDocument(SAFE_SVG), true);
  assert.equal(isSvgDocument('<?xml version="1.0"?><!-- x -->' + SAFE_SVG), true);
  assert.equal(isSvgDocument("<div/>"), false);
  assert.equal(isSvgDocument(""), false);
  assert.equal(isSvgDocument("<svgfoo/>"), false);
});

test("безопасный файл не даёт нарушений и не меняется при очистке", () => {
  assert.deepEqual(findUnsafeConstructs(SAFE_SVG), []);
  const result = sanitizeSvgMarkup(SAFE_SVG);
  assert.equal(result.markup, SAFE_SVG);
  assert.deepEqual(result.findings, []);
});

test("обнаруживаются script, обработчики и javascript-ссылки", () => {
  const markup =
    '<svg onload="alert(1)"><script>alert(2)</script><a href="javascript:void(0)">x</a></svg>';
  const rules = findUnsafeConstructs(markup).map((f) => f.rule);
  assert.ok(rules.includes("script-element"));
  assert.ok(rules.includes("event-handler-attribute"));
  assert.ok(rules.includes("javascript-url"));
});

test("обнаруживаются внешние ссылки, локальные fragments разрешены", () => {
  assert.ok(
    findUnsafeConstructs('<svg><use href="https://evil.example/x.svg#y"/></svg>').some(
      (f) => f.rule === "external-reference",
    ),
  );
  assert.deepEqual(findUnsafeConstructs('<svg><use href="#local-gradient"/></svg>'), []);
});

test("очистка удаляет исполняемое, сохраняя геометрию", () => {
  const dirty =
    '<svg viewBox="0 0 10 10"><script>alert(1)</script><rect onload="x()" width="5"/><foreignObject><div>hi</div></foreignObject></svg>';
  const clean = sanitizeSvgMarkup(dirty).markup;
  assert.ok(!clean.includes("script"));
  assert.ok(!clean.includes("onload"));
  assert.ok(!clean.includes("foreignObject"));
  assert.ok(clean.includes('viewBox="0 0 10 10"'));
  assert.ok(clean.includes('width="5"'));
});
