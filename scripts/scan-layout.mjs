// Временный инструмент: сканирует запросы и ищет, где background-компонент
// занимает подавляющую часть холста (механизм «огромного контура лампы»).
import { readFileSync } from "node:fs";
import { matchComponents, selectCompositionPlan } from "../src/lib/semantic/matcher.ts";
import { layoutItemFromComponent } from "../src/lib/library/layoutMetadata.ts";
import { buildAutoLayout } from "../src/lib/composition/autoLayout.ts";
import { resolveCanvasSize } from "../src/lib/composition/canvas.ts";

const manifest = JSON.parse(readFileSync("public/assets/illustrations/manifest.json", "utf8"));
const byId = new Map(manifest.components.map((c) => [c.id, c]));

const QUERIES = [
  "Идеи превращаются в результат",
  "Планшеты для онлайн обучения. Телефон и наушники – современные инструменты для подкастов, лекций и концентрации.",
  "Гаджеты для онлайн обучения",
  "Технологии и коммуникация",
  "Обучение и саморазвитие",
  "Работа и продуктивность",
  "Знания и развитие",
  "Светлая идея для проекта",
  "Лампа вдохновения",
];

const rows = [];
for (const q of QUERIES) {
  for (const fmt of ["4:3", "1:1", "9:16"]) {
    const canvas = resolveCanvasSize(fmt);
    const plan = selectCompositionPlan(matchComponents(q, manifest.components), { size: "L" });
    if (!plan.items.length) continue;
    const items = plan.items.map(layoutItemFromComponent);
    let worstBg = null, worstPair = null, mainShare = 0;
    for (let seed = 1; seed <= 12; seed += 1) {
      const el = buildAutoLayout(items, { canvas, seed });
      const canvasArea = canvas.width * canvas.height;
      for (const e of el) {
        const share = (e.size.width * e.size.height) / canvasArea;
        if (byId.get(e.componentId)?.role === "background" && (!worstBg || share > worstBg.share)) {
          worstBg = { id: e.componentId, share };
        }
        if (byId.get(e.componentId)?.role === "primary" && (!worstPair || true)) {
          if (share > mainShare) { mainShare = share; }
        }
      }
      for (let i = 0; i < el.length; i++) for (let j = i + 1; j < el.length; j++) {
        if (byId.get(el[i].componentId)?.role === "background") continue;
        if (byId.get(el[j].componentId)?.role === "background") continue;
        const a = el[i], b = el[j];
        const w = Math.min(a.position.x + a.size.width, b.position.x + b.size.width) - Math.max(a.position.x, b.position.x);
        const h = Math.min(a.position.y + a.size.height, b.position.y + b.size.height) - Math.max(a.position.y, b.position.y);
        if (w > 0 && h > 0) {
          const smaller = Math.min(a.size.width * a.size.height, b.size.width * b.size.height);
          const r = (w * h) / smaller;
          if (!worstPair || r > worstPair.r) worstPair = { r, a: a.componentId, b: b.componentId };
        }
      }
    }
    rows.push({
      q: q.slice(0, 34),
      fmt,
      plan: plan.items.map((i) => `${i.component.name}(${i.component.role[0]})`).join(" "),
      "bg%": worstBg ? (worstBg.share * 100).toFixed(0) : "-",
      "maxPrimary%": (mainShare * 100).toFixed(0),
      "overlap%": worstPair ? (worstPair.r * 100).toFixed(0) : "-",
    });
  }
}
console.table(rows);
