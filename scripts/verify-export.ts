import { readFileSync } from "node:fs";

import { buildCompositionSvg } from "../src/lib/composition/exportSvg.ts";
import type { LibraryComponent, LibraryManifest } from "../src/types/library.ts";
import type { CompositionElement } from "../src/types/composition.ts";

// Сквозная проверка реального экспорта поверх фактической библиотеки.
const manifest = JSON.parse(
  readFileSync("public/assets/illustrations/manifest.json", "utf8"),
) as LibraryManifest;
const components = new Map<string, LibraryComponent>(
  manifest.components.map((c) => [c.id, c]),
);
const picked = manifest.components.slice(0, 6);
const contents = new Map<string, string>();
for (const c of picked) {
  contents.set(c.id, readFileSync("public" + c.svgPath, "utf8"));
}
const els: CompositionElement[] = picked.map((c, i) => ({
  instanceId: "i" + i,
  componentId: c.id,
  position: { x: 100 * i, y: 80 * i },
  size: { width: 300, height: 200 },
  rotation: i * 15,
  z: i,
  visible: true,
}));

const svg = buildCompositionSvg(
  { id: "t", title: "t", format: "16:9", componentSize: "L", colorSchemeId: null, elements: els },
  components,
  contents,
  { width: 1920, height: 1080 },
);

const opens = (svg.match(/<svg/g) || []).length;
const closes = (svg.match(/<\/svg>/g) || []).length;
const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const dupes = ids.filter((v, i) => ids.indexOf(v) !== i);
const dangles = [...svg.matchAll(/url\(#([^)]+)\)/g)]
  .map((m) => m[1])
  .filter((r) => !ids.includes(r));

console.log("bytes:", svg.length);
console.log("svg open/close:", opens, closes);
console.log("total ids:", ids.length, "dupes:", dupes.length);
console.log("dangling refs:", dangles.length);
console.log("has XML decl:", svg.startsWith("<?xml"));
console.log("viewBox ok:", svg.includes('viewBox="0 0 1920 1080"'));
console.log("vector paths:", (svg.match(/<path/g) || []).length);
console.log("rects:", (svg.match(/<rect/g) || []).length);
console.log("no raster:", !svg.includes("<image"));
console.log("no editor UI markers:", !svg.includes("stroke-dasharray") && !svg.includes("data-instance"));
