// Главный поток плагина Figma. Здесь только связка UI с общими модулями движка:
// подбор, компоновка, перекраска и экспорт выполняются функциями из src/lib.
import { validateLibraryManifest } from "../../src/lib/metadata/validate.ts";
import {
  explainMatch,
  matchComponents,
  selectCompositionPlan,
} from "../../src/lib/semantic/matcher.ts";
import { effectiveScale, layoutItemFromComponent } from "../../src/lib/library/layoutMetadata.ts";
import { buildAutoLayout } from "../../src/lib/composition/autoLayout.ts";
import type { LayoutItem } from "../../src/lib/composition/autoLayout.ts";
import { fitInto, overlapArea, safeBox } from "../../src/lib/composition/pieces.ts";
import type { Box, Point, Size } from "../../src/types/geometry.ts";
import { CANVAS_FORMATS, resolveCanvasSize } from "../../src/lib/composition/canvas.ts";
import { repaintContents } from "../../src/lib/palette/apply.ts";
import {
  CANVAS_BACKGROUNDS,
  COLOR_SCHEMES,
  backdropComponentId,
  backgroundForScheme,
  canvasColor,
  getBaseScheme,
  getCanvasBackground,
  getScheme,
} from "../../src/lib/palette/schemes.ts";
import { AI_PROVIDERS, buildChatTarget, extractText } from "../../src/lib/ai/providers.ts";
import {
  DEFAULT_AI_SETTINGS,
  aiBlockReason,
  sanitizeAiSettings,
  AI_SETTINGS_STORAGE_KEY,
} from "../../src/lib/ai/settings.ts";
import {
  SYSTEM_PROMPT,
  buildAiCatalog,
  buildUserMessage,
} from "../../src/lib/ai/contract.ts";
import { validateAiResponse } from "../../src/lib/ai/validate.ts";
import type { AiComposeRequest, AiSettings } from "../../src/lib/ai/types.ts";
import type { CanvasFormatId, CompositionElement } from "../../src/types/composition.ts";
import type { ComponentSize, LibraryComponent } from "../../src/types/library.ts";
import type { HexColor } from "../../src/types/palette.ts";
import { LIBRARY_MANIFEST, SVG_FILES } from "./library.generated.ts";

/** Сообщения от интерфейса к плагину. */
type UiMessage =
  | { type: "ui-ready" }
  | {
      type: "ai-save";
      settings: { providerId: string; model: string; baseUrl: string; apiKey: string };
    }
  | { type: "ai-delete" }
  | { type: "library"; size: ComponentSize }
  | {
      type: "generate";
      /** Текстовый запрос; игнорируется, если передан ids. */
      query: string;
      /** Ручной набор компонентов; null — подбор по запросу. */
      ids: string[] | null;
      size: ComponentSize;
      schemeId: string;
      backgroundId: string;
      format: CanvasFormatId;
      seed?: number;
      /** true — подбор через нейросеть (только для текстового запроса). */
      useAi?: boolean;
    }
  | {
      /** Добавление выбранных компонентов в выделенный фрейм без пересоздания композиции. */
      type: "add-to-frame";
      ids: string[];
      size: ComponentSize;
      schemeId: string;
    }
  | { type: "export" };

/** Сообщения от плагина к интерфейсу. */
type PluginMessage =
  | {
      type: "init";
      libraryError: string | null;
      componentCount: number;
      providers: { id: string; label: string; modelHint: string; baseUrlEditable: boolean }[];
      formats: { id: CanvasFormatId; label: string }[];
      schemes: { id: string; name: string; shortName: string; background: HexColor[]; object: HexColor[] }[];
      backgrounds: { id: string; name: string; hex: HexColor }[];
    }
  | { type: "library"; size: ComponentSize; items: { id: string; name: string; role: string; svg: string }[] }
  | {
      type: "generated";
      name: string;
      count: number;
      lines: string[];
      concepts: string[];
      /** Причина, по которой ИИ не использован (собрано локально); null — ИИ не запрашивался или сработал. */
      notice: string | null;
      /** true — подбор выполнен нейросетью; false — локальным алгоритмом. */
      aiUsed: boolean;
    }
  | { type: "progress"; text: string }
  | { type: "added"; count: number; frameName: string }
  | { type: "exported"; svg: string; name: string }
  | {
      type: "ai-state";
      providerId: string;
      model: string;
      baseUrl: string;
      hasKey: boolean;
      /** Последние символы ключа: полный ключ в интерфейс не передаётся. */
      keyHint: string;
      /** Причина, по которой запрос к AI нельзя выполнить; null — настройки полные. */
      blockReason: string | null;
    }
  | { type: "error"; message: string };

const validation = validateLibraryManifest(LIBRARY_MANIFEST);
const LIBRARY_ERROR = validation.ok
  ? null
  : validation.issues.map((issue) => `${issue.field}: ${issue.message}`).join("; ");
const COMPONENTS: LibraryComponent[] = validation.ok ? validation.value.components : [];
const BY_ID = new Map<string, LibraryComponent>(COMPONENTS.map((c) => [c.id, c]));

/** Компоненты, которые можно выбрать вручную: объекты переднего плана и фоновые объекты. */
function isSelectable(component: LibraryComponent, size: ComponentSize): boolean {
  return component.size === size && (component.role === "primary" || component.role === "background");
}

function svgFor(component: LibraryComponent): string | null {
  return SVG_FILES[component.svgPath] ?? null;
}

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

/**
 * Ставит узел так, чтобы его центр совпал с (cx, cy), с поворотом вокруг центра.
 * Матрица та же, что в экспорте движка: rotate(θ) в системе координат SVG (ось Y вниз).
 * Узел должен быть уже добавлен в родителя: relativeTransform задаётся относительно него.
 */
function placeCentered(node: FrameNode, cx: number, cy: number, degrees: number): void {
  const w = node.width;
  const h = node.height;
  const r = (degrees * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  node.relativeTransform = [
    [c, -s, cx - c * (w / 2) + s * (h / 2)],
    [s, c, cy - s * (w / 2) - c * (h / 2)],
  ];
}

function postError(message: string): void {
  figma.ui.postMessage({ type: "error", message } satisfies PluginMessage);
  figma.notify(message, { error: true });
}

type Resolved = {
  components: LibraryComponent[];
  lines: string[];
  concepts: string[];
  aiUsed: boolean;
};

/** Этап работы для интерфейса: показывается в статусной строке. */
function postProgress(text: string): void {
  figma.ui.postMessage({ type: "progress", text } satisfies PluginMessage);
}

/** Время ожидания ответа провайдера. По истечении — откат на локальный подбор. */
const AI_TIMEOUT_MS = 30000;

type AiAttempt = { ok: true; value: Resolved } | { ok: false; reason: string };

/**
 * Подбор через нейросеть: запрос уходит из главного потока плагина (fetch),
 * ответ проверяется validateAiResponse. Модель видит только каталог и выбирает id.
 * Любая неудача возвращает причину, по которой вызывающий код откатится на локальный подбор.
 */
async function tryAiSelection(query: string, size: ComponentSize): Promise<AiAttempt> {
  const settings = await loadAi();
  const blockReason = aiBlockReason(settings);
  if (blockReason !== null) return { ok: false, reason: blockReason };

  const catalog = buildAiCatalog(COMPONENTS, size);
  const request: AiComposeRequest = {
    prompt: query.slice(0, 500),
    size,
    variantCount: 1,
    catalog,
    // DEFAULT_VARIANT_COUNT здесь не нужен: в плагине запрашивается один вариант.
    provider: {
      id: settings.providerId,
      model: settings.model,
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
    },
  };
  const target = buildChatTarget(
    {
      providerId: settings.providerId,
      model: settings.model,
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
    },
    SYSTEM_PROMPT,
    buildUserMessage(request),
  );
  if (!target) return { ok: false, reason: "не удалось сформировать запрос к провайдеру" };

  postProgress(`ИИ: отправлен запрос (${settings.providerId}, модель ${settings.model}). Ждём ответ…`);
  const response = await withTimeout(
    fetch(target.url, {
      method: "POST",
      headers: target.headers,
      body: JSON.stringify(target.body),
    }),
    AI_TIMEOUT_MS,
  );
  if (!response.ok) return { ok: false, reason: `провайдер ответил с кодом ${response.status}` };

  postProgress("ИИ: ответ получен, проверяем выбор…");
  const payload: unknown = await response.json();
  const text = extractText(settings.providerId, payload);
  if (text === null) return { ok: false, reason: "неожиданный формат ответа провайдера" };

  const checked = validateAiResponse(text, catalog, request.variantCount);
  const variant = checked.variants[0];
  if (!variant) return { ok: false, reason: "ответ модели не прошёл проверку" };

  const ids = [...variant.primaryIds, ...(variant.backgroundId ? [variant.backgroundId] : [])];
  const components = ids
    .map((id) => BY_ID.get(id))
    .filter((c): c is LibraryComponent => Boolean(c));
  if (components.length === 0) return { ok: false, reason: "в ответе нет известных объектов" };

  return {
    ok: true,
    value: {
      components,
      lines: [`${variant.title}: ${variant.reason}`, ...components.map((c) => c.name)],
      concepts: [],
      aiUsed: true,
    },
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("превышено время ожидания")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function resolveItems(
  msg: Extract<UiMessage, { type: "generate" }>,
): Promise<(Resolved & { notice: string | null }) | { error: string }> {
  if (msg.ids) {
    const components = msg.ids
      .map((id) => BY_ID.get(id))
      .filter((c): c is LibraryComponent => Boolean(c) && isSelectable(c!, msg.size));
    if (components.length === 0) return { error: "Выберите компоненты нужного размера (L или S)." };
    return { components, lines: components.map((c) => c.name), concepts: [], notice: null, aiUsed: false };
  }

  let notice: string | null = null;
  if (msg.useAi) {
    try {
      const attempt = await tryAiSelection(msg.query, msg.size);
      if (attempt.ok) return { ...attempt.value, notice: null };
      notice = `ИИ не использован: ${attempt.reason}. Подбор выполнен локально.`;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "ошибка сети";
      notice = `ИИ не использован: ${detail}. Подбор выполнен локально.`;
    }
  }

  const match = matchComponents(msg.query, COMPONENTS);
  const plan = selectCompositionPlan(match, { size: msg.size });
  if (plan.items.length === 0) {
    return { error: "Ничего не подобрано. Попробуйте другие слова или выберите компоненты вручную." };
  }
  return {
    components: plan.items.map((m) => m.component),
    lines: plan.items.map((m) => `${m.component.name}: ${explainMatch(m)}`),
    concepts: match.concepts,
    notice,
    aiUsed: false,
  };
}

async function generate(msg: Extract<UiMessage, { type: "generate" }>): Promise<void> {
  const resolved = await resolveItems(msg);
  if ("error" in resolved) {
    postError(resolved.error);
    return;
  }
  if (resolved.notice) figma.notify(resolved.notice, { timeout: 6000 });

  const canvas = resolveCanvasSize(msg.format);
  const scheme = getScheme(msg.schemeId) ?? getBaseScheme();
  const background = getCanvasBackground(msg.backgroundId) ?? backgroundForScheme(scheme.id);

  // Раскладка работает на метаданных; SVG и координаты берутся из её результата.
  const layoutItems: LayoutItem[] = resolved.components.map(layoutItemFromComponent);
  const elements: CompositionElement[] = buildAutoLayout(layoutItems, { canvas, seed: msg.seed });
  if (elements.length === 0) {
    postError("Не удалось построить раскладку для выбранного формата.");
    return;
  }

  // Подложка берётся из библиотеки как отдельный SVG, а не рисуется кодом.
  const backdropId = backdropComponentId(background.id, msg.size);
  const usedIds = [...new Set([...elements.map((e) => e.componentId), backdropId])];

  const contents = new Map<string, string>();
  const components = new Map<string, LibraryComponent>();
  for (const id of usedIds) {
    const component = BY_ID.get(id);
    const svg = component ? svgFor(component) : null;
    if (component && svg) {
      contents.set(id, svg);
      components.set(id, component);
    }
  }
  const repainted = repaintContents(contents, components, scheme.id);

  const root = figma.createFrame();
  root.name = msg.ids ? "VectorMuse · набор" : `VectorMuse · ${msg.query.slice(0, 40)}`;
  root.resize(canvas.width, canvas.height);
  root.fills = [{ type: "SOLID", color: hexToRgb(canvasColor(background.id)) }];
  root.clipsContent = true;
  figma.currentPage.appendChild(root);

  const backdropSvg = repainted.get(backdropId);
  if (backdropSvg) {
    const backdrop = figma.createNodeFromSvg(backdropSvg);
    backdrop.name = "Подложка";
    root.appendChild(backdrop);
    const scale = Math.max(canvas.width / backdrop.width, canvas.height / backdrop.height);
    backdrop.rescale(scale);
    placeCentered(backdrop, canvas.width / 2, canvas.height / 2, 0);
  }

  for (const element of elements) {
    const svg = repainted.get(element.componentId);
    const component = BY_ID.get(element.componentId);
    if (!svg || !component) continue;

    const node = figma.createNodeFromSvg(svg);
    node.name = component.name;
    root.appendChild(node);

    // Масштаб вписывает исходный размер в box экземпляра, как и экспорт SVG.
    const scale = Math.min(element.size.width / node.width, element.size.height / node.height);
    node.rescale(scale);
    placeCentered(
      node,
      element.position.x + element.size.width / 2,
      element.position.y + element.size.height / 2,
      element.rotation,
    );
  }

  figma.currentPage.selection = [root];
  figma.viewport.scrollAndZoomIntoView([root]);

  figma.ui.postMessage({
    type: "generated",
    name: root.name,
    count: elements.length,
    lines: resolved.lines,
    concepts: resolved.concepts,
    notice: resolved.notice,
    aiUsed: resolved.aiUsed,
  } satisfies PluginMessage);
  figma.notify("Композиция добавлена на страницу");
}

/**
 * Ищет место для объекта размером size внутри холста: перебирает кандидатов по сетке
 * и выбирает тот, где меньше всего перекрытия с уже стоящими объектами.
 * Подложка исключается из расчёта: она декоративная и лежит под всеми объектами.
 */
function findFreeSpot(size: Size, canvas: Size, occupied: Box[]): Point {
  const area = safeBox(canvas, 0.04);
  const maxX = area.x + Math.max(0, area.width - size.width);
  const maxY = area.y + Math.max(0, area.height - size.height);
  const STEPS = 8;
  let best: Point = { x: area.x, y: area.y };
  let bestCost = Number.POSITIVE_INFINITY;
  for (let iy = 0; iy <= STEPS; iy++) {
    for (let ix = 0; ix <= STEPS; ix++) {
      const candidate: Box = {
        x: area.x + ((maxX - area.x) * ix) / STEPS,
        y: area.y + ((maxY - area.y) * iy) / STEPS,
        width: size.width,
        height: size.height,
      };
      const cost = occupied.reduce((sum, box) => sum + overlapArea(candidate, box), 0);
      if (cost < bestCost) {
        bestCost = cost;
        best = { x: candidate.x, y: candidate.y };
        if (cost === 0) return best;
      }
    }
  }
  return best;
}

/**
 * Добавляет выбранные компоненты в выделенный фрейм композиции.
 * Существующие слои, включая подложку, не пересоздаются: объекты добавляются поверх.
 */
async function addToFrame(msg: Extract<UiMessage, { type: "add-to-frame" }>): Promise<void> {
  const frame = figma.currentPage.selection[0];
  if (!frame || frame.type !== "FRAME") {
    postError("Выделите фрейм композиции на странице, затем добавьте объекты.");
    return;
  }

  const components = msg.ids
    .map((id) => BY_ID.get(id))
    .filter((c): c is LibraryComponent => Boolean(c) && isSelectable(c!, msg.size));
  if (components.length === 0) {
    postError("Выберите компоненты нужного размера (L или S).");
    return;
  }

  const scheme = getScheme(msg.schemeId) ?? getBaseScheme();
  const canvas: Size = { width: frame.width, height: frame.height };
  const occupied: Box[] = frame.children
    .filter((child) => child.name !== "Подложка" && child.visible)
    .map((child) => ({ x: child.x, y: child.y, width: child.width, height: child.height }));

  const contents = new Map<string, string>();
  const byId = new Map<string, LibraryComponent>();
  for (const component of components) {
    const svg = svgFor(component);
    if (svg) {
      contents.set(component.id, svg);
      byId.set(component.id, component);
    }
  }
  const repainted = repaintContents(contents, byId, scheme.id);

  // Наибольшие объекты ставим первыми: им сложнее найти место.
  const ordered = [...components].sort((a, b) => b.intrinsicSize.width * b.intrinsicSize.height - a.intrinsicSize.width * a.intrinsicSize.height);
  let added = 0;
  for (const component of ordered) {
    const svg = repainted.get(component.id);
    if (!svg) continue;

    const scale = effectiveScale(component);
    const base = fitInto(component.intrinsicSize, {
      width: canvas.width * 0.4,
      height: canvas.height * 0.4,
    });
    const size: Size = { width: base.width * scale, height: base.height * scale };
    const spot = findFreeSpot(size, canvas, occupied);

    const node = figma.createNodeFromSvg(svg);
    node.name = component.name;
    frame.appendChild(node);
    const fit = Math.min(size.width / node.width, size.height / node.height);
    node.rescale(fit);
    node.x = spot.x;
    node.y = spot.y;

    occupied.push({ x: spot.x, y: spot.y, width: size.width, height: size.height });
    added++;
  }

  figma.currentPage.selection = [frame];
  figma.ui.postMessage({ type: "added", count: added, frameName: frame.name } satisfies PluginMessage);
  figma.notify(`Добавлено объектов: ${added}`);
}

async function exportSelection(): Promise<void> {
  const node = figma.currentPage.selection[0];
  if (!node || node.type !== "FRAME") {
    postError("Выделите фрейм композиции, затем нажмите «Экспорт SVG».");
    return;
  }
  const svg = await node.exportAsync({ format: "SVG_STRING" });
  figma.ui.postMessage({ type: "exported", svg, name: node.name } satisfies PluginMessage);
}

/**
 * Настройки AI хранятся в clientStorage текущего пользователя. Это локальное
 * хранилище Figma, но не защищённое: ключ лежит открыто.
 */
async function loadAi(): Promise<AiSettings> {
  try {
    return sanitizeAiSettings(await figma.clientStorage.getAsync(AI_SETTINGS_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

function postAiState(settings: AiSettings): void {
  figma.ui.postMessage({
    type: "ai-state",
    providerId: settings.providerId,
    model: settings.model,
    baseUrl: settings.baseUrl,
    hasKey: settings.apiKey.length > 0,
    keyHint: settings.apiKey.slice(-4),
    blockReason: aiBlockReason(settings),
  } satisfies PluginMessage);
}

async function saveAi(input: Extract<UiMessage, { type: "ai-save" }>["settings"]): Promise<void> {
  const previous = await loadAi();
  // Пустое поле ключа означает «оставить сохранённый ключ».
  const next = sanitizeAiSettings({
    enabled: previous.enabled,
    providerId: input.providerId,
    model: input.model,
    baseUrl: input.baseUrl,
    apiKey: input.apiKey || previous.apiKey,
  });
  await figma.clientStorage.setAsync(AI_SETTINGS_STORAGE_KEY, next);
  postAiState(next);
}

async function deleteAi(): Promise<void> {
  await figma.clientStorage.deleteAsync(AI_SETTINGS_STORAGE_KEY);
  postAiState({ ...DEFAULT_AI_SETTINGS });
}

function postInit(): void {
  figma.ui.postMessage({
    type: "init",
    libraryError: LIBRARY_ERROR,
    componentCount: COMPONENTS.length,
    providers: AI_PROVIDERS.map((p) => ({
      id: p.id,
      label: p.label,
      modelHint: p.modelHint,
      baseUrlEditable: p.baseUrlEditable,
    })),
    formats: CANVAS_FORMATS.map((f) => ({ id: f.id, label: f.label })),
    schemes: COLOR_SCHEMES.map((s) => ({
      id: s.id,
      name: s.name,
      shortName: s.shortName,
      background: [...s.background],
      object: [...s.object],
    })),
    backgrounds: CANVAS_BACKGROUNDS.map((b) => ({ id: b.id, name: b.name, hex: b.hex })),
  } satisfies PluginMessage);
}

function postLibrary(size: ComponentSize): void {
  const items = COMPONENTS.filter((c) => isSelectable(c, size)).map((c) => ({
    id: c.id,
    name: c.name,
    role: c.role,
    svg: svgFor(c) ?? "",
  }));
  figma.ui.postMessage({ type: "library", size, items } satisfies PluginMessage);
}

figma.showUI(__html__, { width: 400, height: 680, themeColors: false });

figma.ui.onmessage = async (raw: UiMessage) => {
  try {
    switch (raw.type) {
      case "ui-ready":
        postInit();
        postAiState(await loadAi());
        break;
      case "ai-save":
        await saveAi(raw.settings);
        break;
      case "ai-delete":
        await deleteAi();
        break;
      case "library":
        postLibrary(raw.size);
        break;
      case "generate":
        await generate(raw);
        break;
      case "add-to-frame":
        await addToFrame(raw);
        break;
      case "export":
        await exportSelection();
        break;
    }
  } catch (error) {
    postError(error instanceof Error ? error.message : "Неизвестная ошибка плагина.");
  }
};
