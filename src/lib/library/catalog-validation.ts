import type { LibraryComponent } from "../../types/library.ts";
import { validateLibraryComponent } from "../metadata/validate.ts";

export type CatalogIssue = {
  field: string;
  message: string;
  componentId?: string;
};

/** Проверить целостность списка компонентов. */
export function validateCatalog(components: LibraryComponent[]): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const seenIds = new Set<string>();

  for (const comp of components) {
    const result = validateLibraryComponent(comp);
    if (!result.ok) {
      for (const issue of result.issues) {
        issues.push({ field: issue.field, message: issue.message, componentId: comp.id });
      }
      continue;
    }

    if (seenIds.has(comp.id)) {
      issues.push({
        field: "id",
        message: `Дубликат идентификатора: ${comp.id}`,
        componentId: comp.id,
      });
    }
    seenIds.add(comp.id);

    // svgPath должен быть уникальным для каждой записи
    // (один файл может быть ссылкой из нескольких компонентов, но не рекомендуется)
  }

  return issues;
}

/** Проверить уникальность всех ID. */
export function checkUniqueIds(components: LibraryComponent[]): string[] {
  const ids = components.map((c) => c.id);
  const dupes = new Set<string>();
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      if (ids[i] === ids[j]) dupes.add(ids[i]);
    }
  }
  return [...dupes];
}

/** Проверить, что все компоненты имеют непустой id. */
export function checkNonEmptyIds(components: LibraryComponent[]): string[] {
  return components.filter((c) => !c.id || c.id.trim() === "").map((c) => c.id ?? "<missing>");
}

/**
 * Уникализация ID в SVG-разметке.
 * Префиксирует все id и обновляет url(#...) ссылки.
 * Используется при сборке композиции из нескольких SVG.
 * url(#) ссылки префиксуются всегда, даже если соответствующий id
 * находится в defs (который обрабатывается отдельно).
 */
export function uniqueSvgIds(svg: string, prefix: string): string {
  // 1. Префиксовать все id="..." атрибуты
  const idPattern = /\sid="([^"]+)"/g;
  let result = svg.replace(idPattern, (_whole, id: string) => `id="${prefix}__${id}"`);

  // 2. Префиксовать все url(#) ссылки (включая clip-path, mask, filter, fill, stroke)
  const urlPattern = /url\(#([^)]+)\)/g;
  result = result.replace(urlPattern, (_whole, ref: string) => `url(#${prefix}__${ref})`);

  return result;
}

/**
 * Собрать defs из SVG-разметки (между <defs> и </defs>).
 * Возвращает строку defs или пустую строку.
 */
export function extractDefs(svg: string): string {
  const defsMatch = /<defs[\s>](?<content>[\s\S]*?)<\/defs>/i.exec(svg);
  return defsMatch ? defsMatch.groups?.content ?? "" : "";
}

/**
 * Удалить defs из SVG (оставить только body).
 */
export function stripDefs(svg: string): string {
  return svg.replace(/<defs[\s>][\s\S]*?<\/defs>/gi, "");
}

/**
 * Проверить, что в SVG нет конфликтов с уже собранными ID.
 * Возвращает список конфликтующих ID.
 */
export function findConflicts(svg: string, existingIds: Set<string>): string[] {
  const idPattern = /\sid="([^"]+)"/g;
  const conflicts: string[] = [];
  for (const match of svg.matchAll(idPattern)) {
    const id = match[1];
    if (existingIds.has(id)) conflicts.push(id);
  }
  return conflicts;
}

/**
 * Получить все ID из SVG-разметки.
 */
export function extractSvgIds(svg: string): string[] {
  const idPattern = /\sid="([^"]+)"/g;
  return [...svg.matchAll(idPattern)].map((m) => m[1]);
}
