import type { AiComposeRequest, AiVariantPlan } from "./types.ts";

/**
 * Клиентская часть адаптера: отправляет запрос на собственный route handler
 * и проверяет форму ответа. Сам провайдер из браузера не вызывается.
 */

export const AI_COMPOSE_ENDPOINT = "/api/ai/compose";

export type AiClientResult =
  | { ok: true; variants: AiVariantPlan[] }
  | { ok: false; error: string };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function isVariantList(value: unknown): value is AiVariantPlan[] {
  if (!Array.isArray(value)) return false;
  return value.every((item) => {
    if (typeof item !== "object" || item === null) return false;
    const r = item as Record<string, unknown>;
    return (
      typeof r.title === "string" &&
      typeof r.reason === "string" &&
      Array.isArray(r.primaryIds) &&
      r.primaryIds.every((id) => typeof id === "string") &&
      (r.backgroundId === null || typeof r.backgroundId === "string")
    );
  });
}

function errorFromPayload(payload: unknown, status: number): string {
  if (typeof payload === "object" && payload !== null) {
    const message = (payload as Record<string, unknown>).error;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return `ошибка ${status}`;
}

/** Запрашивает варианты компоновки. Ошибки возвращаются как результат, а не исключения. */
export async function requestAiVariants(
  request: AiComposeRequest,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
): Promise<AiClientResult> {
  let response: Response;
  try {
    response = await fetchImpl(AI_COMPOSE_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "нет связи с сервером" };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return { ok: false, error: errorFromPayload(payload, response.status) };
  }

  const variants =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>).variants
      : undefined;
  if (!isVariantList(variants)) {
    return { ok: false, error: "ответ сервера в неожиданном формате" };
  }
  return { ok: true, variants };
}
