const fs = require("fs");
const path = require("path");

// Переименование подтверждённого объекта: «Ваза с цветами».
// Остальные компоненты не затрагиваются.
const TARGET_SLUGS = new Set(["group-344", "group-345", "group-346", "group-347"]);

const NAME = "Ваза с цветами";
const ALIASES = ["ваза", "цветы", "букет", "букет в вазе", "растение", "vase", "flowers"];
const TAGS = ["природа", "растение", "декор", "подарок", "уют", "вдохновение"];

const file = path.join(
  __dirname,
  "..",
  "..",
  "public",
  "assets",
  "illustrations",
  "manifest.json",
);
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));

let updated = 0;
for (const component of manifest.components) {
  const slug = component.svgPath.split("/").pop().replace(/\.svg$/, "");
  if (!TARGET_SLUGS.has(slug)) continue;

  component.name = NAME;
  component.nameConfirmed = true;
  component.aliases = [...ALIASES];
  component.tags = [...TAGS];
  updated += 1;
}

fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
console.log("updated components:", updated);
console.log(
  manifest.components
    .filter((c) => c.name === NAME)
    .map((c) => `${c.id} (${c.size}/${c.role})`)
    .join("\n"),
);
