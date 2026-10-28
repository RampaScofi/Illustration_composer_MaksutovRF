import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeSvgMetrics } from "../src/lib/svg/metrics.ts";

/**
 * Плотность графики пишется в манифест как contentDensity, а не считается в
 * браузере: значения проверяемы, а компоновка остаётся детерминированной.
 */
const root = resolve(import.meta.dirname, "..");
const manifestPath = resolve(root, "public/assets/illustrations/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

let changed = 0;
for (const comp of manifest.components) {
  const file = resolve(root, "public", comp.svgPath.replace(/^\//, ""));
  const metrics = computeSvgMetrics(readFileSync(file, "utf8"));
  const density = Number(metrics.density.toFixed(3));
  if (comp.contentDensity !== density) {
    comp.contentDensity = density;
    changed += 1;
  }
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`contentDensity обновлён у ${changed} компонентов из ${manifest.components.length}`);