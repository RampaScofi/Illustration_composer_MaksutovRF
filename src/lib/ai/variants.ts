import type { CompositionElement } from "../../types/composition.ts";
import type { Size } from "../../types/geometry.ts";
import type { LibraryComponent } from "../../types/library.ts";
import { buildAutoLayout, type LayoutItem } from "../composition/autoLayout.ts";
import type { AiVariantPlan } from "./types.ts";

export type VariantLayout = {
  title: string;
  reason: string;
  /** Элементы с временными instanceId из автолейаута: перед применением переназначаются. */
  elements: CompositionElement[];
  /** Имена выбранных объектов для отчёта. */
  names: string[];
};

/**
 * Полный путь варианта ИИ: проверка id → элементы автолейаута.
 * Возвращает null, если вариант нельзя разместить на холсте.
 */
export function buildVariantLayout(
  plan: AiVariantPlan,
  components: ReadonlyMap<string, LibraryComponent>,
  canvas: Size,
  seed?: number,
): VariantLayout | null {
  const items = variantToLayoutItems(plan, components);
  if (!items) return null;
  const elements = buildAutoLayout(items, { canvas, seed });
  if (elements.length === 0) return null;
  return {
    title: plan.title,
    reason: plan.reason,
    elements,
    names: items.map((item) => components.get(item.componentId)?.name ?? item.componentId),
  };
}

/**
 * Превращает проверенный вариант модели в элементы для автолейаута.
 * Возвращает null, если хотя бы один id не найден в библиотеке или имеет
 * неподходящую роль: такой вариант нельзя разместить на холсте.
 */
export function variantToLayoutItems(
  plan: AiVariantPlan,
  components: ReadonlyMap<string, LibraryComponent>,
): LayoutItem[] | null {
  const items: LayoutItem[] = [];

  for (const id of plan.primaryIds) {
    const component = components.get(id);
    if (!component || component.role !== "primary") return null;
    items.push(toLayoutItem(component));
  }

  if (plan.backgroundId !== null) {
    const background = components.get(plan.backgroundId);
    if (!background || background.role !== "background") return null;
    items.push(toLayoutItem(background));
  }

  return items.length > 0 ? items : null;
}

export function toLayoutItem(component: LibraryComponent): LayoutItem {
  return {
    componentId: component.id,
    role: component.role,
    intrinsic: component.intrinsicSize,
    category: component.sourceIllustrationId,
  };
}
