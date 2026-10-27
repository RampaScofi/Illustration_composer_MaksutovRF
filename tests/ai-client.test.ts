import test from "node:test";
import assert from "node:assert/strict";

import { AI_COMPOSE_ENDPOINT, requestAiVariants } from "../src/lib/ai/client.ts";
import type { AiComposeRequest } from "../src/lib/ai/types.ts";

const REQUEST: AiComposeRequest = {
  prompt: "знания",
  size: "L",
  variantCount: 3,
  catalog: [],
  provider: { id: "openai", model: "m", baseUrl: "", apiKey: "sk-secret" },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("requestAiVariants: отправляет POST на собственный endpoint без прямого вызова провайдера", async () => {
  const calls: { input: string; init?: RequestInit }[] = [];
  const fetchImpl = async (input: string, init?: RequestInit) => {
    calls.push({ input, init });
    return jsonResponse({ variants: [] });
  };

  await requestAiVariants(REQUEST, fetchImpl);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, AI_COMPOSE_ENDPOINT);
  assert.equal(calls[0].init?.method, "POST");
  assert.equal(calls[0].init?.cache, "no-store");
});

test("requestAiVariants: успешный ответ возвращает проверенную форму вариантов", async () => {
  const variants = [
    { title: "Вариант 1", reason: "причина", primaryIds: ["a"], backgroundId: null },
  ];
  const result = await requestAiVariants(REQUEST, async () =>
    jsonResponse({ variants }),
  );
  assert.deepEqual(result, { ok: true, variants });
});

test("requestAiVariants: сетевой сбой возвращает ошибку, а не исключение", async () => {
  const result = await requestAiVariants(REQUEST, async () => {
    throw new TypeError("fetch failed");
  });
  assert.deepEqual(result, { ok: false, error: "нет связи с сервером" });
});

test("requestAiVariants: текст ошибки сервера передаётся пользователю", async () => {
  const result = await requestAiVariants(REQUEST, async () =>
    jsonResponse({ error: "неверная модель" }, 422),
  );
  assert.deepEqual(result, { ok: false, error: "неверная модель" });
});

test("requestAiVariants: ошибка без текста получает код статуса", async () => {
  const result = await requestAiVariants(REQUEST, async () =>
    new Response("не json", { status: 502 }),
  );
  assert.deepEqual(result, { ok: false, error: "ошибка 502" });
});

test("requestAiVariants: ответ неожиданной формы отклоняется", async () => {
  const result = await requestAiVariants(REQUEST, async () =>
    jsonResponse({ variants: [{ title: 1 }] }),
  );
  assert.deepEqual(result, {
    ok: false,
    error: "ответ сервера в неожиданном формате",
  });
});

test("requestAiVariants: ключ не попадает в текст ошибки", async () => {
  const result = await requestAiVariants(REQUEST, async () =>
    jsonResponse({ error: "неверная модель" }, 422),
  );
  assert.equal(JSON.stringify(result).includes("sk-secret"), false);
});
