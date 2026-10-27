"use client";

import type { CompositionElement } from "@/types/composition";
import type { LibraryComponent } from "@/types/library";
import { PanelFrame } from "@/components/panel/PanelFrame";

type Props = {
  elements: CompositionElement[];
  components: Map<string, LibraryComponent>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSwapUp: (id: string) => void;
  onSwapDown: (id: string) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
};

export function LayersPanel({
  elements,
  components,
  selectedId,
  onSelect,
  onSwapUp,
  onSwapDown,
  onBringToFront,
  onSendToBack,
  onToggleVisibility,
  onDuplicate,
  onRemove,
}: Props) {
  const sorted = [...elements].sort((a, b) => b.z - a.z);

  return (
    <PanelFrame title="Слои" hint="Порядок отрисовки сверху вниз">
      {sorted.length === 0 ? (
        <p className="text-xs text-zinc-400">Холст пуст — добавьте компоненты.</p>
      ) : (
        <ul className="space-y-1">
          {sorted.map((el) => {
            const comp = components.get(el.componentId);
            const name = comp?.nameConfirmed ? comp.name : "?";
            const isSelected = el.instanceId === selectedId;
            return (
              <li
                key={el.instanceId}
                className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
                  isSelected ? "bg-indigo-50 ring-1 ring-indigo-300" : "hover:bg-zinc-50"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onToggleVisibility(el.instanceId)}
                  className="shrink-0 text-zinc-400 hover:text-zinc-600"
                  title={el.visible ? "Скрыть" : "Показать"}
                >
                  {el.visible ? "👁" : "—"}
                </button>
                <button
                  type="button"
                  onClick={() => onSelect(el.instanceId)}
                  className="min-w-0 flex-1 truncate text-left text-zinc-700"
                >
                  {name}
                </button>
                <div className="flex shrink-0 gap-0.5">
                  <button type="button" onClick={() => onSendToBack(el.instanceId)} title="На задний план" className="rounded px-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">⤓</button>
                  <button type="button" onClick={() => onSwapDown(el.instanceId)} title="Вниз" className="rounded px-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">↓</button>
                  <button type="button" onClick={() => onSwapUp(el.instanceId)} title="Вверх" className="rounded px-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">↑</button>
                  <button type="button" onClick={() => onBringToFront(el.instanceId)} title="На передний план" className="rounded px-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">⤒</button>
                  <button type="button" onClick={() => onDuplicate(el.instanceId)} title="Дублировать" className="rounded px-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">⧉</button>
                  <button type="button" onClick={() => onRemove(el.instanceId)} title="Удалить" className="rounded px-1 text-zinc-400 hover:bg-red-50 hover:text-red-600">✕</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PanelFrame>
  );
}
