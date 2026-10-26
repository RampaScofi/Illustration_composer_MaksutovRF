import type { LibraryComponent, LibraryManifest } from "@/types/library";
import type { ColorScheme } from "@/types/palette";
import { parseViewBox } from "../svg/viewBox.ts";
import { normalizeHex } from "../palette/mapping.ts";

export type ValidationIssue = {
  field: string;
  message: string;
};

export type ValidationResult<T> =
  | { ok: true; value: T; issues: [] }
  | { ok: false; value: null; issues: ValidationIssue[] };

const SIZES = new Set(["L", "S"]);
const ROLES = new Set(["primary", "background"]);

function asRecord(raw: unknown): Record<string, unknown> | null {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Проверяет одну запись манифеста библиотеки.
 * Делается намеренно строго: компонент с битым viewBox или путём к SVG
 * не должен попадать в холст, потому что его нельзя корректно разместить.
 */
export function validateLibraryComponent(
  raw: unknown,
): ValidationResult<LibraryComponent> {
  const issues: ValidationIssue[] = [];
  const item = asRecord(raw);

  if (!item) {
    return { ok: false, value: null, issues: [{ field: "", message: "Запись не является объектом" }] };
  }

  if (!nonEmptyString(item.id)) issues.push({ field: "id", message: "Поле id обязательно и непустое" });
  if (!nonEmptyString(item.name)) issues.push({ field: "name", message: "Поле name обязательно" });

  if (!SIZES.has(String(item.size))) {
    issues.push({ field: "size", message: "Допустимые размеры: L, S" });
  }
  if (!ROLES.has(String(item.role))) {
    issues.push({ field: "role", message: "Допустимые роли: primary, background" });
  }

  if (!nonEmptyString(item.svgPath)) {
    issues.push({ field: "svgPath", message: "Поле svgPath обязательно" });
  } else if (!item.svgPath.toString().toLowerCase().endsWith(".svg")) {
    issues.push({ field: "svgPath", message: "Компонент обязан ссылаться на .svg файл" });
  }

  if (!nonEmptyString(item.sourceIllustrationId)) {
    issues.push({ field: "sourceIllustrationId", message: "Нужна ссылка на иллюстрацию-источник" });
  }

  const viewBox =
    typeof item.viewBox === "string" ? parseViewBox(item.viewBox) : asRecord(item.viewBox);

  if (viewBox) {
    const box = asRecord(viewBox) ?? viewBox;
    const width = Number(box.width);
    const height = Number(box.height);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      issues.push({ field: "viewBox", message: "viewBox должен содержать положительные width и height" });
    }
  } else {
    issues.push({ field: "viewBox", message: "viewBox не разобран" });
  }

  const intrinsicSize = asRecord(item.intrinsicSize);
  if (
    !intrinsicSize ||
    !Number.isFinite(Number(intrinsicSize.width)) ||
    !Number.isFinite(Number(intrinsicSize.height))
  ) {
    issues.push({ field: "intrinsicSize", message: "intrinsicSize обязателен" });
  }

  if (!Array.isArray(item.tags)) {
    issues.push({ field: "tags", message: "tags — массив строк" });
  }

  if (issues.length > 0) {
    return { ok: false, value: null, issues };
  }

  return { ok: true, value: raw as LibraryComponent, issues: [] };
}

export function validateLibraryManifest(raw: unknown): ValidationResult<LibraryManifest> {
  const manifest = asRecord(raw);
  if (!manifest) {
    return { ok: false, value: null, issues: [{ field: "", message: "Манифест не является объектом" }] };
  }

  const issues: ValidationIssue[] = [];
  if (!nonEmptyString(manifest.version)) {
    issues.push({ field: "version", message: "Поле version обязательно" });
  }

  if (!Array.isArray(manifest.components)) {
    issues.push({ field: "components", message: "components — массив" });
    return { ok: false, value: null, issues };
  }

  const seenIds = new Set<string>();
  manifest.components.forEach((component, index) => {
    const result = validateLibraryComponent(component);
    if (!result.ok) {
      for (const issue of result.issues) {
        issues.push({ field: `components[${index}].${issue.field}`, message: issue.message });
      }
      return;
    }

    if (seenIds.has(result.value.id)) {
      issues.push({ field: `components[${index}].id`, message: `Дубликат id ${result.value.id}` });
    }
    seenIds.add(result.value.id);
  });

  if (issues.length > 0) {
    return { ok: false, value: null, issues };
  }

  return { ok: true, value: raw as LibraryManifest, issues: [] };
}

export function validateColorScheme(raw: unknown): ValidationResult<ColorScheme> {
  const scheme = asRecord(raw);
  if (!scheme) {
    return { ok: false, value: null, issues: [{ field: "", message: "Схема не является объектом" }] };
  }

  const issues: ValidationIssue[] = [];
  if (!nonEmptyString(scheme.id)) issues.push({ field: "id", message: "Поле id обязательно" });
  if (!nonEmptyString(scheme.name)) issues.push({ field: "name", message: "Поле name обязательно" });

  if (!Array.isArray(scheme.colors) || scheme.colors.length === 0) {
    issues.push({ field: "colors", message: "colors — непустой массив" });
    return { ok: false, value: null, issues };
  }

  scheme.colors.forEach((entry, index) => {
    const color = asRecord(entry);
    if (!color) {
      issues.push({ field: `colors[${index}]`, message: "Цвет должен быть объектом" });
      return;
    }
    if (normalizeHex(String(color.hex)) === null) {
      issues.push({ field: `colors[${index}].hex`, message: "Ожидается цвет в формате #rrggbb" });
    }
    if (!["background", "object", "neutral"].includes(String(color.slot))) {
      issues.push({ field: `colors[${index}].slot`, message: "Неизвестная роль цвета" });
    }
  });

  if (issues.length > 0) {
    return { ok: false, value: null, issues };
  }

  return { ok: true, value: raw as ColorScheme, issues: [] };
}

export function collectIssues(results: ValidationIssue[], scope: string): ValidationIssue[] {
  return results.map((issue) => ({ ...issue, field: `${scope}.${issue.field}` }));
}

/** Приводит список строк тегов, отбрасывая пустые и дубликаты. */
export function normalizeTags(tags: string[] | null): string[] {
  if (!tags) return [];

  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}
