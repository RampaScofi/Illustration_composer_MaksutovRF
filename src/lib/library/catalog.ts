import type { LibraryComponent, LibraryManifest } from "@/types/library";

/**
 * Каталог компонентов библиотеки.
 * Отвечает за поиск, фильтрацию и получение по ID.
 * Не выполняет импорт файлов — это делает отдельный модуль библиотеки.
 */
export class ComponentCatalog {
  private components: LibraryComponent[];
  private byId: Map<string, LibraryComponent>;
  private index: Map<string, string[]>;

  constructor(components: LibraryComponent[]) {
    this.components = components;
    this.byId = new Map(components.map((c) => [c.id, c]));
    this.index = this.buildIndex(components);
  }

  /** Получить компонент по ID. Возвращает null если не найден. */
  getById(id: string): LibraryComponent | null {
    return this.byId.get(id) ?? null;
  }

  /** Получить все компоненты. */
  getAll(): LibraryComponent[] {
    return this.components;
  }

  /** Отфильтровать по размеру. */
  filterBySize(size: "L" | "S"): LibraryComponent[] {
    return this.components.filter((c) => c.size === size);
  }

  /** Отфильтровать по роли. */
  filterByRole(role: "primary" | "background" | "backdrop"): LibraryComponent[] {
    return this.components.filter((c) => c.role === role);
  }

  /**
   * Поиск по названию, синонимам и тегам (без AI).
   * Регистронезависимый, поддерживает частичное совпадение.
   * Результаты сортируются: точные совпадения названия → частичные → синонимы → теги.
   */
  search(query: string): LibraryComponent[] {
    if (!query.trim()) return this.components;

    const q = query.trim().toLowerCase();
    const results = new Set<LibraryComponent>();
    const scores = new Map<string, number>();

    for (const comp of this.components) {
      // 1. Название (приоритет 3)
      const nameMatch = comp.name.toLowerCase().includes(q);
      if (nameMatch) {
        results.add(comp);
        scores.set(comp.id, (scores.get(comp.id) ?? 0) + 3);
      }

      // 2. Синонимы (приоритет 2)
      const aliasMatch = comp.aliases.some((a) => a.toLowerCase().includes(q));
      if (aliasMatch) {
        results.add(comp);
        scores.set(comp.id, (scores.get(comp.id) ?? 0) + 2);
      }

      // 3. Теги (приоритет 1)
      const tagMatch = comp.tags.some((t) => t.toLowerCase().includes(q));
      if (tagMatch) {
        results.add(comp);
        scores.set(comp.id, (scores.get(comp.id) ?? 0) + 1);
      }
    }

    return [...results].sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0));
  }

  /**
   * Поиск по тегам (метафоре).
   * Полезно для AI-подбора на следующих этапах.
   */
  findByTags(tags: string[]): LibraryComponent[] {
    const matched = new Map<string, LibraryComponent[]>();
    for (const tag of tags) {
      const t = tag.trim().toLowerCase();
      for (const comp of this.components) {
        if (comp.tags.some((c) => c.toLowerCase() === t)) {
          if (!matched.has(tag)) matched.set(tag, []);
          matched.get(tag)!.push(comp);
        }
      }
    }
    const seen = new Set<string>();
    return [...matched.values()].flat().filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  }

  /** Получить уникальные роли. */
  getRoles(): string[] {
    return [...new Set(this.components.map((c) => c.role))];
  }

  /** Получить уникальные размеры. */
  getSizes(): string[] {
    return [...new Set(this.components.map((c) => c.size))];
  }

  /** Проверить наличие компонента по ID. */
  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** Подсчёт. */
  count(): number {
    return this.components.length;
  }

  /** Подсчёт по размеру. */
  countBySize(size: "L" | "S"): number {
    return this.components.filter((c) => c.size === size).length;
  }

  /** Подсчёт по роли. */
  countByRole(role: string): number {
    return this.components.filter((c) => c.role === role).length;
  }

  /** Получить уникальные схемы (цвета). */
  getSchemeIds(): string[] {
    const ids = new Set<string>();
    for (const comp of this.components) {
      for (const s of comp.schemes) ids.add(s);
    }
    return [...ids];
  }

  /** Получить список всех тегов (для автодополнения). */
  getAllTags(): string[] {
    const all = new Set<string>();
    for (const comp of this.components) {
      for (const t of comp.tags) all.add(t);
    }
    return [...all].sort();
  }

  private buildIndex(components: LibraryComponent[]): Map<string, string[]> {
    const index = new Map<string, string[]>();
    for (const comp of components) {
      const keys = [...comp.aliases, ...comp.tags, comp.name.toLowerCase()];
      for (const key of keys) {
        const k = key.toLowerCase();
        if (!index.has(k)) index.set(k, []);
        const arr = index.get(k)!;
        if (!arr.includes(comp.id)) arr.push(comp.id);
      }
    }
    return index;
  }
}

/** Загрузить манифест из URL. */
export async function loadManifest(url: string): Promise<LibraryManifest> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load manifest: ${res.status} ${res.statusText}`);
  return res.json() as Promise<LibraryManifest>;
}

/** Создать каталог из манифеста. */
export function createCatalog(manifest: LibraryManifest): ComponentCatalog {
  return new ComponentCatalog(manifest.components);
}

/** Создать пустой каталог (до импорта библиотеки). */
export function emptyCatalog(): ComponentCatalog {
  return new ComponentCatalog([]);
}
