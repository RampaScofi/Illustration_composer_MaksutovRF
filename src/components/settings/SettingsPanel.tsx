import type { CanvasFormatId, CanvasFormat } from "@/types/composition";
import type { ComponentSize } from "@/types/library";
import { EmptyState, PanelFrame } from "@/components/panel/PanelFrame";

type SettingsPanelProps = {
  formats: readonly CanvasFormat[];
  activeFormat: CanvasFormatId;
  activeSize: ComponentSize;
  schemeCount: number;
  onSelectFormat: (id: CanvasFormatId) => void;
};

/**
 * Правая панель настроек: формат холста, размерный набор, цветовая схема.
 * Переключатели пока отображаются как список значений; управляющая логика
 * добавляется на этапе редактора, здесь фиксируется только состав настроек.
 */
export function SettingsPanel({
  formats,
  activeFormat,
  activeSize,
  schemeCount,
  onSelectFormat,
}: SettingsPanelProps) {
  return (
    <PanelFrame title="Настройки" hint="Параметры итоговой композиции" className="border-l">
      <div className="space-y-5">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Формат холста
          </h3>
          <ul className="mt-2 space-y-1">
            {formats.map((format) => (
              <li key={format.id}>
                <button
                  type="button"
                  onClick={() => onSelectFormat(format.id)}
                  className={`w-full rounded px-2 py-1.5 text-left text-sm ${
                    format.id === activeFormat
                      ? "bg-zinc-900 text-white"
                      : "text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  {format.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Размерный набор
          </h3>
          <p className="mt-2 text-sm text-zinc-700">
            Активный набор:{" "}
            <span className="font-medium">{activeSize}</span>
          </p>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Цветовая схема
          </h3>
          {schemeCount === 0 ? (
            <div className="mt-2">
              <EmptyState message="Схемы подключаются вместе с экспортом библиотеки (в исходнике их три)." />
            </div>
          ) : (
            <p className="mt-2 text-sm text-zinc-700">Доступно схем: {schemeCount}</p>
          )}
        </div>
      </div>
    </PanelFrame>
  );
}
