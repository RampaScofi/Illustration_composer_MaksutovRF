// Сборка плагина: генерирует модуль библиотеки из public/assets/illustrations
// и собирает src/code.ts в dist/code.js. Запуск: npm run build.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(pluginRoot, "..");
const libraryRoot = path.join(repoRoot, "public", "assets", "illustrations");

function stripBom(text) {
  return text.replace(/^\uFEFF/, "");
}

const manifest = JSON.parse(
  stripBom(await readFile(path.join(libraryRoot, "manifest.json"), "utf8")),
);

const svgFiles = {};
for (const component of manifest.components) {
  const file = path.join(repoRoot, "public", component.svgPath);
  try {
    svgFiles[component.svgPath] = stripBom(await readFile(file, "utf8"));
  } catch {
    throw new Error(`Не найден SVG библиотеки: ${component.svgPath}`);
  }
}

await mkdir(path.join(pluginRoot, "dist"), { recursive: true });
await writeFile(
  path.join(pluginRoot, "src", "library.generated.ts"),
  [
    "// Сгенерировано scripts/build.mjs. Не редактировать вручную.",
    `export const LIBRARY_MANIFEST: unknown = ${JSON.stringify(manifest)};`,
    `export const SVG_FILES: Record<string, string> = ${JSON.stringify(svgFiles)};`,
    "",
  ].join("\n"),
);

await build({
  entryPoints: [path.join(pluginRoot, "src", "code.ts")],
  bundle: true,
  outfile: path.join(pluginRoot, "dist", "code.js"),
  format: "iife",
  platform: "browser",
  target: "es2020",
  logLevel: "info",
});

console.log(`Библиотека: ${manifest.components.length} компонентов, ${Object.keys(svgFiles).length} SVG`);
