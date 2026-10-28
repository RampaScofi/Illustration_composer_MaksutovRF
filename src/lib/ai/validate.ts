import type { AiCatalogEntry, AiVariantPlan } from "./types.ts";
import { MAX_PRIMARY, MAX_REASON, MAX_TITLE } from "./contract.ts";

/**
 * Проверка ответа модели. Модель считается ненадёжным источником:
 * неизвестные id, роли, дубли категорий и лишний текст отбрасываются.
 * Вариант, который не прошёл проверку, в результат не попадает.
 */

export type ValidationResult = {
  variants: AiVariantPlan[];
  /** Сколько вариантов отброшено. Нужно для честного отчёта пользователю. */
  rejected: number;
};

/** Снимает Markdown-ограждения, если модель всё же их добавила. */
function stripFence(raw: string): string {
  const trimmed = raw.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return match ? match[1] : trimmed;
}

function asString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

/**
 * Разбирает текст ответа и оставляет только корректные варианты.
 * Если JSON не читается или нет массива variants, возвращается пустой результат
 * и rejected = 0, а вызывающий код переходит на локальный подбор.
 */
export function validateAiResponse(
  raw: string,
  catalog: readonly AiCatalogEntry[],
  expectedCount: number,
): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFence(raw));
  } catch {
    return { variants: [], rejected: 0 };
  }

  if (typeof parsed !== "object" || parsed === null || !("variants" in parsed)) {
    return { variants: [], rejected: 0 };
  }
  const list = (parsed as { variants: unknown }).variants;
  if (!Array.isArray(list)) return { variants: [], rejected: 0 };

  const byId = new Map(catalog.map((entry) => [entry.id, entry] as const));
  const variants: AiVariantPlan[] = [];
  const seenKeys = new Set<string>();
  let rejected = 0;

  for (const item of list.slice(0, expectedCount)) {
    const plan = checkVariant(item, byId);
    if (!plan) {
      rejected += 1;
      continue;
    }
    // Одинаковые наборы объектов не дают разных вариантов.
    const key = [...plan.primaryIds].sort().join("|") + "#" + (plan.backgroundId ?? "");
    if (seenKeys.has(key)) {
      rejected += 1;
      continue;
    }
    seenKeys.add(key);
    variants.push(plan);
  }

  // Варианты сверх запрошенного количества не учитываются, но и не считаются отказом.
  return { variants, rejected };
}

function checkVariant(
  item: unknown,
  byId: Map<string, AiCatalogEntry>,
): AiVariantPlan | null {
  if (typeof item !== "object" || item === null) return null;
  const record = item as Record<string, unknown>;

  const title = asString(record.title, MAX_TITLE);
  const reason = asString(record.reason, MAX_REASON) ?? "";
  if (!title) return null;

  if (!Array.isArray(record.primary)) return null;
  const primaryIds = record.primary;
  if (primaryIds.length === 0 || primaryIds.length > MAX_PRIMARY) return null;

  const categories = new Set<string>();
  const unique = new Set<string>();

  for (const id of primaryIds) {
    if (typeof id !== "string") return null;
    const entry = byId.get(id);
    if (!entry || entry.role !== "primary") return null;
    if (categories.has(entry.category)) return null;
    categories.add(entry.category);
    unique.add(id);
  }
  if (unique.size !== primaryIds.length) return null;

  let backgroundId: string | null = null;
  if (record.background !== null && record.background !== undefined) {
    if (typeof record.background !== "string") return null;
    const bg = byId.get(record.background);
    if (!bg || bg.role !== "background") return null;
    // Подложка не может быть тем же предметом, что и объект переднего плана.
    if (categories.has(bg.category)) return null;
    backgroundId = bg.id;
  }

  return { title, reason, primaryIds: [...unique], backgroundId };
}
