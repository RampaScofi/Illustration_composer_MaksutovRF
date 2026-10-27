/**
 * Нормализация русскоязычного запроса для локального подбора.
 *
 * Механизм словарный и предсказуемый: никаких сетевых вызовов и моделей.
 * Приведение регистра, замена «ё» на «е», удаление пунктуации и лёгкое
 * усечение окончаний дают устойчивое совпадение форм слова
 * («обучение» / «обучения» / «обучению»).
 */

const PUNCTUATION = /[^\p{L}\p{N}\s-]+/gu;
const DASHES = /[-–—]+/g;
const SPACES = /\s+/g;

/** Служебные слова, не несущие смысла для подбора. */
const STOP_WORDS = new Set([
  "и",
  "в",
  "во",
  "на",
  "с",
  "со",
  "по",
  "для",
  "от",
  "до",
  "из",
  "к",
  "ко",
  "о",
  "об",
  "про",
  "как",
  "что",
  "это",
  "или",
  "а",
  "но",
  "же",
  "ли",
  "бы",
  "не",
  "ни",
  "у",
  "за",
  "под",
  "над",
  "при",
  "без",
  "через",
  "между",
  "также",
  "очень",
  "самый",
  "свой",
  "весь",
  "все",
  "всё",
  "мне",
  "мой",
  "мы",
  "вы",
  "он",
  "она",
  "они",
  "его",
  "ее",
  "их",
  "чтобы",
  "когда",
  "где",
  "который",
  "которая",
  "которые",
]);

/**
 * Окончания, которые отбрасываются при грубом стемминге.
 * Отсортированы от длинных к коротким, чтобы срезалось самое длинное.
 */
const ENDINGS = [
  "иями",
  "ями",
  "ами",
  "ов",
  "ев",
  "ей",
  "ой",
  "ий",
  "ый",
  "ая",
  "ое",
  "ые",
  "ие",
  "ую",
  "юю",
  "ия",
  "ии",
  "ам",
  "ям",
  "ах",
  "ях",
  "ом",
  "ем",
  "ы",
  "и",
  "а",
  "я",
  "у",
  "ю",
  "е",
  "о",
  "ь",
];

/** Нижний регистр, «ё» → «е», пунктуация → пробел. */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(DASHES, " ")
    .replace(PUNCTUATION, " ")
    .replace(SPACES, " ")
    .trim();
}

/**
 * Лёгкий стемминг: срезает одно окончание, если основа остаётся не короче
 * трёх символов. Полноценной морфологией не является и не претендует на неё.
 */
export function stemWord(word: string): string {
  const value = normalizeText(word);
  if (value.length <= 3) return value;

  for (const ending of ENDINGS) {
    if (value.length - ending.length < 3) continue;
    if (value.endsWith(ending)) {
      return value.slice(0, value.length - ending.length);
    }
  }

  return value;
}

/** Разбивает запрос на значимые основы слов. */
export function tokenize(input: string): string[] {
  const normalized = normalizeText(input);
  if (!normalized) return [];

  const tokens: string[] = [];
  for (const raw of normalized.split(" ")) {
    if (!raw || STOP_WORDS.has(raw)) continue;
    const stem = stemWord(raw);
    if (!stem || STOP_WORDS.has(stem)) continue;
    if (!tokens.includes(stem)) tokens.push(stem);
  }
  return tokens;
}

export { STOP_WORDS };
