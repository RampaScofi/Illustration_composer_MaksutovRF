const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..", "public", "assets", "illustrations");
const rows = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".svg")) rows.push(p);
  }
}
walk(root);

const report = [];
for (const file of rows) {
  const svg = fs.readFileSync(file, "utf8");
  const rel = path.relative(root, file).replace(/\\/g, "/");
  const count = (re) => (svg.match(re) || []).length;
  const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const hrefs = [...svg.matchAll(/(?:xlink:)?href="([^"]+)"/g)].map((m) => m[1]);
  const urls = [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
  const idSet = new Set(ids);
  const dangling = [...new Set([...urls, ...hrefs.filter((h) => h.startsWith("#"))])].filter(
    (r) => !idSet.has(r.replace(/^#/, "")),
  );
  report.push({
    file: rel,
    bytes: svg.length,
    defs: count(/<defs[\s>]/g),
    linearGradient: count(/<linearGradient[\s>]/g),
    radialGradient: count(/<radialGradient[\s>]/g),
    mask: count(/<mask[\s>]/g),
    clipPath: count(/<clipPath[\s>]/g),
    filter: count(/<filter[\s>]/g),
    image: count(/<image[\s>]/g),
    style: count(/<style[\s>]/g),
    path: count(/<path[\s>]/g),
    ids: ids.length,
    dupIds: ids.length - idSet.size,
    refs: urls.length,
    dangling: dangling.slice(0, 6),
    hasXlink: /xlink:/.test(svg),
    groups: count(/<g[\s>]/g),
  });
}

const agg = {
  files: report.length,
  withDefs: report.filter((r) => r.defs > 0).length,
  withGradient: report.filter((r) => r.linearGradient + r.radialGradient > 0).length,
  withMask: report.filter((r) => r.mask > 0).length,
  withClip: report.filter((r) => r.clipPath > 0).length,
  withFilter: report.filter((r) => r.filter > 0).length,
  withImage: report.filter((r) => r.image > 0).length,
  withStyle: report.filter((r) => r.style > 0).length,
  withDangling: report.filter((r) => r.dangling.length > 0).length,
  withDupIds: report.filter((r) => r.dupIds > 0).length,
  withXlink: report.filter((r) => r.hasXlink).length,
  totalIds: report.reduce((s, r) => s + r.ids, 0),
  uniqueIds: new Set(report.flatMap((r) => [])).size,
};
console.log(JSON.stringify(agg, null, 2));
console.log("\n-- files with defs/mask/gradient/filter/image (non-zero) --");
report
  .filter((r) => r.defs || r.mask || r.linearGradient || r.radialGradient || r.filter || r.image || r.style || r.dangling.length)
  .forEach((r) => console.log(JSON.stringify(r)));
console.log("\n-- dangling details --");
report.filter((r) => r.dangling.length).forEach((r) => console.log(r.file, r.dangling.join(",")));
fs.writeFileSync(path.join(__dirname, "..", "..", "figma_tmp", "audit.json"), JSON.stringify(report, null, 2));
