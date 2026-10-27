import type { CanvasFormatId, CanvasFormat } from "@/types/composition";
import type { ComponentSize } from "@/types/library";
import type { CanvasBackground, ColorSchemeConfig } from "@/types/palette";
import { EmptyState, PanelFrame } from "@/components/panel/PanelFrame";

type SettingsPanelProps = {
  formats: readonly CanvasFormat[];
  activeFormat: CanvasFormatId;
  activeSize: ComponentSize;
  schemes: readonly ColorSchemeConfig[];
  activeScheme: string;
  backgrounds: readonly CanvasBackground[];
  activeBackground: string;
  onSelectFormat: (id: CanvasFormatId) => void;
  onSelectScheme: (id: string) => void;
  onSelectBackground: (id: string) => void;
};

/**
 * Правая панель настроек: формат холста, цветовая схема и фон.
 * Все значения берутся из конфигурации, панель только отображает их
 * и передаёт выбранные идентификаторы наверх.
 */
export function SettingsPanel({
  formats,
  activeFormat,
  activeSize,
  schemes,
  activeScheme,
  backgrounds,
  activeBackground,
  onSelectFormat,
  onSelectScheme,
  onSelectBackground,
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
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
                    format.id === activeFormat
                      ? "bg-zinc-900 text-white"
                      : "text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`shrink-0 rounded-[2px] border ${
                      format.id === activeFormat ? "border-white/70" : "border-zinc-400"
                    }`}
                    style={{
                      width: 18,
                      height: Math.max(6, Math.round((18 * format.height) / format.width)),
                    }}
                  />
                  <span className="flex-1">{format.label}</span>
                  <span
                    className={`text-[10px] tabular-nums ${
                      format.id === activeFormat ? "text-white/70" : "text-zinc-400"
                    }`}
                  >
                    {format.width}×{format.height}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Цветовая схема
          </h3>
          {schemes.length === 0 ? (
            <div className="mt-2">
              <EmptyState message="Схемы не подключены." />
            </div>
          ) : (
            <ul className="mt-2 space-y-1">
              {schemes.map((scheme) => (
                <li key={scheme.id}>
                  <button
                    type="button"
                    onClick={() => onSelectScheme(scheme.id)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
                      scheme.id === activeScheme
                        ? "bg-zinc-900 text-white"
                        : "text-zinc-700 hover:bg-zinc-100"
                    }`}
                  >
                    <span className="flex shrink-0 overflow-hidden rounded-[2px] ring-1 ring-black/10">
                      {[...scheme.background, ...scheme.object].map((hex) => (
                        <span
                          key={hex}
                          style={{ backgroundColor: hex, width: 8, height: 14 }}
                          aria-hidden
                        />
                      ))}
                    </span>
                    <span>{scheme.shortName}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Фон холста
          </h3>
          <div className="mt-2 flex gap-2">
            {backgrounds.map((background) => (
              <button
                key={background.id}
                type="button"
                onClick={() => onSelectBackground(background.id)}
                title={`${background.name} · ${background.hex}`}
                aria-label={`Фон: ${background.name}`}
                aria-pressed={background.id === activeBackground}
                className={`h-12 flex-1 rounded-md border-2 bg-cover bg-center transition ${
                  background.id === activeBackground
                    ? "border-indigo-600"
                    : "border-transparent hover:border-zinc-300"
                }`}
                style={{
                  backgroundColor: background.hex,
                  backgroundImage: background.svgPath
                    ? `url("${background.svgPath}")`
                    : undefined,
                }}
              />
            ))}
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            {backgrounds.find((b) => b.id === activeBackground)?.name ?? "—"} · подложка из Figma
          </p>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Размерный набор
          </h3>
          <p className="mt-2 text-sm text-zinc-700">
            Активный набор: <span className="font-medium">{activeSize}</span>
          </p>
        </div>
      </div>
    </PanelFrame>
  );
}
