import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { matchComponents, selectCompositionPlan } from "../src/lib/semantic/matcher.ts";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(
  readFileSync(resolve(root, "public/assets/illustrations/manifest.json"), "utf8"),
);

const queries = process.argv.slice(2);
if (queries.length === 0) {
  queries.push(
    "Телефон и наушники для онлайн обучения",
    "Идеи превращаются в результат",
    "Лампа идея обучение телефон",
    "Рабочий стол с телефоном и наушниками",
  );
}

for (const q of queries) {
  const result = matchComponents(q, manifest.components);
  const plan = selectCompositionPlan(result, { size: "L" });
  console.log("\n=== " + q);
  console.log(
    "primary:",
    plan.primary.map((p) => `${p.component.name}(${p.score})`).join(", ") || "—",
  );
  console.log(
    "background:",
    plan.background
      ? `${plan.background.component.name} [${plan.background.component.id}] score=${plan.background.score}`
      : "—",
  );
  const top = result.candidates.slice(0, 8).map((c) => `${c.component.id}:${c.score}`);
  console.log("top:", top.join(" "));
}