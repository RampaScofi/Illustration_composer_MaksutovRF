import type { AiCatalogEntry, AiComposeRequest, AiProviderId } from "./types.ts";
import { DEFAULT_VARIANT_COUNT } from "./contract.ts";

/**
 * Разбор тела запроса на сервере. Клиент — не доверенный источник,
 * поэтому все поля проверяются и ограничиваются по размеру.
 */

export const MAX_PROMPT_LENGTH = 500;
export const MAX_CATALOG_ENTRIES = 500;
export const MAX_VARIANTS = 5;
const MAX_MODEL_LENGTH = 200;
const MAX_KEY_LENGTH = 500;
const MAX_URL_LENGTH = 300;
const MAX_NAME_LENGTH = 200;
const MAX_LIST_ITEMS = 30;
const MAX_LIST_ITEM_LENGTH = 80;

const PROVIDER_IDS: readonly AiProviderId[] = ["openai", "anthropic", "custom"];

export type ParseResult =
  | { ok: true; value: AiComposeRequest }
  | { ok: false; error: string };

function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

function strList(value: unknown, maxItems: number, maxLength: number): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    items.push(item.slice(0, maxLength));
  }
  return items;
}

function parseCatalogEntry(raw: unknown): AiCatalogEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id, MAX_NAME_LENGTH);
  const name = str(r.name, MAX_NAME_LENGTH);
  const category = str(r.category, MAX_NAME_LENGTH);
  const aliases = strList(r.aliases, MAX_LIST_ITEMS, MAX_LIST_ITEM_LENGTH);
  const tags = strList(r.tags, MAX_LIST_ITEMS, MAX_LIST_ITEM_LENGTH);
  if (!id || !name || !category || !aliases || !tags) return null;
  if (r.role !== "primary" && r.role !== "background") return null;
  return { id, name, aliases, tags, role: r.role, category };
}

/** Проверяет тело POST-запроса и возвращает строго типизированное значение. */
export function parseComposeBody(raw: unknown): ParseResult {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "Тело запроса должно быть JSON-объектом." };
  }
  const body = raw as Record<string, unknown>;

  const prompt = str(body.prompt, MAX_PROMPT_LENGTH);
  if (!prompt) return { ok: false, error: "Укажите описание сюжета." };

  if (body.size !== "L" && body.size !== "S") {
    return { ok: false, error: "Размер должен быть L или S." };
  }

  let variantCount = DEFAULT_VARIANT_COUNT;
  if (body.variantCount !== undefined) {
    if (
      typeof body.variantCount !== "number" ||
      !Number.isInteger(body.variantCount) ||
      body.variantCount < 1 ||
      body.variantCount > MAX_VARIANTS
    ) {
      return { ok: false, error: `Количество вариантов: от 1 до ${MAX_VARIANTS}.` };
    }
    variantCount = body.variantCount;
  }

  if (!Array.isArray(body.catalog) || body.catalog.length === 0) {
    return { ok: false, error: "Каталог объектов пуст." };
  }
  if (body.catalog.length > MAX_CATALOG_ENTRIES) {
    return { ok: false, error: "Каталог слишком большой." };
  }
  const catalog: AiCatalogEntry[] = [];
  for (const item of body.catalog) {
    const entry = parseCatalogEntry(item);
    if (!entry) return { ok: false, error: "Некорректная запись каталога." };
    catalog.push(entry);
  }

  if (typeof body.provider !== "object" || body.provider === null) {
    return { ok: false, error: "Не задан провайдер." };
  }
  const p = body.provider as Record<string, unknown>;
  if (!PROVIDER_IDS.includes(p.id as AiProviderId)) {
    return { ok: false, error: "Неизвестный провайдер." };
  }
  const model = str(p.model, MAX_MODEL_LENGTH);
  const apiKey = str(p.apiKey, MAX_KEY_LENGTH);
  if (!model) return { ok: false, error: "Укажите модель." };
  if (!apiKey) return { ok: false, error: "Укажите API-ключ." };

  let baseUrl = "";
  if (typeof p.baseUrl === "string") baseUrl = p.baseUrl.trim().slice(0, MAX_URL_LENGTH);

  return {
    ok: true,
    value: {
      prompt,
      size: body.size,
      variantCount,
      catalog,
      provider: { id: p.id as AiProviderId, model, baseUrl, apiKey },
    },
  };
}
