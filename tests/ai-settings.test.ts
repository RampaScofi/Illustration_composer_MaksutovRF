import test from "node:test";
import assert from "node:assert/strict";

import {
  AI_SETTINGS_STORAGE_KEY,
  DEFAULT_AI_SETTINGS,
  aiBlockReason,
  loadAiSettings,
  sanitizeAiSettings,
  saveAiSettings,
  type KeyValueStorage,
} from "../src/lib/ai/settings.ts";
import type { AiSettings } from "../src/lib/ai/types.ts";

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

const READY: AiSettings = {
  enabled: true,
  providerId: "openai",
  model: "gpt-test",
  baseUrl: "",
  apiKey: "sk-test-123",
};

test("sanitizeAiSettings: не-объект даёт значения по умолчанию", () => {
  assert.deepEqual(sanitizeAiSettings(null), DEFAULT_AI_SETTINGS);
  assert.deepEqual(sanitizeAiSettings("строка"), DEFAULT_AI_SETTINGS);
  assert.deepEqual(sanitizeAiSettings(42), DEFAULT_AI_SETTINGS);
});

test("sanitizeAiSettings: неизвестный провайдер заменяется на openai", () => {
  const result = sanitizeAiSettings({ providerId: "evil", apiKey: "k" });
  assert.equal(result.providerId, "openai");
  assert.equal(result.apiKey, "k");
});

test("sanitizeAiSettings: enabled принимается только как строгое true", () => {
  assert.equal(sanitizeAiSettings({ enabled: "true" }).enabled, false);
  assert.equal(sanitizeAiSettings({ enabled: 1 }).enabled, false);
  assert.equal(sanitizeAiSettings({ enabled: true }).enabled, true);
});

test("sanitizeAiSettings: строки обрезаются по пробелам и длине, нестроки пустеют", () => {
  const result = sanitizeAiSettings({
    model: "  gpt  ",
    apiKey: "x".repeat(900),
    baseUrl: 12345,
  });
  assert.equal(result.model, "gpt");
  assert.equal(result.apiKey.length, 500);
  assert.equal(result.baseUrl, "");
});

test("sanitizeAiSettings: неизвестные поля отбрасываются", () => {
  const result = sanitizeAiSettings({ apiKey: "k", extra: "лишнее" });
  assert.equal("extra" in result, false);
});

test("loadAiSettings: без хранилища или записи возвращает значения по умолчанию", () => {
  assert.deepEqual(loadAiSettings(null), DEFAULT_AI_SETTINGS);
  assert.deepEqual(loadAiSettings(memoryStorage()), DEFAULT_AI_SETTINGS);
});

test("loadAiSettings: повреждённый JSON не ломает загрузку", () => {
  const storage = memoryStorage({ [AI_SETTINGS_STORAGE_KEY]: "{не json" });
  assert.deepEqual(loadAiSettings(storage), DEFAULT_AI_SETTINGS);
});

test("loadAiSettings: ошибка чтения хранилища возвращает значения по умолчанию", () => {
  const broken: KeyValueStorage = {
    getItem: () => {
      throw new Error("доступ запрещён");
    },
    setItem: () => undefined,
  };
  assert.deepEqual(loadAiSettings(broken), DEFAULT_AI_SETTINGS);
});

test("saveAiSettings и loadAiSettings: круговой проход сохраняет значения", () => {
  const storage = memoryStorage();
  assert.equal(saveAiSettings(storage, READY), true);
  assert.deepEqual(loadAiSettings(storage), READY);
});

test("saveAiSettings: без хранилища или при ошибке записи возвращает false", () => {
  assert.equal(saveAiSettings(null, READY), false);
  const broken: KeyValueStorage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("квота исчерпана");
    },
  };
  assert.equal(saveAiSettings(broken, READY), false);
});

test("aiBlockReason: полностью заполненные настройки разрешены", () => {
  assert.equal(aiBlockReason(READY), null);
});

test("aiBlockReason: без ключа, без модели — понятная причина без раскрытия ключа", () => {
  assert.equal(aiBlockReason({ ...READY, apiKey: "" }), "не введён API-ключ");
  assert.equal(aiBlockReason({ ...READY, model: "" }), "не указана модель");
});

test("aiBlockReason: для custom адрес обязателен и проверяется", () => {
  const custom: AiSettings = { ...READY, providerId: "custom", baseUrl: "" };
  assert.match(aiBlockReason(custom) ?? "", /https/);
  assert.match(
    aiBlockReason({ ...custom, baseUrl: "http://example.com/v1" }) ?? "",
    /https/,
  );
  assert.equal(aiBlockReason({ ...custom, baseUrl: "https://example.com/v1" }), null);
});

test("aiBlockReason: адрес у фиксированных провайдеров не требуется", () => {
  assert.equal(aiBlockReason({ ...READY, providerId: "anthropic", baseUrl: "" }), null);
});
