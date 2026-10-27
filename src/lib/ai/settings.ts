import { findProvider, isAllowedBaseUrl } from "./providers.ts";
import type { AiProviderId, AiSettings } from "./types.ts";

/**
 * Настройки ИИ-подключения. Хранятся в localStorage браузера.
 * Ключ попадает в хранилище открыто: шифрования на клиенте нет, поэтому пользователь
 * предупреждён в AiSettingsPanel. Функции здесь только читают и записывают значения.
 */

export const AI_SETTINGS_STORAGE_KEY = "vectormuse.ai-settings";
const MAX_FIELD_LENGTH = 500;

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  providerId: "openai",
  model: "",
  baseUrl: "",
  apiKey: "",
};

export type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_FIELD_LENGTH) : "";
}

/** Приводит сохранённые данные к допустимому виду. Всё неизвестное отбрасывается. */
export function sanitizeAiSettings(raw: unknown): AiSettings {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_AI_SETTINGS };
  const record = raw as Record<string, unknown>;
  const providerId =
    typeof record.providerId === "string" && findProvider(record.providerId)
      ? (record.providerId as AiProviderId)
      : DEFAULT_AI_SETTINGS.providerId;

  return {
    enabled: record.enabled === true,
    providerId,
    model: text(record.model),
    baseUrl: text(record.baseUrl),
    apiKey: text(record.apiKey),
  };
}

export function loadAiSettings(storage: KeyValueStorage | null): AiSettings {
  if (!storage) return { ...DEFAULT_AI_SETTINGS };
  try {
    const raw = storage.getItem(AI_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AI_SETTINGS };
    return sanitizeAiSettings(JSON.parse(raw));
  } catch {
    // Повреждённая запись или запрещённый доступ: работаем с настройками по умолчанию.
    return { ...DEFAULT_AI_SETTINGS };
  }
}

/** Возвращает true, если запись прошла. Ошибка хранилища не должна ломать интерфейс. */
export function saveAiSettings(storage: KeyValueStorage | null, settings: AiSettings): boolean {
  if (!storage) return false;
  try {
    storage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

/**
 * Причина, по которой ИИ-запрос нельзя отправить. null — всё готово.
 * Текст предназначен для пользователя, ключ в нём не отображается.
 */
export function aiBlockReason(settings: AiSettings): string | null {
  const provider = findProvider(settings.providerId);
  if (!provider) return "неизвестный провайдер";
  if (!settings.apiKey) return "не введён API-ключ";
  if (!settings.model) return "не указана модель";
  if (provider.baseUrlEditable && !isAllowedBaseUrl(settings.baseUrl)) {
    return "адрес endpoint должен начинаться с https:// (или http:// для localhost)";
  }
  return null;
}
