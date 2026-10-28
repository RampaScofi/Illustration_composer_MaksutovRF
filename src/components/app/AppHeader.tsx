/** Верхняя строка приложения. */
export function AppHeader() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-white px-4 py-3">
      <div className="flex items-baseline gap-3">
        <h1 className="text-base font-semibold tracking-tight text-zinc-900">VectorMuse</h1>
        <p className="hidden text-xs text-zinc-500 sm:block">
          Конструктор иллюстраций из готовых SVG-компонентов
        </p>
      </div>
    </header>
  );
}
