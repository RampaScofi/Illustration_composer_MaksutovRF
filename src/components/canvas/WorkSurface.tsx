"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import type { CompositionElement } from "@/types/composition";
import type { Size } from "@/types/geometry";
import type { LibraryComponent } from "@/types/library";
import { fitCanvas } from "@/lib/composition/canvas";

type Props = {
  canvasSize: Size;
  elements: CompositionElement[];
  components: Map<string, LibraryComponent>;
  svgContents: Map<string, string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, w: number, h: number) => void;
  onRotate: (id: string, deg: number) => void;
  background: string;
  /** Компонент-подложка из библиотеки Figma (role: backdrop). */
  backdropId?: string | null;
};

type DragState = {
  mode: "move" | "resize" | "rotate";
  instanceId: string;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
  origRot: number;
};

function extractInner(svg: string): string {
  const m = /<svg[^>]*>([\s\S]*?)<\/svg>/i.exec(svg);
  return m ? m[1].trim() : "";
}

function applyIdPrefix(inner: string, prefix: string): string {
  return inner
    .replace(/\sid="([^"]+)"/g, (_m, id: string) => `id="${prefix}__${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_m, ref: string) => `url(#${prefix}__${ref})`);
}

function buildTransform(el: CompositionElement, comp: LibraryComponent): string {
  const sx = el.size.width / comp.intrinsicSize.width;
  const sy = el.size.height / comp.intrinsicSize.height;
  const scale = Math.min(sx, sy);
  const w = comp.intrinsicSize.width * scale;
  const h = comp.intrinsicSize.height * scale;
  const ox = el.position.x + (el.size.width - w) / 2;
  const oy = el.position.y + (el.size.height - h) / 2;
  const cx = el.position.x + el.size.width / 2;
  const cy = el.position.y + el.size.height / 2;
  const parts = [`translate(${cx},${cy})`];
  if (el.rotation !== 0) parts.push(`rotate(${el.rotation})`);
  parts.push(`translate(${-cx},${-cy})`);
  parts.push(`translate(${ox},${oy})`);
  parts.push(`scale(${scale})`);
  return parts.join(" ");
}

export function WorkSurface({
  canvasSize,
  elements,
  components,
  svgContents,
  selectedId,
  onSelect,
  onMove,
  onResize,
  onRotate,
  background,
  backdropId = null,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Size | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  // Видимая область холста масштабируется как object-fit: contain —
  // пропорции формата сохраняются, растягивания по одной оси нет.
  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;

    const update = () => {
      setViewport({ width: node.clientWidth, height: node.clientHeight });
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fitted = viewport ? fitCanvas(viewport, canvasSize) : null;
  const displayWidth = fitted && fitted.width > 0 ? fitted.width : undefined;
  const displayHeight = fitted && fitted.height > 0 ? fitted.height : undefined;

  const toSvg = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return { x: 0, y: 0 };
      const p = pt.matrixTransform(ctm.inverse());
      return { x: p.x, y: p.y };
    },
    [],
  );

  const startDrag = useCallback(
    (e: React.MouseEvent, instanceId: string, mode: DragState["mode"]) => {
      e.stopPropagation();
      e.preventDefault();
      onSelect(instanceId);
      const el = elements.find((x) => x.instanceId === instanceId);
      if (!el) return;
      const { x, y } = toSvg(e.clientX, e.clientY);
      const state: DragState = {
        mode,
        instanceId,
        startX: x,
        startY: y,
        origX: el.position.x,
        origY: el.position.y,
        origW: el.size.width,
        origH: el.size.height,
        origRot: el.rotation,
      };
      dragRef.current = state;
      setDrag(state);
    },
    [elements, onSelect, toSvg],
  );

  useEffect(() => {
    if (!drag) return;

    const onMove_ = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const { x, y } = toSvg(e.clientX, e.clientY);
      const dx = x - d.startX;
      const dy = y - d.startY;

      if (d.mode === "move") {
        onMove(d.instanceId, d.origX + dx, d.origY + dy);
      } else if (d.mode === "resize") {
        const el = elements.find((x) => x.instanceId === d.instanceId);
        const comp = el ? components.get(el.componentId) : null;
        if (!el || !comp) return;
        const aspect = comp.intrinsicSize.width / comp.intrinsicSize.height;
        const rawW = Math.max(20, d.origW + dx);
        const rawH = Math.max(20, d.origH + dy);
        const newW = Math.max(rawW, rawH * aspect);
        onResize(d.instanceId, newW, newW / aspect);
      } else if (d.mode === "rotate") {
        const el = elements.find((x) => x.instanceId === d.instanceId);
        if (!el) return;
        const cx = el.position.x + el.size.width / 2;
        const cy = el.position.y + el.size.height / 2;
        const angle = (Math.atan2(y - cy, x - cx) * 180) / Math.PI + 90;
        onRotate(d.instanceId, Math.round(angle));
      }
    };

    const onUp = () => {
      dragRef.current = null;
      setDrag(null);
    };

    window.addEventListener("mousemove", onMove_);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove_);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag, elements, components, toSvg, onMove, onResize, onRotate]);

  const visible = [...elements].filter((e) => e.visible).sort((a, b) => a.z - b.z);
  const selected = elements.find((e) => e.instanceId === selectedId);

  // Декоративная подложка: SVG из библиотеки Figma, вписанный по принципу
  // cover (slice) — рисунок заполняет холст любого формата без растяжения.
  const backdropComponent = backdropId ? components.get(backdropId) : null;
  const backdropRaw = backdropId ? svgContents.get(backdropId) : null;
  const backdropInner =
    backdropComponent && backdropRaw
      ? applyIdPrefix(extractInner(backdropRaw), "backdrop")
      : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-100">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-2 text-xs text-zinc-500">
        <span>Холст {canvasSize.width} × {canvasSize.height}</span>
        <span>Элементов: {elements.length}</span>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4 sm:p-6">
        <div
          ref={viewportRef}
          className="flex h-full w-full items-center justify-center"
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
            preserveAspectRatio="xMidYMid meet"
            width={displayWidth}
            height={displayHeight}
            className="block rounded shadow ring-1 ring-zinc-300"
            style={{
              width: displayWidth,
              height: displayHeight,
              maxWidth: "100%",
              maxHeight: "100%",
            }}
            onMouseDown={() => onSelect(null)}
          >
            <rect
              x={0}
              y={0}
              width={canvasSize.width}
              height={canvasSize.height}
              fill={background}
            />
            {backdropInner && backdropComponent ? (
              <svg
                x={0}
                y={0}
                width={canvasSize.width}
                height={canvasSize.height}
                viewBox={`0 0 ${backdropComponent.intrinsicSize.width} ${backdropComponent.intrinsicSize.height}`}
                preserveAspectRatio="xMidYMid slice"
                style={{ pointerEvents: "none" }}
                aria-hidden
              >
                <g dangerouslySetInnerHTML={{ __html: backdropInner }} />
              </svg>
            ) : null}
          {visible.map((el) => {
            const comp = components.get(el.componentId);
            const raw = svgContents.get(el.componentId);
            if (!comp || !raw) return null;
            const inner = applyIdPrefix(extractInner(raw), `d_${el.instanceId}`);
            const transform = buildTransform(el, comp);
            return (
              <g
                key={el.instanceId}
                transform={transform}
                style={{ cursor: "move" }}
                onMouseDown={(e) => startDrag(e, el.instanceId, "move")}
              >
                <g dangerouslySetInnerHTML={{ __html: inner }} />
              </g>
            );
          })}

          {selected && (
            <g
              transform={`translate(${selected.position.x + selected.size.width / 2},${selected.position.y + selected.size.height / 2}) rotate(${selected.rotation}) translate(${-selected.position.x - selected.size.width / 2},${-selected.position.y - selected.size.height / 2})`}
              style={{ pointerEvents: "none" }}
            >
              <rect
                x={selected.position.x}
                y={selected.position.y}
                width={selected.size.width}
                height={selected.size.height}
                fill="none"
                stroke="#4f46e5"
                strokeWidth={2}
                strokeDasharray="6 3"
              />
              <rect
                x={selected.position.x + selected.size.width - 6}
                y={selected.position.y + selected.size.height - 6}
                width={12}
                height={12}
                fill="white"
                stroke="#4f46e5"
                strokeWidth={2}
                rx={2}
                style={{ pointerEvents: "all", cursor: "nwse-resize" }}
                onMouseDown={(e) => startDrag(e, selected.instanceId, "resize")}
              />
              <line
                x1={selected.position.x + selected.size.width / 2}
                y1={selected.position.y}
                x2={selected.position.x + selected.size.width / 2}
                y2={selected.position.y - 32}
                stroke="#4f46e5"
                strokeWidth={1.5}
              />
              <circle
                cx={selected.position.x + selected.size.width / 2}
                cy={selected.position.y - 32}
                r={7}
                fill="white"
                stroke="#4f46e5"
                strokeWidth={2}
                style={{ pointerEvents: "all", cursor: "grab" }}
                onMouseDown={(e) => startDrag(e, selected.instanceId, "rotate")}
              />
            </g>
          )}

          {elements.length === 0 && (
            <text
              x={canvasSize.width / 2}
              y={canvasSize.height / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#a1a1aa"
              fontSize={Math.round(Math.min(canvasSize.width, canvasSize.height) / 18)}
            >
              Выберите компонент из библиотеки
            </text>
          )}
          </svg>
        </div>
      </div>
    </div>
  );
}
