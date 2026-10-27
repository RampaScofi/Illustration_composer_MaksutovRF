"use client";

import type { FormEvent } from "react";

export type ComposeItem = { name: string; reason: string };

export type ComposeStatus =
  | { kind: "idle" }
  | { kind: "loading"; message: string }
  | { kind: "empty"; message: string }
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      message: string;
      items: ComposeItem[];
      /** Почему ИИ-вариант не использован (например, фолбэк на локальный подбор). */
      notice?: string;
      /** Заголовки вариантов ИИ; если заданы, выводится переключатель. */
      variants?: string[];
      activeVariant?: number;
    };

export type ComposeAiControl = {
  enabled: boolean;
  /** Причина, по которой ИИ сейчас не может работать; null — всё готово. */
  blockReason: string | null;
  onToggle: () => void;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  examples: readonly string[];
  status: ComposeStatus;
  disabled?: boolean;
  ai: ComposeAiControl;
  onSelectVariant?: (index: number) => void;
};

/**
 * Панель композиции: описание иллюстрации, переключатель ИИ-компоновки,
 * примеры запросов, варианты и отчёт о выборе объектов.
 */
export function ComposePanel({
  value,
  onChange,
  onSubmit,
  examples,
  status,
  disabled = false,
  ai,
  onSelectVariant,
}: Props) {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border-b border-zinc-200 bg-white px-4 py-3"
      aria-label="Автоматическая композиция"
    >
      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor="compose-prompt"
          className="text-xs font-semibold uppercase tracking-wide text-zinc-500"
        >
          Опишите иллюстрацию
        </label>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-500">
            {ai.enabled
              ? ai.blockReason === null
                ? "ИИ-компоновка"
                : "ИИ: не настроено"
              : "Локальный подбор"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={ai.enabled}
            aria-label="Использовать ИИ-компоновку"
            onClick={ai.onToggle}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
              ai.enabled ? "bg-indigo-600" : "bg-zinc-300"
            }`}
          >
            <span
              aria-hidden
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                ai.enabled ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
        <textarea
          id="compose-prompt"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={2}
          placeholder="Например: идеи превращаются в результат"
          className="min-h-[42px] w-full resize-y rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-indigo-400 focus:bg-white focus:outline-none"
        />
        <button
          type="submit"
          disabled={disabled || status.kind === "loading" || value.trim().length === 0}
          className="shrink-0 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
        >
          {status.kind === "loading" ? "Подбираю…" : "Создать композицию"}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {examples.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onChange(example)}
            className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] text-zinc-600 transition hover:border-indigo-300 hover:text-indigo-700"
          >
            {example}
          </button>
        ))}
      </div>

      {status.kind !== "idle" ? (
        <div className="mt-2 text-xs leading-5">
          {status.kind === "ok" ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
              {status.variants && status.variants.length > 1 && onSelectVariant ? (
                <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Варианты">
                  {status.variants.map((title, index) => (
                    <button
                      key={`${index}-${title}`}
                      type="button"
                      onClick={() => onSelectVariant(index)}
                      aria-pressed={status.activeVariant === index}
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                        status.activeVariant === index
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100"
                      }`}
                    >
                      {title}
                    </button>
                  ))}
                </div>
              ) : null}
              <p className="font-medium">{status.message}</p>
              <ul className="mt-1 space-y-0.5 text-emerald-700">
                {status.items.map((item, index) => (
                  <li key={`${index}-${item.name}`}>
                    <span className="font-medium">{item.name}</span>
                    {item.reason ? ` — ${item.reason}` : ""}
                  </li>
                ))}
              </ul>
              {status.notice ? <p className="mt-1 text-amber-700">{status.notice}</p> : null}
            </div>
          ) : status.kind === "loading" ? (
            <p className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-indigo-800">
              {status.message}
            </p>
          ) : (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
              {status.message}
            </p>
          )}
        </div>
      ) : null}
    </form>
  );
}
