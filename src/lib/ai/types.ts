/** Идентификаторы поддерживаемых провайдеров. */
export type AiProviderId = "openai" | "anthropic" | "groq" | "custom";

/**
 * Настройки ИИ-подключения. Хранятся только в localStorage браузера пользователя
 * и никогда не попадают в репозиторий или серверные логи.
 */
export type AiSettings = {
  enabled: boolean;
  providerId: AiProviderId;
  model: string;
  /** Адрес endpoint. Учитывается только провайдером "custom". */
  baseUrl: string;
  apiKey: string;
};

/** Запись каталога, которую получает модель. Без путей к файлам и координат. */
export type AiCatalogEntry = {
  id: string;
  name: string;
  aliases: string[];
  tags: string[];
  role: "primary" | "background";
  /** Категория (исходная иллюстрация): не повторяется внутри варианта. */
  category: string;
  /** Необязательные метаданные компоновки: передаются модели только если заданы. */
  visualWeight?: "light" | "medium" | "heavy";
  groupTags?: string[];
  compositionHints?: string[];
  /** id, с которыми нельзя сочетать объект. Конфликт проверяется приложением. */
  avoidWith?: string[];
};

/** Запрос от клиента к серверному route handler. */
export type AiComposeRequest = {
  prompt: string;
  size: "L" | "S";
  variantCount: number;
  catalog: AiCatalogEntry[];
  provider: {
    id: AiProviderId;
    model: string;
    baseUrl: string;
    apiKey: string;
  };
};

/** Проверенный вариант компоновки: только выбор объектов, без геометрии. */
export type AiVariantPlan = {
  title: string;
  reason: string;
  primaryIds: string[];
  backgroundId: string | null;
};
