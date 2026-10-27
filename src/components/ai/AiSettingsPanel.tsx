"use client";

import { AI_PROVIDERS, findProvider } from "@/lib/ai/providers";
import { aiBlockReason } from "@/lib/ai/settings";
import type { AiProviderId, AiSettings } from "@/lib/ai/types";

type Props = {
  settings: AiSettings;
  onChange: (next: AiSettings) => void;
};

const INPUT_CLASS =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none";

/**
 * Подключение нейросети: провайдер, модель, адрес endpoint и ключ.
 * Переключатель ИИ-компоновки находится в панели композиции.
 * Панель только отображает значения и передаёт изменения наверх; сохранение — в оболочке.
 */
export function AiSettingsPanel({ settings, onChange }: Props) {
  const provider = findProvider(settings.providerId);
  const blockReason = aiBlockReason(settings);
  const update = (patch: Partial<AiSettings>) => onChange({ ...settings, ...patch });

  return (
    <section aria-label="Настройки ИИ" className="space-y-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-medium text-zinc-600">Провайдер</span>
          <select
            value={settings.providerId}
            onChange={(event) => update({ providerId: event.target.value as AiProviderId })}
            className={INPUT_CLASS}
          >
            {AI_PROVIDERS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-zinc-600">Модель</span>
          <input
            type="text"
            value={settings.model}
            onChange={(event) => update({ model: event.target.value })}
            placeholder={provider?.modelHint}
            autoComplete="off"
            spellCheck={false}
            className={INPUT_CLASS}
          />
        </label>
      </div>

      {provider?.baseUrlEditable ? (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-zinc-600">Адрес endpoint</span>
          <input
            type="url"
            value={settings.baseUrl}
            onChange={(event) => update({ baseUrl: event.target.value })}
            placeholder="https://example.com/v1"
            autoComplete="off"
            spellCheck={false}
            className={INPUT_CLASS}
          />
        </label>
      ) : null}

      <label className="block space-y-1">
        <span className="text-xs font-medium text-zinc-600">API-ключ</span>
        <input
          type="password"
          value={settings.apiKey}
          onChange={(event) => update({ apiKey: event.target.value })}
          placeholder="Вставьте ключ провайдера"
          autoComplete="off"
          spellCheck={false}
          className={INPUT_CLASS}
        />
      </label>

      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
        Ключ сохраняется в localStorage этого браузера и передаётся на сервер приложения только
        для запроса. Не используйте на чужих компьютерах. Любой скрипт на этой странице может его
        прочитать. Модель вводите точно как в кабинете провайдера: список моделей приложение не
        загружает.
      </p>

      <p className="text-xs text-zinc-500">
        {blockReason === null
          ? "Готово: запрос будет отправлен при создании композиции."
          : `Не готово: ${blockReason}. Будет использован локальный подбор.`}
      </p>
    </section>
  );
}
