"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { CanvasFormatId, CompositionElement } from "@/types/composition";
import type { ComponentSize, LibraryComponent } from "@/types/library";
import {
  CANVAS_FORMATS,
  adaptElementsToCanvas,
  resolveCanvasSize,
} from "@/lib/composition/canvas";
import { buildAutoLayout } from "@/lib/composition/autoLayout";
import { repaintContents, mappingForComponent } from "@/lib/palette/apply";
import {
  CANVAS_BACKGROUNDS,
  COLOR_SCHEMES,
  backdropComponentId,
  backgroundForScheme,
  canvasColor,
} from "@/lib/palette/schemes";
import { explainMatch, matchComponents, selectCompositionPlan } from "@/lib/semantic/matcher";
import { aiBlockReason } from "@/lib/ai/settings";
import { DEFAULT_VARIANT_COUNT, buildAiCatalog } from "@/lib/ai/contract";
import { requestAiVariants } from "@/lib/ai/client";
import { buildVariantLayout } from "@/lib/ai/variants";
import type { AiSettings, AiVariantPlan } from "@/lib/ai/types";
import { ComposePanel, type ComposeStatus } from "@/components/compose/ComposePanel";
import { LibraryPanel } from "@/components/library/LibraryPanel";
import { WorkSurface } from "@/components/canvas/WorkSurface";
import { LayersPanel } from "@/components/layers/LayersPanel";
import { SettingsPanel } from "@/components/settings/SettingsPanel";

/** Данные библиотеки общие для всех проектов; загружает их ProjectShell. */
export type WorkbenchLibrary = {
  components: LibraryComponent[];
  svgContents: Map<string, string>;
};

type WorkbenchProps = {
  projectId: string;
  library: WorkbenchLibrary;
  /** Манифест загружен: без этого нельзя ни подбирать, ни добавлять объекты. */
  ready: boolean;
  ai: AiSettings;
  onAiChange: (next: AiSettings) => void;
  onContentChange: (projectId: string, hasContent: boolean) => void;
};

/** Примеры запросов из задания: один клик заполняет поле. */
const PROMPT_EXAMPLES = [
  "Обучение и саморазвитие",
  "Идеи превращаются в результат",
  "Работа и продуктивность",
  "Творчество и вдохновение",
  "Знания и развитие",
  "Технологии и коммуникация",
] as const;

export function Workbench({
  projectId,
  library,
  ready,
  ai,
  onAiChange,
  onContentChange,
}: WorkbenchProps) {
  const { components, svgContents } = library;
  const [activeSize, setActiveSize] = useState<ComponentSize>("L");
  const [activeFormat, setActiveFormat] = useState<CanvasFormatId>("16:9");
  const [activeScheme, setActiveScheme] = useState<string>(COLOR_SCHEMES[0].id);
  const [activeBackground, setActiveBackground] = useState<string>(CANVAS_BACKGROUNDS[0].id);
  const [prompt, setPrompt] = useState("");
  const [composeStatus, setComposeStatus] = useState<ComposeStatus>({ kind: "idle" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [elements, setElements] = useState<CompositionElement[]>([]);
  // Проверенные варианты ИИ: переключение не требует нового запроса, раскладка пересчитывается.
  const [variantPlans, setVariantPlans] = useState<AiVariantPlan[]>([]);

  const nextIdRef = useRef(1);
  // Номер последнего запроса к ИИ: ответ устаревшего запроса отбрасывается.
  const requestSeqRef = useRef(0);

  useEffect(() => {
    onContentChange(projectId, elements.length > 0);
  }, [projectId, elements.length, onContentChange]);

  const componentMap = useMemo(
    () => new Map<string, LibraryComponent>(components.map((c) => [c.id, c])),
    [components],
  );

  const canvasSize = useMemo(() => resolveCanvasSize(activeFormat), [activeFormat]);

  // Перекрашенная разметка: одна и та же для холста и экспорта.
  const displayContents = useMemo(
    () => repaintContents(svgContents, componentMap, activeScheme),
    [svgContents, componentMap, activeScheme],
  );

  const backgroundColor = useMemo(() => canvasColor(activeBackground), [activeBackground]);

  // Декоративная подложка из библиотеки Figma для выбранного фона и набора.
  const backdropId = useMemo(() => {
    const preferred = backdropComponentId(activeBackground, activeSize);
    if (componentMap.has(preferred)) return preferred;
    const fallback = backdropComponentId(activeBackground, "L");
    return componentMap.has(fallback) ? fallback : null;
  }, [activeBackground, activeSize, componentMap]);

  /** Смена формата: холст меняется, объекты остаются в границах и не деформируются. */
  const selectFormat = useCallback((format: CanvasFormatId) => {
    setActiveFormat((prev) => {
      if (prev === format) return prev;
      const nextSize = resolveCanvasSize(format);
      setElements((current) => adaptElementsToCanvas(current, nextSize));
      return format;
    });
  }, []);

  /** Схема задаёт и цвета объектов, и связанный фон из исходной спецификации. */
  const selectScheme = useCallback((schemeId: string) => {
    setActiveScheme(schemeId);
    setActiveBackground(backgroundForScheme(schemeId).id);
  }, []);

  /** Заменяет композицию. Временные id автолейаута (i1, i2…) переназначаются, чтобы не совпасть с добавленными вручную. */
  const applyLayout = useCallback((layout: CompositionElement[]) => {
    setElements(layout.map((e) => ({ ...e, instanceId: `i${nextIdRef.current++}` })));
    setSelectedId(null);
  }, []);

  /** Локальный подбор без ИИ. notice объясняет, почему использован именно он. */
  const composeLocal = useCallback(
    (query: string, notice?: string) => {
      setVariantPlans([]);
      const result = matchComponents(query, components);
      const plan = selectCompositionPlan(result, { size: activeSize });

      if (!result.hasMatches || plan.items.length === 0) {
        setComposeStatus({
          kind: "empty",
          message:
            "Подходящих объектов в библиотеке не нашлось. Попробуйте другую формулировку — например, «обучение», «идеи», «работа», «технологии».",
        });
        return;
      }

      const layout = buildAutoLayout(
        plan.items.map((item) => ({
          componentId: item.component.id,
          role: item.component.role,
          intrinsic: item.component.intrinsicSize,
          category: item.component.sourceIllustrationId,
        })),
        { canvas: canvasSize },
      );

      if (layout.length === 0) {
        setComposeStatus({
          kind: "error",
          message: "Не удалось разместить объекты на холсте этого формата.",
        });
        return;
      }

      applyLayout(layout);
      setComposeStatus({
        kind: "ok",
        message: `Собрана композиция из ${layout.length} объектов:`,
        items: plan.items.map((item) => ({
          name:
            item.component.role === "background"
              ? `${item.component.name} — подложка`
              : item.component.name,
          reason: explainMatch(item),
        })),
        notice,
      });
    },
    [components, activeSize, canvasSize, applyLayout],
  );

  /**
   * ИИ-подбор: модель выбирает id, раскладку считает приложение.
   * Любой сбой или пустой результат уводит на локальный подбор с объяснением.
   */
  const composeWithAi = useCallback(
    async (query: string) => {
      const seq = ++requestSeqRef.current;
      setComposeStatus({ kind: "loading", message: "Запрашиваю варианты у нейросети…" });

      const result = await requestAiVariants({
        prompt: query,
        size: activeSize,
        variantCount: DEFAULT_VARIANT_COUNT,
        catalog: buildAiCatalog(components, activeSize),
        provider: {
          id: ai.providerId,
          model: ai.model,
          baseUrl: ai.baseUrl,
          apiKey: ai.apiKey,
        },
      });

      // Пока шёл запрос, пользователь мог отправить новый — старый ответ не нужен.
      if (seq !== requestSeqRef.current) return;

      if (!result.ok) {
        composeLocal(query, `Нейросеть недоступна (${result.error}). Выполнен локальный подбор.`);
        return;
      }

      const accepted = result.variants.filter(
        (plan) => buildVariantLayout(plan, componentMap, canvasSize) !== null,
      );
      if (accepted.length === 0) {
        composeLocal(query, "Нейросеть не предложила подходящих вариантов. Выполнен локальный подбор.");
        return;
      }

      const first = buildVariantLayout(accepted[0], componentMap, canvasSize);
      if (!first) {
        composeLocal(query, "Нейросеть не предложила подходящих вариантов. Выполнен локальный подбор.");
        return;
      }

      setVariantPlans(accepted);
      applyLayout(first.elements);
      setComposeStatus({
        kind: "ok",
        message: `${first.title}. ${first.reason}`,
        items: first.names.map((name) => ({ name, reason: "" })),
        variants: accepted.map((plan) => plan.title),
        activeVariant: 0,
      });
    },
    [components, activeSize, ai, componentMap, canvasSize, applyLayout, composeLocal],
  );

  const compose = useCallback(() => {
    const query = prompt.trim();
    if (!query) {
      setComposeStatus({ kind: "empty", message: "Введите описание иллюстрации." });
      return;
    }

    if (!ai.enabled) {
      composeLocal(query);
      return;
    }

    const blockReason = aiBlockReason(ai);
    if (blockReason !== null) {
      composeLocal(query, `ИИ не использован: ${blockReason}. Выполнен локальный подбор.`);
      return;
    }

    void composeWithAi(query);
  }, [prompt, ai, composeLocal, composeWithAi]);

  /** Переключение варианта ИИ. Раскладка пересчитывается под текущий холст. */
  const selectVariant = useCallback(
    (index: number) => {
      const plan = variantPlans[index];
      if (!plan) return;
      const layout = buildVariantLayout(plan, componentMap, canvasSize);
      if (!layout) {
        setComposeStatus({
          kind: "error",
          message: "Этот вариант нельзя разместить на текущем холсте.",
        });
        return;
      }
      applyLayout(layout.elements);
      setComposeStatus((prev) =>
        prev.kind === "ok"
          ? {
              ...prev,
              message: `${layout.title}. ${layout.reason}`,
              items: layout.names.map((name) => ({ name, reason: "" })),
              activeVariant: index,
            }
          : prev,
      );
    },
    [variantPlans, componentMap, canvasSize, applyLayout],
  );

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
        colorSchemeId: activeScheme,
        elements,
      },
      componentMap,
      displayContents,
      canvasSize,
      {
        background: backgroundColor,
        backdropId,
        repaint: (componentId) => {
          const component = componentMap.get(componentId);
          return component ? mappingForComponent(component, activeScheme) : {};
        },
      },
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
  }, [
    activeFormat,
    activeSize,
    activeScheme,
    elements,
    componentMap,
    displayContents,
    canvasSize,
    backgroundColor,
    backdropId,
  ]);

  return (
    <>
      <ComposePanel
        value={prompt}
        onChange={setPrompt}
        onSubmit={compose}
        examples={PROMPT_EXAMPLES}
        status={composeStatus}
        disabled={!ready || components.length === 0}
        ai={{
          enabled: ai.enabled,
          blockReason: aiBlockReason(ai),
          onToggle: () => onAiChange({ ...ai, enabled: !ai.enabled }),
        }}
        onSelectVariant={selectVariant}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
        <div className="order-2 flex min-h-0 flex-col border-t border-zinc-200 lg:order-none lg:border-t-0">
          {ready ? (
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
            svgContents={displayContents}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMove={moveElement}
            onResize={resizeElement}
            onRotate={rotateElement}
            background={backgroundColor}
            backdropId={backdropId}
          />
        </main>

        <div className="order-3 flex min-h-0 flex-col">
          <SettingsPanel
            formats={CANVAS_FORMATS}
            activeFormat={activeFormat}
            activeSize={activeSize}
            schemes={COLOR_SCHEMES}
            activeScheme={activeScheme}
            backgrounds={CANVAS_BACKGROUNDS}
            activeBackground={activeBackground}
            onSelectFormat={selectFormat}
            onSelectScheme={selectScheme}
            onSelectBackground={setActiveBackground}
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
    </>
  );
}
