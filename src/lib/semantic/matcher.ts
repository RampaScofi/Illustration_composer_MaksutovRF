import type { ComponentRole, ComponentSize, LibraryComponent } from "@/types/library";
import { conflicts } from "../library/layoutMetadata.ts";
import { findConcepts } from "./associations.ts";
import { normalizeText, stemWord, tokenize } from "./normalize.ts";

/**
 * Локальный семантический подбор компонентов.
 *
 * Работает только с метаданными библиотеки (название, синонимы, теги)
 * и статическим словарём ассоциаций. Никаких сетевых вызовов, моделей
 * и генерации новых объектов: результат детерминирован для одного и того же
 * запроса и каталога.
 */

export type MatchedComponent = {
  component: LibraryComponent;
  score: number;
  /** Совпавшие термины — для объяснения выбора пользователю. */
  matchedTerms: string[];
  /** Смысловые поля, которые сработали. */
  concepts: string[];
};

export type SemanticMatchResult = {
  query: string;
  /** Основы слов запроса после нормализации. */
  tokens: string[];
  /** Смысловые поля, затронутые запросом. */
  concepts: string[];
  candidates: MatchedComponent[];
  /** Есть ли осмысленные совпадения (не пустая выдача). */
  hasMatches: boolean;
};

const WEIGHT_NAME = 5;
const WEIGHT_ALIAS = 3.5;
const WEIGHT_TAG = 2.5;
const WEIGHT_EXPANDED = 1.3;
/** Минимальная доля от лучшего результата, чтобы попасть в композицию. */
const RELEVANCE_CUTOFF = 0.4;

function matches(termStem: string, tokenStem: string): boolean {
  if (termStem === tokenStem) return true;
  if (termStem.length < 4 || tokenStem.length < 4) return false;
  return termStem.startsWith(tokenStem) || tokenStem.startsWith(termStem);
}

function scoreTerms(
  terms: readonly string[],
  tokenStems: readonly string[],
  weight: number,
): { score: number; matched: string[] } {
  let score = 0;
  const matched: string[] = [];

  for (const term of terms) {
    const termStem = stemWord(term);
    if (!termStem) continue;
    const hit = tokenStems.find((t) => matches(termStem, t));
    if (hit) {
      score += weight;
      matched.push(term);
    }
  }

  return { score, matched };
}

/**
 * Подбирает компоненты под текстовый запрос.
 * Возвращает кандидатов, отсортированных по убыванию релевантности.
 */
export function matchComponents(
  query: string,
  components: readonly LibraryComponent[],
): SemanticMatchResult {
  const tokens = tokenize(query);
  const concepts = findConcepts(tokens, stemWord);
  const expanded = [
    ...new Set(concepts.flatMap((c) => c.expands.map(stemWord)).filter(Boolean)),
  ].filter((stem) => !tokens.includes(stem));

  const candidates: MatchedComponent[] = [];

  for (const component of components) {
    if (component.role === "backdrop") continue;

    const nameParts = scoreTerms([component.name], tokens, WEIGHT_NAME);
    const aliasParts = scoreTerms(component.aliases, tokens, WEIGHT_ALIAS);
    const tagParts = scoreTerms(component.tags, tokens, WEIGHT_TAG);
    const expandedParts = scoreTerms(component.tags, expanded, WEIGHT_EXPANDED);

    const score =
      nameParts.score + aliasParts.score + tagParts.score + expandedParts.score;

    if (score <= 0) continue;

    const matchedTerms = [
      ...new Set([
        ...nameParts.matched,
        ...aliasParts.matched,
        ...tagParts.matched,
        ...expandedParts.matched,
      ]),
    ];

    const matchedConcepts = concepts
      .filter((concept) =>
        concept.expands.some((term) => expandedParts.matched.includes(term)),
      )
      .map((concept) => concept.label);

    candidates.push({ component, score, matchedTerms, concepts: matchedConcepts });
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.component.name.localeCompare(b.component.name, "ru");
  });

  return {
    query: normalizeText(query),
    tokens,
    concepts: concepts.map((c) => c.label),
    candidates,
    hasMatches: candidates.length > 0,
  };
}

export type CompositionPlan = {
  /** Компоненты, которые будут размещены на холсте. */
  items: MatchedComponent[];
  /** Отфильтрованные по размеру и роли кандидаты в порядке приоритета. */
  primary: MatchedComponent[];
  background: MatchedComponent | null;
  /** Главный объект — самый релевантный. */
  main: MatchedComponent | null;
};

export type PlanOptions = {
  size: ComponentSize;
  maxPrimary?: number;
};

/** Максимум объектов переднего плана в одной композиции. */
export const MAX_PRIMARY_OBJECTS = 5;

/**
 * Формирует план композиции: главный объект, взаимодополняющие объекты
 * и фоновый объект того же смыслового ряда.
 */
export function selectCompositionPlan(
  result: SemanticMatchResult,
  { size, maxPrimary = MAX_PRIMARY_OBJECTS }: PlanOptions,
): CompositionPlan {
  const relevant = result.candidates.filter((c) => c.component.size === size);
  if (relevant.length === 0) {
    return { items: [], primary: [], background: null, main: null };
  }

  const best = relevant[0].score;
  const cutoff = best * RELEVANCE_CUTOFF;

  const primary: MatchedComponent[] = [];
  const usedCategories = new Set<string>();

  for (const candidate of relevant) {
    const { component } = candidate;
    if (component.role !== "primary") continue;
    if (candidate.score < cutoff) break;
    // Разнообразие: один объект каждой категории, если повтор не разрешён.
    if (!component.allowDuplicate && usedCategories.has(component.sourceIllustrationId)) continue;
    if (primary.some((p) => conflicts(p.component, component))) continue;

    usedCategories.add(component.sourceIllustrationId);
    primary.push(candidate);
    if (primary.length >= maxPrimary) break;
  }

  if (primary.length === 0) {
    return { items: [], primary: [], background: null, main: null };
  }

  const main = primary[0];

  // Фон не должен повторять категорию переднего плана: иначе тот же предмет
  // окажется и основным, и подложкой. Исключение — allowDuplicate у фона.
  const primaryCategories = new Set(primary.map((p) => p.component.sourceIllustrationId));
  const background =
    relevant.find((c) => {
      const { component } = c;
      if (component.role !== "background") return false;
      if (!component.allowDuplicate && primaryCategories.has(component.sourceIllustrationId)) {
        return false;
      }
      return !primary.some((p) => conflicts(p.component, component));
    }) ?? null;

  const items = [...primary];
  if (background) items.push(background);

  return { items, primary, background, main };
}

/** Короткое объяснение выбора компонента. */
export function explainMatch(match: MatchedComponent): string {
  const parts: string[] = [];
  if (match.matchedTerms.length > 0) {
    parts.push(match.matchedTerms.slice(0, 3).join(", "));
  }
  if (match.concepts.length > 0) {
    parts.push(match.concepts.slice(0, 2).join(", "));
  }
  return parts.join(" · ");
}

/** Роли, которые допускаются в автоматической компоновке. */
export const LAYOUT_ROLES: readonly ComponentRole[] = ["primary", "background"];
