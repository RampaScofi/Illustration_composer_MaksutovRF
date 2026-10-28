import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeSvgMetrics, densityToScale } from "../src/lib/svg/metrics.ts";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(
  readFileSync(resolve(root, "public/assets/illustrations/manifest.json"), "utf8"),
);

const rows: string[] = [];
for (const comp of manifest.components) {
  const file = resolve(root, "public", comp.svgPath.replace(/^\//, ""));
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    rows.push(`${comp.id.padEnd(26)} ФАЙЛ НЕ НАЙДЕН ${comp.svgPath}`);
    continue;
  }
  const m = computeSvgMetrics(text);
  const vb = m.viewBox;
  const ink = m.bbox;
  const declared = comp.intrinsicSize;
  const mismatch =
    Math.abs(declared.width - vb.width) > 1 || Math.abs(declared.height - vb.height) > 1;
  rows.push(
    [
      comp.id.padEnd(26),
      `vb=${Math.round(vb.width)}x${Math.round(vb.height)}`,
      mismatch ? `МАНIFEST=${declared.width}x${declared.height}!` : "".padEnd(20),
      `ink=${Math.round(ink.width)}x${Math.round(ink.height)}`,
      `fill=${(m.fillArea / m.bboxArea * 100).toFixed(0)}%`.padEnd(12),
      `stroke=${(m.strokeArea / m.bboxArea * 100).toFixed(0)}%`.padEnd(12),
      `D=${m.density.toFixed(3)}`,
      `scale=${densityToScale(m.density).toFixed(2)}`,
    ].join(" "),
  );
}
console.log(rows.join("\n"));