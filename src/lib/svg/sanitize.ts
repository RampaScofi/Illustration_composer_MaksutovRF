/**
 * Проверка и очистка SVG-разметки на входе в приложение.
 *
 * Модуль сознательно работает со строкой, без DOMParser: он должен
 * одинаково выполняться на сервере (импорт библиотеки) и в браузере,
 * и покрывать только защиту от исполняемого содержимого.
 * Геометрию и структуру вектора модуль не меняет.
 */

export type SafetyRule =
  | "script-element"
  | "event-handler-attribute"
  | "javascript-url"
  | "external-reference"
  | "embedded-content";

export type SafetyFinding = {
  rule: SafetyRule;
  message: string;
};

const SCRIPT_PATTERN = /<script\b[\s\S]*?(?:<\/script>|\/>)/gi;
const EVENT_HANDLER_PATTERN = /\son[a-z-]+\s*=\s*"[^"]*"/gi;
const JAVASCRIPT_URL_PATTERN = /\s(?:href|xlink:href|src)\s*=\s*"javascript:[^"]*"/gi;
const EMBEDDED_PATTERN = /<(foreignObject|iframe|embed|object|applet)\b[\s\S]*?<\/\1>/gi;
const HREF_PATTERN = /\s(?:xlink:)?href\s*=\s*"([^"]*)"/gi;

/** Отсекает XML-декларацию, комментарии и пробелы до корневого элемента. */
export function isSvgDocument(markup: string): boolean {
  const head = markup.trimStart();
  const withoutProlog = head
    .replace(/^<\?xml[\s\S]*?\?>/, "")
    .replace(/^(?:\s|<!--[\s\S]*?-->)*/, "");

  return /^<svg(\s|>|\/)/i.test(withoutProlog);
}

/** Перечисляет конструкции, которые недопустимы в импортируемом компоненте. */
export function findUnsafeConstructs(markup: string): SafetyFinding[] {
  const findings: SafetyFinding[] = [];

  const push = (rule: SafetyRule, message: string) => {
    if (!findings.some((f) => f.rule === rule && f.message === message)) {
      findings.push({ rule, message });
    }
  };

  if (SCRIPT_PATTERN.test(markup)) {
    push("script-element", "SVG содержит элемент <script>");
  }
  SCRIPT_PATTERN.lastIndex = 0;

  if (EVENT_HANDLER_PATTERN.test(markup)) {
    push("event-handler-attribute", "SVG содержит обработчик события в атрибуте on*");
  }
  EVENT_HANDLER_PATTERN.lastIndex = 0;

  if (JAVASCRIPT_URL_PATTERN.test(markup)) {
    push("javascript-url", "SVG содержит ссылку со схемой javascript:");
  }
  JAVASCRIPT_URL_PATTERN.lastIndex = 0;

  if (EMBEDDED_PATTERN.test(markup)) {
    push("embedded-content", "SVG содержит вложенный чужеродный контент");
  }
  EMBEDDED_PATTERN.lastIndex = 0;

  for (const match of markup.matchAll(HREF_PATTERN)) {
    const value = match[1] ?? "";
    const isLocalReference = value.startsWith("#");
    const isExternal = /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//");
    if (!isLocalReference && isExternal) {
      push("external-reference", `SVG ссылается на внешний ресурс: ${value.slice(0, 80)}`);
    }
  }

  return findings;
}

export type SanitizeResult = {
  markup: string;
  findings: SafetyFinding[];
};

/**
 * Удаляет исполняемые и внешние конструкции, оставляя векторную структуру нетронутой.
 * Найденные нарушения возвращаются в отчёте, чтобы импорт можно было показать пользователю.
 */
export function sanitizeSvgMarkup(markup: string): SanitizeResult {
  const findings = findUnsafeConstructs(markup);

  const cleaned = markup
    .replace(SCRIPT_PATTERN, "")
    .replace(EMBEDDED_PATTERN, "")
    .replace(EVENT_HANDLER_PATTERN, "")
    .replace(JAVASCRIPT_URL_PATTERN, "")
    .replace(HREF_PATTERN, (whole, value: string) => {
      const isLocalReference = value.startsWith("#");
      const isExternal = /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//");
      return isLocalReference || !isExternal ? whole : "";
    });

  return { markup: cleaned, findings };
}
