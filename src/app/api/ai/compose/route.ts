import { buildChatTarget, extractText, isAllowedBaseUrl } from "@/lib/ai/providers";
import { SYSTEM_PROMPT, buildUserMessage } from "@/lib/ai/contract";
import { parseComposeBody } from "@/lib/ai/request";
import { validateAiResponse } from "@/lib/ai/validate";

/**
 * Серверный адаптер между интерфейсом и нейросетью.
 * Браузер не обращается к провайдеру напрямую (CORS и защита ключа).
 * Ключ берётся из тела запроса, не сохраняется и не попадает в ответ или лог.
 */

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 512 * 1024;

function errorResponse(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

export async function POST(request: Request): Promise<Response> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return errorResponse(413, "Запрос слишком большой.");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return errorResponse(400, "Тело запроса должно быть JSON.");
  }

  const parsed = parseComposeBody(raw);
  if (!parsed.ok) return errorResponse(400, parsed.error);
  const input = parsed.value;

  if (input.provider.id === "custom" && !isAllowedBaseUrl(input.provider.baseUrl)) {
    return errorResponse(
      400,
      "Адрес endpoint должен быть https:// или http:// для localhost.",
    );
  }

  const target = buildChatTarget(
    {
      providerId: input.provider.id,
      model: input.provider.model,
      baseUrl: input.provider.baseUrl,
      apiKey: input.provider.apiKey,
    },
    SYSTEM_PROMPT,
    buildUserMessage(input),
  );
  if (!target) return errorResponse(400, "Не удалось сформировать запрос к провайдеру.");

  let upstream: Response;
  try {
    upstream = await fetch(target.url, {
      method: "POST",
      headers: target.headers,
      body: JSON.stringify(target.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    // Текст сетевой ошибки может содержать адрес, поэтому наружу отдаётся общий ответ.
    return errorResponse(502, "Провайдер недоступен или не ответил вовремя.");
  }

  if (!upstream.ok) {
    // Статус провайдера не содержит секретов, но тело ответа не пробрасываем.
    if (upstream.status === 429) {
      return errorResponse(
        429,
        "Превышен лимит запросов провайдера. Попробуйте позже или проверьте квоту.",
      );
    }
    if (upstream.status === 401 || upstream.status === 403) {
      return errorResponse(
        502,
        `Провайдер отклонил доступ (${upstream.status}). Проверьте ключ и права доступа.`,
      );
    }
    return errorResponse(
      502,
      `Провайдер вернул ошибку ${upstream.status}. Проверьте ключ, модель и доступ.`,
    );
  }

  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return errorResponse(502, "Провайдер вернул ответ в неожиданном формате.");
  }

  const content = extractText(input.provider.id, payload);
  if (content === null) {
    return errorResponse(502, "Провайдер вернул ответ в неожиданном формате.");
  }

  const result = validateAiResponse(content, input.catalog, input.variantCount);
  if (result.variants.length === 0) {
    return errorResponse(422, "Модель не вернула ни одного корректного варианта.");
  }

  return Response.json({ variants: result.variants, rejected: result.rejected });
}
