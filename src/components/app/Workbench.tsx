"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { CanvasFormatId, CompositionElement } from "@/types/composition";
import type { ComponentSize, LibraryComponent, LibraryManifest } from "@/types/library";
import { CANVAS_FORMATS, resolveCanvasSize } from "@/lib/composition/canvas";
import { loadManifest } from "@/lib/library/catalog";
import { AppHeader } from "@/components/app/AppHeader";
import { LibraryPanel } from "@/components/library/LibraryPanel";
import { WorkSurface } from "@/components/canvas/WorkSurface";
import { LayersPanel } from "@/components/layers/LayersPanel";
import { SettingsPanel } from "@/components/settings/SettingsPanel";

const MANIFEST_URL = "/assets/illustrations/manifest.json";
const CANVAS_BG = "#ffffff";

export function Workbench() {
  const [manifest, setManifest] = useState<LibraryManifest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [svgContents, setSvgContents] = useState<Map<string, string>>(new Map());
  const [activeSize, setActiveSize] = useState<ComponentSize>("L");
  const [activeFormat, setActiveFormat] = useState<CanvasFormatId>("16:9");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [elements, setElements] = useState<CompositionElement[]>([]);

  const nextIdRef = useRef(1);

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

  const components = useMemo(() => manifest?.components ?? [], [manifest]);
  const componentMap = useMemo(
    () => new Map<string, LibraryComponent>(components.map((c) => [c.id, c])),
    [components],
  );

  const canvasSize = useMemo(() => resolveCanvasSize(activeFormat), [activeFormat]);

  const addComponent = useCallback(
    (componentId: string) => {
      const comp = componentMap.get(componentId);
      if (!comp) return;
      const instanceId = `i${nextIdRef.current++}`;
      const w = Math.min(comp.intrinsicSize.width, 300);
      const h = Math.min(comp.intrinsicSize.height, 300);
      setElements((prev) => {
        const maxZ = prev.reduce((m, e) => Math.max(m, e.z), 0);
        return [
          ...prev,
          {
            instanceId,
            componentId,
            position: {
              x: canvasSize.width / 2 - w / 2,
              y: canvasSize.height / 2 - h / 2,
            },
            size: { width: w, height: h },
            rotation: 0,
            z: maxZ + 1,
            visible: true,
          },
        ];
      });
      setSelectedId(instanceId);
    },
    [componentMap, canvasSize],
  );

  const moveElement = useCallback((id: string, x: number, y: number) => {
    setElements((prev) =>
      prev.map((e) => (e.instanceId === id ? { ...e, position: { x, y } } : e)),
    );
  }, []);

  const resizeElement = useCallback((id: string, w: number, h: number) => {
    setElements((prev) =>
      prev.map((e) => (e.instanceId === id ? { ...e, size: { width: w, height: h } } : e)),
    );
  }, []);

  const rotateElement = useCallback((id: string, rotation: number) => {
    setElements((prev) => prev.map((e) => (e.instanceId === id ? { ...e, rotation } : e)));
  }, []);

  const duplicateElement = useCallback((id: string) => {
    const newId = `i${nextIdRef.current++}`;
    setElements((prev) => {
      const src = prev.find((e) => e.instanceId === id);
      if (!src) return prev;
      const maxZ = prev.reduce((m, e) => Math.max(m, e.z), 0);
      return [
        ...prev,
        {
          ...src,
          instanceId: newId,
          position: { x: src.position.x + 20, y: src.position.y + 20 },
          z: maxZ + 1,
        },
      ];
    });
    setSelectedId(newId);
  }, []);

  const removeElement = useCallback((id: string) => {
    setElements((prev) => prev.filter((e) => e.instanceId !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  }, []);

  const swapZ = useCallback((id: string, direction: "up" | "down") => {
    setElements((prev) => {
      const sorted = [...prev].sort((a, b) => a.z - b.z);
      const idx = sorted.findIndex((e) => e.instanceId === id);
      const target = direction === "up" ? idx + 1 : idx - 1;
      if (idx < 0 || target < 0 || target >= sorted.length) return prev;
      const tmp = sorted[idx].z;
      sorted[idx].z = sorted[target].z;
      sorted[target].z = tmp;
      return sorted;
    });
  }, []);

  const bringToFront = useCallback((id: string) => {
    setElements((prev) => {
      const maxZ = prev.reduce((m, e) => Math.max(m, e.z), 0);
      return prev.map((e) => (e.instanceId === id ? { ...e, z: maxZ + 1 } : e));
    });
  }, []);

  const sendToBack = useCallback((id: string) => {
    setElements((prev) => {
      const minZ = prev.reduce((m, e) => Math.min(m, e.z), Infinity);
      return prev.map((e) => (e.instanceId === id ? { ...e, z: minZ - 1 } : e));
    });
  }, []);

  const toggleVisibility = useCallback((id: string) => {
    setElements((prev) =>
      prev.map((e) => (e.instanceId === id ? { ...e, visible: !e.visible } : e)),
    );
  }, []);

  const exportSvg = useCallback(async () => {
    const { buildCompositionSvg } = await import("@/lib/composition/exportSvg");
    const svg = buildCompositionSvg(
      {
        id: "export",
        title: "Экспорт",
        format: activeFormat,
        componentSize: activeSize,
        colorSchemeId: null,
        elements,
      },
      componentMap,
      svgContents,
      canvasSize,
    );
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vectormuse-composition.svg";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [activeFormat, activeSize, elements, componentMap, svgContents, canvasSize]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <AppHeader stageLabel="Этап 2 — редактор" />

      {loadError ? (
        <div className="m-4 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Не удалось загрузить манифест библиотеки: {loadError}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
        <div className="order-2 flex min-h-0 flex-col border-t border-zinc-200 lg:order-none lg:border-t-0">
          {manifest ? (
            <LibraryPanel
              components={components}
              activeSize={activeSize}
              onSizeChange={setActiveSize}
              onAddComponent={addComponent}
            />
          ) : (
            <div className="p-4 text-xs text-zinc-400">Загрузка библиотеки…</div>
          )}
        </div>

        <main className="order-1 flex min-h-[55vh] flex-col lg:order-none lg:min-h-0">
          <WorkSurface
            canvasSize={canvasSize}
            elements={elements}
            components={componentMap}
            svgContents={svgContents}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMove={moveElement}
            onResize={resizeElement}
            onRotate={rotateElement}
            background={CANVAS_BG}
          />
        </main>

        <div className="order-3 flex min-h-0 flex-col">
          <SettingsPanel
            formats={CANVAS_FORMATS}
            activeFormat={activeFormat}
            activeSize={activeSize}
            schemeCount={manifest?.schemes.length ?? 0}
            onSelectFormat={setActiveFormat}
          />
          <div className="min-h-0 flex-1 border-t border-zinc-200">
            <LayersPanel
              elements={elements}
              components={componentMap}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onSwapUp={(id) => swapZ(id, "up")}
              onSwapDown={(id) => swapZ(id, "down")}
              onBringToFront={bringToFront}
              onSendToBack={sendToBack}
              onToggleVisibility={toggleVisibility}
              onDuplicate={duplicateElement}
              onRemove={removeElement}
            />
          </div>
          <div className="border-t border-zinc-200 bg-white px-3 py-2">
            <button
              type="button"
              onClick={exportSvg}
              disabled={elements.length === 0}
              className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
            >
              Скачать SVG
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
