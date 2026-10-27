"use client";

import { useState, useMemo } from "react";
import type { LibraryComponent, ComponentSize } from "@/types/library";
import { normalizeText } from "@/lib/semantic/normalize";
import { EmptyState, PanelFrame } from "@/components/panel/PanelFrame";

type Props = {
  components: LibraryComponent[];
  activeSize: ComponentSize;
  onSizeChange: (size: ComponentSize) => void;
  onAddComponent: (componentId: string) => void;
};

type RoleFilter = "all" | "primary" | "background";

export function LibraryPanel({ components, activeSize, onSizeChange, onAddComponent }: Props) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  const filtered = useMemo(() => {
    let result = components.filter((c) => c.size === activeSize && c.role !== "backdrop");
    if (roleFilter !== "all") result = result.filter((c) => c.role === roleFilter);
    if (query.trim()) {
      // Нормализация: регистр, «ё» → «е», пунктуация.
      const q = normalizeText(query);
      result = result.filter(
        (c) =>
          normalizeText(c.name).includes(q) ||
          c.aliases.some((a) => normalizeText(a).includes(q)) ||
          c.tags.some((t) => normalizeText(t).includes(q)),
      );
    }
    return result;
  }, [components, activeSize, roleFilter, query]);

  return (
    <PanelFrame title="Библиотека" hint="Нажмите на компонент, чтобы добавить на холст">
      <div className="space-y-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по названию, тегу…"
          className="w-full rounded border border-zinc-300 bg-zinc-50 px-2.5 py-1.5 text-sm placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none"
          aria-label="Поиск компонентов"
        />
        <div className="flex gap-1">
          {(["all", "primary", "background"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRoleFilter(r)}
              className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                roleFilter === r
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {r === "all" ? "Все" : r === "primary" ? "Объекты" : "Фон"}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(["L", "S"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSizeChange(s)}
              className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                activeSize === s
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            message={
              components.length === 0
                ? "Библиотека не подключена."
                : "Ничего не найдено по запросу."
            }
          />
        </div>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {filtered.map((comp) => (
            <li key={comp.id}>
              <button
                type="button"
                onClick={() => onAddComponent(comp.id)}
                className="group flex w-full flex-col items-center gap-1 rounded-lg border border-zinc-200 bg-white p-2 text-center transition hover:border-indigo-300 hover:shadow-sm"
                title={comp.nameConfirmed ? comp.name : `Имя не подтверждено: ${comp.name}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={comp.svgPath}
                  alt={comp.nameConfirmed ? comp.name : comp.id}
                  className="h-12 w-full object-contain"
                  draggable={false}
                />
                <span className="truncate text-[10px] leading-tight text-zinc-600 group-hover:text-indigo-700">
                  {comp.nameConfirmed ? comp.name : "?"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </PanelFrame>
  );
}
