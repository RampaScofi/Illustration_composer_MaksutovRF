"use client";

import { useRef, useState } from "react";
import { MAX_PROJECTS, type Project } from "@/lib/composition/projects";

type Props = {
  projects: readonly Project[];
  activeId: string;
  onActivate: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onClose: (id: string) => void;
};

/**
 * Полоса вкладок проектов в стиле браузера. Двойной клик по вкладке — переименование,
 * Enter или уход фокуса сохраняют имя, Escape отменяет изменение.
 */
export function ProjectTabs({
  projects,
  activeId,
  onActivate,
  onAdd,
  onRename,
  onClose,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  // Редактирование уже завершено (Enter/Escape): последующий blur не должен сохранить имя.
  const doneRef = useRef(true);

  const startEdit = (project: Project) => {
    doneRef.current = false;
    setDraft(project.name);
    setEditingId(project.id);
  };

  const finishEdit = (id: string, save: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    setEditingId(null);
    if (save) onRename(id, draft);
  };

  const canAdd = projects.length < MAX_PROJECTS;
  const canClose = projects.length > 1;

  return (
    <div
      role="tablist"
      aria-label="Проекты"
      className="flex items-end gap-1 overflow-x-auto border-b border-zinc-200 bg-zinc-100 px-2 pt-2"
    >
      {projects.map((project) => {
        const active = project.id === activeId;
        const editing = editingId === project.id;
        return (
          <div
            key={project.id}
            className={`group flex min-w-0 max-w-[220px] items-center gap-1 rounded-t-md border border-b-0 px-3 py-1.5 text-sm ${
              active
                ? "border-zinc-200 bg-white text-zinc-900"
                : "border-transparent bg-zinc-200/60 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            {editing ? (
              <input
                autoFocus
                value={draft}
                maxLength={60}
                aria-label="Имя проекта"
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => finishEdit(project.id, true)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    finishEdit(project.id, true);
                  } else if (event.key === "Escape") {
                    finishEdit(project.id, false);
                  }
                }}
                className="w-32 rounded border border-indigo-300 bg-white px-1 py-0.5 text-sm focus:outline-none"
              />
            ) : (
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onActivate(project.id)}
                onDoubleClick={() => startEdit(project)}
                title="Двойной щелчок — переименовать"
                className="min-w-0 truncate text-left"
              >
                {project.name}
              </button>
            )}

            {canClose && !editing ? (
              <button
                type="button"
                onClick={() => onClose(project.id)}
                aria-label={`Закрыть проект ${project.name}`}
                className={`shrink-0 rounded px-1 text-base leading-none text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-800 ${
                  active ? "" : "opacity-60 group-hover:opacity-100"
                }`}
              >
                ×
              </button>
            ) : null}
          </div>
        );
      })}

      <button
        type="button"
        onClick={onAdd}
        disabled={!canAdd}
        aria-label="Новый проект"
        title={canAdd ? "Новый проект" : `Не больше ${MAX_PROJECTS} проектов`}
        className="mb-0.5 ml-1 shrink-0 rounded px-2 py-1 text-lg leading-none text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-300"
      >
        +
      </button>
    </div>
  );
}
