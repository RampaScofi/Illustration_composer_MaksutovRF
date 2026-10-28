// Временный инструмент: печатает реальные боксы автокомпоновки для запроса.
import { readFileSync } from "node:fs";
import { matchComponents, selectCompositionPlan } from "../src/lib/semantic/matcher.ts";
import { layoutItemFromComponent } from "../src/lib/library/layoutMetadata.ts";
import { buildAutoLayout } from "../src/lib/composition/autoLayout.ts";
import { resolveCanvasSize } from "../src/lib/composition/canvas.ts";

const manifest = JSON.parse(readFileSync("public/assets/illustrations/manifest.json", "utf8"));
const query = process.argv[2] || "Планшеты для онлайн обучения. Телефон и наушники";
const format = process.argv[3] || "4:3";

const canvas = resolveCanvasSize(format);
const res = matchComponents(query, manifest.components);
const plan = selectCompositionPlan(res, { size: "L" });
const items = plan.items.map((i) => layoutItemFromComponent(i.component));

console.log(`Формат ${format} ${canvas.width}x${canvas.height}`);
console.log("Подбор:", items.map((i) => `${i.componentId} [${i.role}] ${i.intrinsic.width}x${i.intrinsic.height}`).join(", "));

for (let seed = 1; seed <= 6; seed += 1) {
  const el = buildAutoLayout(items, { canvas, seed });
  console.log(`\n--- seed ${seed} ---`);
  for (const e of el) {
    const comp = manifest.components.find((c) => c.id === e.componentId);
    const area = (e.size.width * e.size.height) / (canvas.width * canvas.height) * 100;
    console.log(
      `  ${e.componentId.padEnd(24)} ${String(comp?.role).padEnd(10)} ` +
        `pos=${Math.round(e.position.x)},${Math.round(e.position.y)} ` +
        `size=${Math.round(e.size.width)}x${Math.round(e.size.height)} ` +
        `площадь=${area.toFixed(1)}% холста rot=${Math.round(e.rotation)}`,
    );
  }
  // Парные перекрытия.
  for (let i = 0; i < el.length; i += 1) {
    for (let j = i + 1; j < el.length; j += 1) {
      const a = el[i], b = el[j];
      const w = Math.min(a.position.x + a.size.width, b.position.x + b.size.width) - Math.max(a.position.x, b.position.x);
      const h = Math.min(a.position.y + a.size.height, b.position.y + b.size.height) - Math.max(a.position.y, b.position.y);
      if (w > 0 && h > 0) {
        const smaller = Math.min(a.size.width * a.size.height, b.size.width * b.size.height);
        console.log(`    ПЕРЕКРЫТИЕ ${a.componentId} ↔ ${b.componentId}: ${Math.round(w)}x${Math.round(h)} = ${((w * h) / smaller * 100).toFixed(0)}% меньшего`);
      }
    }
  }
}
