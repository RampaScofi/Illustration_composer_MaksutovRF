import test from "node:test";
import assert from "node:assert/strict";

import {
  buildChatTarget,
  extractText,
  findProvider,
  isAllowedBaseUrl,
} from "../src/lib/ai/providers.ts";
import { parseComposeBody } from "../src/lib/ai/request.ts";
import { buildAiCatalog } from "../src/lib/ai/contract.ts";
import type { LibraryComponent } from "../src/types/library.ts";

test("isAllowedBaseUrl: https разрешён, http только для localhost", () => {
  assert.equal(isAllowedBaseUrl("https://example.com/v1"), true);
  assert.equal(isAllowedBaseUrl("http://localhost:11434/v1"), true);
  assert.equal(isAllowedBaseUrl("http://127.0.0.1:8080"), true);
  assert.equal(isAllowedBaseUrl("http://example.com/v1"), false);
  assert.equal(isAllowedBaseUrl("ftp://example.com"), false);
  assert.equal(isAllowedBaseUrl("not a url"), false);
  assert.equal(isAllowedBaseUrl(""), false);
});

test("OpenAI: адрес, заголовок Bearer и JSON-режим", () => {
  const target = buildChatTarget(
    { providerId: "openai", model: "m1", baseUrl: "", apiKey: "sk-test" },
    "sys",
    "usr",
  );
  assert.ok(target);
  assert.equal(target.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(target.headers.authorization, "Bearer sk-test");
  assert.deepEqual(target.body.response_format, { type: "json_object" });
  assert.equal((target.body.messages as unknown[]).length, 2);
});

test("Anthropic: system отдельным полем и заголовки версии API", () => {
  const target = buildChatTarget(
    { providerId: "anthropic", model: "m2", baseUrl: "", apiKey: "k" },
    "sys",
    "usr",
  );
  assert.ok(target);
  assert.equal(target.url, "https://api.anthropic.com/v1/messages");
  assert.equal(target.headers["x-api-key"], "k");
  assert.equal(target.headers["anthropic-version"], "2023-06-01");
  assert.equal(target.body.system, "sys");
  assert.equal("response_format" in target.body, false);
});

test("custom: адрес пользователя с обрезанными слешами", () => {
  const target = buildChatTarget(
    { providerId: "custom", model: "m", baseUrl: "http://localhost:1234/v1///", apiKey: "k" },
    "s",
    "u",
  );
  assert.ok(target);
  assert.equal(target.url, "http://localhost:1234/v1/chat/completions");
});

test("без ключа, модели или адреса запрос не формируется", () => {
  assert.equal(
    buildChatTarget({ providerId: "openai", model: "", baseUrl: "", apiKey: "k" }, "s", "u"),
    null,
  );
  assert.equal(
    buildChatTarget({ providerId: "openai", model: "m", baseUrl: "", apiKey: "" }, "s", "u"),
    null,
  );
  assert.equal(
    buildChatTarget({ providerId: "custom", model: "m", baseUrl: "", apiKey: "k" }, "s", "u"),
    null,
  );
});

test("extractText читает ответ каждого формата", () => {
  assert.equal(
    extractText("openai", { choices: [{ message: { content: "{}" } }] }),
    "{}",
  );
  assert.equal(
    extractText("anthropic", {
      content: [
        { type: "text", text: "аб" },
        { type: "tool_use" },
        { type: "text", text: "в" },
      ],
    }),
    "абв",
  );
  assert.equal(extractText("custom", { choices: [] }), null);
  assert.equal(extractText("anthropic", null), null);
});

test("findProvider знает три провайдера", () => {
  assert.equal(findProvider("openai")?.id, "openai");
  assert.equal(findProvider("anthropic")?.id, "anthropic");
  assert.equal(findProvider("custom")?.baseUrlEditable, true);
  assert.equal(findProvider("unknown"), null);
});

const component = (over: Partial<LibraryComponent>): LibraryComponent =>
  ({
    id: "c",
    name: "Имя",
    nameConfirmed: true,
    aliases: ["a"],
    tags: ["t"],
    sourceIllustrationId: "src",
    size: "L",
    role: "primary",
    svgPath: "/p.svg",
    viewBox: { x: 0, y: 0, width: 1, height: 1 },
    intrinsicSize: { width: 1, height: 1 },
    schemes: [],
    repaint: "full",
    sourceNodeCount: 1,
    ...over,
  }) as LibraryComponent;

test("buildAiCatalog: только выбранный размер и роли primary/background", () => {
  const catalog = buildAiCatalog(
    [
      component({ id: "a", size: "L", role: "primary" }),
      component({ id: "b", size: "S", role: "primary" }),
      component({ id: "c", size: "L", role: "backdrop" }),
      component({ id: "d", size: "L", role: "background" }),
    ],
    "L",
  );
  assert.deepEqual(catalog.map((e) => e.id), ["a", "d"]);
  assert.equal(catalog[0].category, "src");
});

test("parseComposeBody отклоняет некорректные поля", () => {
  const valid = {
    prompt: "идеи",
    size: "L",
    catalog: [
      { id: "a", name: "A", aliases: [], tags: [], role: "primary", category: "c1" },
    ],
    provider: { id: "openai", model: "m", baseUrl: "", apiKey: "k" },
  };
  assert.equal(parseComposeBody(valid).ok, true);
  assert.equal(parseComposeBody({ ...valid, prompt: "   " }).ok, false);
  assert.equal(parseComposeBody({ ...valid, size: "XL" }).ok, false);
  assert.equal(parseComposeBody({ ...valid, variantCount: 99 }).ok, false);
  assert.equal(parseComposeBody({ ...valid, catalog: [] }).ok, false);
  assert.equal(
    parseComposeBody({ ...valid, provider: { ...valid.provider, id: "evil" } }).ok,
    false,
  );
  assert.equal(
    parseComposeBody({ ...valid, provider: { ...valid.provider, apiKey: "" } }).ok,
    false,
  );
});

test("parseComposeBody по умолчанию запрашивает три варианта", () => {
  const result = parseComposeBody({
    prompt: "идеи",
    size: "S",
    catalog: [
      { id: "a", name: "A", aliases: [], tags: [], role: "primary", category: "c1" },
    ],
    provider: { id: "custom", model: "m", baseUrl: "http://localhost:1/v1", apiKey: "k" },
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.variantCount, 3);
});
