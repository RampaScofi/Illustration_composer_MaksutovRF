const fs = require("fs");
const path = require("path");

const TOKEN = process.env.FIGMA_TOKEN;
const KEY = process.env.FIGMA_FILE_KEY || "9fcdDYQ8sWKSC7ALKvXPqg";
if (!TOKEN) {
  console.error("FIGMA_TOKEN is required");
  process.exit(1);
}

// Подтверждённые самостоятельные иллюстрации (без элементов палитры и подэлементов).
const ITEMS = [
  { size: "L", role: "primary", slug: "puzzle", name: "Пазлы", id: "21:417" },
  { size: "L", role: "primary", slug: "book", name: "Книга", id: "21:29965" },
  { size: "L", role: "primary", slug: "phone", name: "Телефон", id: "21:25472" },
  { size: "L", role: "primary", slug: "headphones", name: "Наушники", id: "23:122" },
  { size: "L", role: "primary", slug: "lamp", name: "Лампа", id: "23:121" },
  { size: "L", role: "primary", slug: "wallet", name: "Кошелек", id: "23:211" },
  { size: "L", role: "primary", slug: "pen", name: "Ручка", id: "24:1734" },
  { size: "L", role: "primary", slug: "folder", name: "Папка", id: "24:1899" },
  { size: "L", role: "primary", slug: "coin", name: "Монета", id: "24:2207" },
  { size: "L", role: "primary", slug: "group-344", name: "Group 2136136344", id: "28:11628" },
  { size: "L", role: "background", slug: "puzzle", name: "Пазлы", id: "24:6214" },
  { size: "L", role: "background", slug: "book", name: "Книга", id: "24:6273" },
  { size: "L", role: "background", slug: "phone", name: "Телефон", id: "24:6327" },
  { size: "L", role: "background", slug: "headphones", name: "Наушники", id: "24:6484" },
  { size: "L", role: "background", slug: "lamp", name: "Лампа", id: "24:6569" },
  { size: "L", role: "background", slug: "wallet", name: "Кошелек", id: "24:6660" },
  { size: "L", role: "background", slug: "pen", name: "Ручка", id: "24:6747" },
  { size: "L", role: "background", slug: "folder", name: "Папка", id: "24:6772" },
  { size: "L", role: "background", slug: "coin", name: "Монета", id: "24:6795" },
  { size: "L", role: "background", slug: "group-347", name: "Group 2136136347", id: "30:11902" },
  { size: "S", role: "primary", slug: "book", name: "Книга", id: "24:3810" },
  { size: "S", role: "primary", slug: "phone", name: "Телефон", id: "24:4746" },
  { size: "S", role: "primary", slug: "puzzle", name: "Пазлы", id: "24:4903" },
  { size: "S", role: "primary", slug: "coin", name: "Монета", id: "24:5345" },
  { size: "S", role: "primary", slug: "headphones", name: "Наушники", id: "24:5089" },
  { size: "S", role: "primary", slug: "lamp", name: "Лампа", id: "24:5485" },
  { size: "S", role: "primary", slug: "folder", name: "Папка", id: "24:4430" },
  { size: "S", role: "primary", slug: "pen", name: "Ручка", id: "24:4287" },
  { size: "S", role: "primary", slug: "wallet", name: "Кошелек", id: "24:4594" },
  { size: "S", role: "primary", slug: "group-345", name: "Group 2136136345", id: "28:11629" },
  { size: "S", role: "background", slug: "book", name: "Книга", id: "24:6934" },
  { size: "S", role: "background", slug: "phone", name: "Телефон", id: "24:6990" },
  { size: "S", role: "background", slug: "puzzle", name: "Пазлы", id: "24:7147" },
  { size: "S", role: "background", slug: "coin", name: "Монета", id: "24:7205" },
  { size: "S", role: "background", slug: "headphones", name: "Наушники", id: "24:7344" },
  { size: "S", role: "background", slug: "lamp", name: "Лампа", id: "24:7429" },
  { size: "S", role: "background", slug: "folder", name: "Папка", id: "24:7520" },
  { size: "S", role: "background", slug: "pen", name: "Ручка", id: "24:7543" },
  { size: "S", role: "background", slug: "wallet", name: "Кошелек", id: "24:7568" },
  { size: "S", role: "background", slug: "group-346", name: "Group 2136136346", id: "28:11766" },
  { size: "L", role: "backdrop", slug: "backdrop-violet", name: "Фон фиолетовый", id: "21:25258" },
  { size: "L", role: "backdrop", slug: "backdrop-peach", name: "Фон персиковый", id: "21:25399" },
  { size: "L", role: "backdrop", slug: "backdrop-mint", name: "Фон мятный", id: "21:29593" },
  { size: "S", role: "backdrop", slug: "backdrop-violet", name: "Фон фиолетовый", id: "24:5990" },
  { size: "S", role: "backdrop", slug: "backdrop-peach", name: "Фон персиковый", id: "24:6120" },
  { size: "S", role: "backdrop", slug: "backdrop-mint", name: "Фон мятный", id: "24:6055" },
];

const CHUNK = 8;

async function fetchUrls(ids) {
  const url = `https://api.figma.com/v1/images/${KEY}?ids=${ids.join(",")}&format=svg&use_absolute_bounds=false&svg_include_id=false&svg_simplify_stroke=false`;
  const res = await fetch(url, { headers: { "X-Figma-Token": TOKEN } });
  if (!res.ok) throw new Error(`images API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  if (body.err) throw new Error(`images API err: ${body.err}`);
  return body.images;
}

async function main() {
  const root = path.join(__dirname, "..", "..", "public", "assets", "illustrations");
  const manifest = [];

  for (let i = 0; i < ITEMS.length; i += CHUNK) {
    const chunk = ITEMS.slice(i, i + CHUNK);
    const urls = await fetchUrls(chunk.map((c) => c.id));

    for (const item of chunk) {
      const url = urls[item.id];
      if (!url) {
        console.log("MISSING", item.id, item.name);
        continue;
      }
      const res = await fetch(url);
      if (!res.ok) {
        console.log("DOWNLOAD_FAIL", item.id, res.status);
        continue;
      }
      let svg = await res.text();
      if (!/^<svg[\s>]/.test(svg.trim())) {
        console.log("NOT_SVG", item.id, svg.slice(0, 60));
        continue;
      }
      if (!svg.includes("xmlns=")) {
        svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      const dir = path.join(root, item.size, item.role);
      fs.mkdirSync(dir, { recursive: true });
      const file = `${item.slug}.svg`;
      fs.writeFileSync(path.join(dir, file), svg, "utf8");

      const vb = /viewBox="([^"]+)"/.exec(svg);
      manifest.push({
        ...item,
        file,
        bytes: Buffer.byteLength(svg, "utf8"),
        viewBox: vb ? vb[1] : null,
      });
      console.log("OK", item.size, item.role, item.slug, `${Buffer.byteLength(svg)}B`, vb ? vb[1] : "NO-VIEWBOX");
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  fs.writeFileSync(path.join(__dirname, "..", "..", "figma_tmp", "exported.json"), JSON.stringify(manifest, null, 2));
  console.log("\nexported:", manifest.length, "of", ITEMS.length);
}

main().catch((e) => {
  console.error("FATAL", e.message);
  process.exit(1);
});
