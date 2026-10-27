import type { Composition, CompositionElement } from "@/types/composition";
import type { LibraryComponent } from "@/types/library";
import type { Point } from "@/types/geometry";

/**
 * Менеджер состояния композиции.
 * Управляет экземплярами компонентов, порядком слоёв, трансформациями.
 * Не зависит от React — чистая бизнес-логика.
 */
export class CompositionManager {
  private composition: Composition;
  private components: Map<string, LibraryComponent>;
  private nextInstanceId = 1;

  constructor(components: Map<string, LibraryComponent>, initial?: Partial<Composition>) {
    this.components = components;
    this.composition = {
      id: "draft",
      title: "Черновик",
      format: "16:9",
      componentSize: "L",
      colorSchemeId: null,
      elements: [],
      ...initial,
    };
    this.nextInstanceId = this.composition.elements.reduce((max, el) => {
      const n = parseInt(el.instanceId.replace(/\D/g, ""), 10) || 0;
      return Math.max(max, n);
    }, 0) + 1;
  }

  getComposition(): Composition {
    return this.composition;
  }

  getElements(): CompositionElement[] {
    return this.composition.elements;
  }

  getElement(instanceId: string): CompositionElement | null {
    return this.composition.elements.find((e) => e.instanceId === instanceId) ?? null;
  }

  /** Добавить компонент на холст. Возвращает instanceId нового экземпляра. */
  addComponent(componentId: string, position: Point, size?: { width: number; height: number }): string | null {
    const comp = this.components.get(componentId);
    if (!comp) return null;

    const instanceId = `i${this.nextInstanceId++}`;
    const defaultSize = size ?? {
      width: Math.min(comp.intrinsicSize.width, 300),
      height: Math.min(comp.intrinsicSize.height, 300),
    };

    const maxZ = this.composition.elements.reduce((max, e) => Math.max(max, e.z), 0);

    this.composition.elements.push({
      instanceId,
      componentId,
      position: { x: position.x, y: position.y },
      size: defaultSize,
      rotation: 0,
      z: maxZ + 1,
      visible: true,
    });

    return instanceId;
  }

  /** Дублировать экземпляр. Смещает копию на 20px. */
  duplicate(instanceId: string): string | null {
    const src = this.getElement(instanceId);
    if (!src) return null;

    const newId = `i${this.nextInstanceId++}`;
    const maxZ = this.composition.elements.reduce((max, e) => Math.max(max, e.z), 0);

    this.composition.elements.push({
      ...src,
      instanceId: newId,
      position: { x: src.position.x + 20, y: src.position.y + 20 },
      z: maxZ + 1,
    });

    return newId;
  }

  /** Удалить экземпляр. */
  remove(instanceId: string): boolean {
    const idx = this.composition.elements.findIndex((e) => e.instanceId === instanceId);
    if (idx < 0) return false;
    this.composition.elements.splice(idx, 1);
    return true;
  }

  /** Переместить экземпляр. */
  move(instanceId: string, position: Point): void {
    const el = this.getElement(instanceId);
    if (el) {
      el.position = { x: position.x, y: position.y };
    }
  }

  /** Установить размер экземпляра. */
  resize(instanceId: string, size: { width: number; height: number }): void {
    const el = this.getElement(instanceId);
    if (el) {
      el.size = size;
    }
  }

  /** Установить угол поворота в градусах. */
  rotate(instanceId: string, rotation: number): void {
    const el = this.getElement(instanceId);
    if (el) {
      el.rotation = ((rotation % 360) + 360) % 360;
    }
  }

  /** Поднять слой на один вверх. */
  bringForward(instanceId: string): void {
    const sorted = [...this.composition.elements].sort((a, b) => a.z - b.z);
    const idx = sorted.findIndex((e) => e.instanceId === instanceId);
    if (idx < 0 || idx >= sorted.length - 1) return;
    const cur = sorted[idx];
    const above = sorted[idx + 1];
    const tmp = cur.z;
    cur.z = above.z;
    above.z = tmp;
  }

  /** Опустить слой на один вниз. */
  sendBackward(instanceId: string): void {
    const sorted = [...this.composition.elements].sort((a, b) => a.z - b.z);
    const idx = sorted.findIndex((e) => e.instanceId === instanceId);
    if (idx <= 0) return;
    const cur = sorted[idx];
    const below = sorted[idx - 1];
    const tmp = cur.z;
    cur.z = below.z;
    below.z = tmp;
  }

  /** На передний план. */
  bringToFront(instanceId: string): void {
    const el = this.getElement(instanceId);
    if (!el) return;
    const maxZ = this.composition.elements.reduce((max, e) => Math.max(max, e.z), 0);
    el.z = maxZ + 1;
  }

  /** На задний план. */
  sendToBack(instanceId: string): void {
    const el = this.getElement(instanceId);
    if (!el) return;
    const minZ = this.composition.elements.reduce((min, e) => Math.min(min, e.z), Infinity);
    el.z = minZ - 1;
  }

  /** Установить формат холста. */
  setFormat(format: Composition["format"]): void {
    this.composition.format = format;
  }

  /** Установить размерный набор. */
  setComponentSize(size: Composition["componentSize"]): void {
    this.composition.componentSize = size;
  }

  /** Переключить видимость экземпляра. */
  toggleVisibility(instanceId: string): void {
    const el = this.getElement(instanceId);
    if (el) el.visible = !el.visible;
  }

  /** Очистить все экземпляры. */
  clear(): void {
    this.composition.elements = [];
    this.nextInstanceId = 1;
  }
}
