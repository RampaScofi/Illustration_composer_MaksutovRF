import type { ReactNode } from "react";

type PanelFrameProps = {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
};

/** Каркас боковой панели: заголовок, пояснение и содержимое. */
export function PanelFrame({ title, hint, children, className = "" }: PanelFrameProps) {
  return (
    <section
      aria-label={title}
      className={`flex min-h-0 flex-col border-zinc-200 bg-white ${className}`}
    >
      <header className="border-b border-zinc-200 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight text-zinc-900">{title}</h2>
        {hint ? <p className="mt-1 text-xs leading-5 text-zinc-500">{hint}</p> : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
    </section>
  );
}

/** Пустое состояние панели без декоративных иллюстраций. */
export function EmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-3 py-4 text-xs leading-5 text-zinc-600">
      {message}
    </p>
  );
}
