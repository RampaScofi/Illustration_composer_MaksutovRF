import type { ComponentSize, LibraryComponent } from "@/types/library";
import { EmptyState, PanelFrame } from "@/components/panel/PanelFrame";

type LibraryPanelProps = {
  components: LibraryComponent[];
  activeSize: ComponentSize;
  notice: string | null;
};

const SIZE_LABEL: Record<ComponentSize, string> = {
  L: "L — полная детализация",
  S: "S — упрощённая детализация",
};

/**
 * Левая панель: список компонентов библиотеки с фильтром по размерному набору.
 * Панель презентационная — состояние подключается на этапе сборки редактора.
 */
export function LibraryPanel({ components, activeSize, notice }: LibraryPanelProps) {
  const visible = components.filter((component) => component.size === activeSize);

  return (
    <PanelFrame
      title="Библиотека компонентов"
      hint={`Размерный набор: ${SIZE_LABEL[activeSize]}`}
      className="border-r"
    >
      {notice ? <EmptyState message={notice} /> : null}

      {notice === null && visible.length === 0 ? (
        <EmptyState message="В выбранном размерном наборе нет компонентов." />
      ) : null}

      {visible.length > 0 ? (
        <ul className="space-y-1">
          {visible.map((component) => (
            <li
              key={component.id}
              className="flex items-baseline justify-between gap-2 rounded px-2 py-1.5 text-sm text-zinc-800 hover:bg-zinc-100"
            >
              <span className="truncate">{component.name}</span>
              <span className="shrink-0 text-[11px] uppercase tracking-wide text-zinc-400">
                {component.role === "primary" ? "объект" : "фон"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </PanelFrame>
  );
}
