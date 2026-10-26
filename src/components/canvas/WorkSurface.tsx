import type { CanvasFormat } from "@/types/composition";
import type { CompositionElement } from "@/types/composition";

type WorkSurfaceProps = {
  format: CanvasFormat;
  elements: CompositionElement[];
};

/**
 * Центральная рабочая область.
 * Холст — настоящий SVG-документ: рамка рисуется вектором, границы
 * соответствуют экспортируемому формату. Компоненты библиотеки
 * добавляются в <g> слои на этапе сборки редактора.
 */
export function WorkSurface({ format, elements }: WorkSurfaceProps) {
  const { width, height } = format;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-100">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-2 text-xs text-zinc-500">
        <span>
          Холст {format.id} · {width} × {height}
        </span>
        <span>Элементов: {elements.length}</span>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center p-4 sm:p-8">
        <svg
          role="img"
          aria-label={`Холст формата ${format.label}`}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-auto max-h-full w-full max-w-full bg-white shadow-sm ring-1 ring-zinc-300"
          style={{ aspectRatio: `${width} / ${height}` }}
        >
          <rect
            x={0.5}
            y={0.5}
            width={width - 1}
            height={height - 1}
            fill="none"
            stroke="#d4d4d9"
            strokeWidth={Math.max(2, Math.round(width / 400))}
            strokeDasharray={`${Math.round(width / 60)} ${Math.round(width / 60)}`}
          />
          <text
            x={width / 2}
            y={height / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#a1a1aa"
            fontSize={Math.round(Math.min(width, height) / 18)}
          >
            {elements.length === 0 ? "Композиция пока пуста" : `Элементов: ${elements.length}`}
          </text>
        </svg>
      </div>
    </div>
  );
}
