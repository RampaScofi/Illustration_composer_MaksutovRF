import type { AiProviderId } from "./types.ts";

/**
 * Адаптер провайдеров: единая точка, где известно, как выглядит запрос
 * и где лежит текст ответа у каждого API. Остальной код не знает о форматах.
 */

export type ProviderPreset = {
  id: AiProviderId;
  label: string;
  defaultBaseUrl: string;
  /** Подсказка для поля модели: пользователь вводит точное имя модели сам. */
  modelHint: string;
  /** Разрешён ли пользовательский адрес endpoint. */
  baseUrlEditable: boolean;
};

export const AI_PROVIDERS: readonly ProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    modelHint: "например, имя модели из кабинета OpenAI",
    baseUrlEditable: false,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    modelHint: "например, имя модели из кабинета Anthropic",
    baseUrlEditable: false,
  },
  {
    id: "groq",
    label: "Groq (бесплатный тариф)",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    modelHint: "имя модели из консоли Groq",
    baseUrlEditable: false,
  },
  {
    id: "custom",
    label: "Свой endpoint (OpenAI-совместимый)",
    defaultBaseUrl: "",
    modelHint: "имя модели на вашем сервере",
    baseUrlEditable: true,
  },
];

export function findProvider(id: string): ProviderPreset | null {
  return AI_PROVIDERS.find((provider) => provider.id === id) ?? null;
}

// Без глобального URL: он отсутствует в библиотеке ES2020 плагина Figma и не гарантирован
// в его песочнице. Проверка сводится к схеме и хосту, как и раньше.
const HTTPS_URL = /^https:\/\/[^\s/?#@]+(?:[/?#]\S*)?$/i;
const LOCAL_HTTP_URL = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?(?:[/?#]\S*)?$/i;

/**
 * Адрес пользовательского endpoint: только https, либо http для localhost.
 * Это ограничение снижает риск отправки ключа по открытому каналу.
 */
export function isAllowedBaseUrl(raw: string): boolean {
  return HTTPS_URL.test(raw) || LOCAL_HTTP_URL.test(raw);
}

export type ChatTarget = {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
};

export type ChatInput = {
  providerId: AiProviderId;
  model: string;
  baseUrl: string;
  apiKey: string;
};

/** Формирует HTTP-запрос к провайдеру. Возвращает null, если данных недостаточно. */
export function buildChatTarget(input: ChatInput, system: string, user: string): ChatTarget | null {
  const preset = findProvider(input.providerId);
  if (!preset) return null;

  const rawBase = preset.baseUrlEditable ? input.baseUrl : preset.defaultBaseUrl;
  const base = rawBase.replace(/\/+$/, "");
  if (!base || !input.model || !input.apiKey) return null;

  if (input.providerId === "anthropic") {
    return {
      url: `${base}/messages`,
      headers: {
        "content-type": "application/json",
        "x-api-key": input.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: {
        model: input.model,
        max_tokens: 2048,
        system,
        messages: [{ role: "user", content: user }],
      },
    };
  }

  const body: Record<string, unknown> = {
    model: input.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  // JSON-режим есть не у всех совместимых серверов, поэтому включаем его только для OpenAI.
  if (input.providerId === "openai") {
    body.response_format = { type: "json_object" };
  }

  return {
    url: `${base}/chat/completions`,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.apiKey}`,
    },
    body,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Достаёт текст ответа из JSON провайдера. Возвращает null, если формат неизвестен. */
export function extractText(providerId: AiProviderId, payload: unknown): string | null {
  if (!isRecord(payload)) return null;

  if (providerId === "anthropic") {
    if (!Array.isArray(payload.content)) return null;
    const text = payload.content
      .filter(
        (block): block is { type: string; text: string } =>
          isRecord(block) && block.type === "text" && typeof block.text === "string",
      )
      .map((block) => block.text)
      .join("");
    return text.length > 0 ? text : null;
  }

  if (!Array.isArray(payload.choices)) return null;
  const first: unknown = payload.choices[0];
  if (!isRecord(first) || !isRecord(first.message)) return null;
  return typeof first.message.content === "string" ? first.message.content : null;
}
