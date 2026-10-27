import type { Point, Rotation, Size } from "./geometry";
import type { ComponentSize } from "./library";

/** Формат итогового холста. */
export type CanvasFormatId = "16:9" | "4:3" | "1:1" | "4:5" | "9:16" | "3:1";

export type CanvasFormat = {
  id: CanvasFormatId;
  label: string;
  width: number;
  height: number;
};

/**
 * Экземпляр компонента на холсте.
 * Позиция и размер задаются трансформацией <g>, сам векторный объект не редактируется.
 */
export type CompositionElement = {
  /** Идентификатор экземпляра внутри композиции. */
  instanceId: string;
  /** Ссылка на LibraryComponent.id. */
  componentId: string;
  position: Point;
  /** Размер экземпляра; пропорции исходника сохраняются. */
  size: Size;
  rotation: Rotation;
  /** Порядок отрисовки: меньшие значения ниже. */
  z: number;
  visible: boolean;
};

export type Composition = {
  id: string;
  title: string;
  format: CanvasFormatId;
  /** Размерный набор компонентов, из которого собрана сцена. */
  componentSize: ComponentSize;
  colorSchemeId: string | null;
  elements: CompositionElement[];
};
