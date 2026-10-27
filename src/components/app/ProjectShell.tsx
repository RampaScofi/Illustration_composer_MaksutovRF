"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { LibraryComponent, LibraryManifest } from "@/types/library";
import { loadManifest } from "@/lib/library/catalog";
import {
  activateProject,
  addProject,
  closeProject,
  createInitialState,
  renameProject,
  type ProjectsState,
} from "@/lib/composition/projects";
import {
  AI_SETTINGS_STORAGE_KEY,
  loadAiSettings,
  saveAiSettings,
  type KeyValueStorage,
} from "@/lib/ai/settings";
import type { AiSettings } from "@/lib/ai/types";
import { AppHeader } from "@/components/app/AppHeader";
import { ProjectTabs } from "@/components/app/ProjectTabs";
import { Workbench, type WorkbenchLibrary } from "@/components/app/Workbench";
import { AiSettingsPanel } from "@/components/ai/AiSettingsPanel";

const MANIFEST_URL = "/assets/illustrations/manifest.json";

/** Доступ к localStorage может быть запрещён настройками браузера. */
function browserStorage(): KeyValueStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Сырое значение настроек ИИ; строка сравнивается по значению, поэтому лишних перерисовок нет. */
function readStoredAiRaw(): string {
  try {
    return browserStorage()?.getItem(AI_SETTINGS_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Подписка не нужна: изменения из интерфейса попадают в aiOverride, а не в хранилище. */
function subscribeNoop(): () => void {
  return () => undefined;
}

/**
 * Общая оболочка: библиотека и настройки ИИ едины для всех проектов,
 * состояние композиции хранится в каждом проекте отдельно.
 * Неактивные проекты остаются смонтированными (скрыты), чтобы не терять холст.
 */
export function ProjectShell() {
  const [manifest, setManifest] = useState<LibraryManifest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [svgContents, setSvgContents] = useState<Map<string, string>>(new Map());
  const [projects, setProjects] = useState<ProjectsState>(() => createInitialState("p1"));
  // Настройки, введённые в этой сессии: сохраняются в памяти, даже если localStorage недоступен.
  const [aiOverride, setAiOverride] = useState<AiSettings | null>(null);
  const [aiSaveFailed, setAiSaveFailed] = useState(false);
  // Есть ли в проекте размещённые объекты: нужно для предупреждения при закрытии.
  const [filled, setFilled] = useState<Record<string, boolean>>({});
  const seqRef = useRef(1);

  // Сохранённые настройки читаются из localStorage без setState в эффекте.
  // На сервере и при гидрации используется пустое значение, поэтому разметка совпадает.
  const storedRaw = useSyncExternalStore(subscribeNoop, readStoredAiRaw, () => "");
  const stored = useMemo(
    () => loadAiSettings({ getItem: () => storedRaw, setItem: () => undefined }),
    [storedRaw],
  );
  const ai = aiOverride ?? stored;

  useEffect(() => {
    loadManifest(MANIFEST_URL)
      .then((m) => setManifest(m))
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  useEffect(() => {
    if (!manifest) return;
    const paths = manifest.components.map((c) => [c.id, c.svgPath] as const);
    let cancelled = false;
    Promise.all(
      paths.map(async ([id, path]) => {
        try {
          const res = await fetch(path);
          return [id, res.ok ? await res.text() : ""] as [string, string];
        } catch {
          return [id, ""] as [string, string];
        }
      }),
    ).then((entries) => {
      if (!cancelled) setSvgContents(new Map(entries.filter(([, svg]) => svg)));
    });
    return () => {
      cancelled = true;
    };
  }, [manifest]);

  const components = useMemo<LibraryComponent[]>(
    () => manifest?.components ?? [],
    [manifest],
  );
  const library = useMemo<WorkbenchLibrary>(
    () => ({ components, svgContents }),
    [components, svgContents],
  );

  const updateAi = useCallback((next: AiSettings) => {
    setAiOverride(next);
    setAiSaveFailed(!saveAiSettings(browserStorage(), next));
  }, []);

  const onContentChange = useCallback((id: string, hasContent: boolean) => {
    setFilled((prev) => (prev[id] === hasContent ? prev : { ...prev, [id]: hasContent }));
  }, []);

  const addTab = useCallback(() => {
    seqRef.current += 1;
    setProjects((prev) => addProject(prev, `p${seqRef.current}`));
  }, []);

  const renameTab = useCallback((id: string, name: string) => {
    setProjects((prev) => renameProject(prev, id, name));
  }, []);

  const activateTab = useCallback((id: string) => {
    setProjects((prev) => activateProject(prev, id));
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      const project = projects.projects.find((p) => p.id === id);
      if (!project) return;
      if (
        filled[id] &&
        !window.confirm(`Закрыть проект «${project.name}»? Несохранённая композиция будет потеряна.`)
      ) {
        return;
      }
      setProjects((prev) => closeProject(prev, id, prev.activeId));
      setFilled((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [projects, filled],
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-white">
      <AppHeader stageLabel="Этап 4 — композиция" />

      {loadError ? (
        <div className="m-4 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Не удалось загрузить манифест библиотеки: {loadError}
        </div>
      ) : null}

      <ProjectTabs
        projects={projects.projects}
        activeId={projects.activeId}
        onActivate={activateTab}
        onAdd={addTab}
        onRename={renameTab}
        onClose={closeTab}
      />

      <details className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-sm">
        <summary className="cursor-pointer select-none text-xs font-medium text-zinc-600">
          Подключение нейросети
        </summary>
        <div className="mt-3 pb-2">
          <AiSettingsPanel settings={ai} onChange={updateAi} />
        </div>
        {aiSaveFailed ? (
          <p className="pb-2 text-xs text-red-600">
            Настройки не сохранены: хранилище браузера недоступно.
          </p>
        ) : null}
      </details>

      {projects.projects.map((project) => (
        <div
          key={project.id}
          className={
            project.id === projects.activeId ? "flex min-h-0 flex-1 flex-col" : "hidden"
          }
        >
          <Workbench
            projectId={project.id}
            library={library}
            ready={manifest !== null}
            ai={ai}
            onAiChange={updateAi}
            onContentChange={onContentChange}
          />
        </div>
      ))}
    </div>
  );
}
