"use client";

import { useState } from "react";
import type { CanvasFormatId, Composition } from "@/types/composition";
import type { ComponentSize } from "@/types/library";
import { CANVAS_FORMATS, findCanvasFormat } from "@/lib/composition/canvas";
import { readLibrarySnapshot } from "@/lib/library/librarySource";
import { AppHeader } from "@/components/app/AppHeader";
import { LibraryPanel } from "@/components/library/LibraryPanel";
import { WorkSurface } from "@/components/canvas/WorkSurface";
import { SettingsPanel } from "@/components/settings/SettingsPanel";

/**
 * Каркас рабочей среды: библиотека слева, холст по центру, настройки справа.
 *
 * Здесь живёт только состояние выбора (размерный набор и формат холста).
 * Размещение, трансформации и сборка композиции подключаются на следующем этапе,
 * когда появится реальный манифест библиотеки из Figma.
 */
export function Workbench() {
  const [activeSize, setActiveSize] = useState<ComponentSize>("L");
  const [activeFormatId, setActiveFormatId] = useState<CanvasFormatId>("16:9");

  const library = readLibrarySnapshot();
  const composition: Composition = {
    id: "draft",
    title: "Черновик",
    format: activeFormatId,
    componentSize: activeSize,
    colorSchemeId: null,
    elements: [],
  };

  const format = findCanvasFormat(composition.format) ?? CANVAS_FORMATS[0];

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <AppHeader stageLabel="Этап 1 — архитектурный каркас" />

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)_minmax(0,300px)]">
        <div className="order-2 flex min-h-0 flex-col border-t border-zinc-200 lg:order-none lg:border-t-0">
          <LibraryPanel
            components={library.components}
            activeSize={activeSize}
            notice={library.notice}
          />
          <div className="flex gap-1 border-t border-zinc-200 bg-white p-2">
            {(["L", "S"] as const).map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setActiveSize(size)}
                aria-pressed={activeSize === size}
                className={`rounded px-3 py-1 text-xs font-medium ${
                  activeSize === size
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                }`}
              >
                Набор {size}
              </button>
            ))}
          </div>
        </div>

        <main className="order-1 flex min-h-[60vh] flex-col lg:order-none lg:min-h-0">
          <WorkSurface format={format} elements={composition.elements} />
        </main>

        <div className="order-3 flex min-h-0 flex-col">
          <SettingsPanel
            formats={CANVAS_FORMATS}
            activeFormat={composition.format}
            activeSize={composition.componentSize}
            schemeCount={library.schemes.length}
            onSelectFormat={setActiveFormatId}
          />
          <div className="border-t border-zinc-200 bg-white px-4 py-3">
            <button
              type="button"
              disabled
              className="w-full rounded-md bg-zinc-200 px-3 py-2 text-sm font-medium text-zinc-500"
              title="Экспорт станет доступен после подключения библиотеки"
            >
              Экспорт SVG (недоступен на этапе 1)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
