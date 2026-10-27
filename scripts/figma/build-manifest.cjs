const fs = require("fs");
const path = require("path");

const TMP = path.join(__dirname, "..", "..", "figma_tmp");
const exported = JSON.parse(fs.readFileSync(path.join(TMP, "exported.json"), "utf8"));
const libFull = JSON.parse(fs.readFileSync(path.join(TMP, "library_full.json"), "utf8"));
const page = libFull.nodes["0:1"].document;
const byId = new Map();
(function w(n) { byId.set(n.id, n); (n.children || []).forEach(w); })(page);

const SCHEMES = [
  {
    id: "violet",
    name: "Схема 1 · фиолетовая",
    figmaNodes: { L: "21:29569", S: "24:6124" },
    background: ["#d7cdf5", "#aa9bf0", "#7864d7"],
    neutral: ["#181817", "#ffffff"],
    object: ["#f9ecb0", "#f9a3aa", "#ffe3e1"],
  },
  {
    id: "peach",
    name: "Схема 2 · персиковая",
    figmaNodes: { L: "21:29570", S: "24:6133" },
    background: ["#fdd7b9", "#fac896", "#d27532"],
    neutral: ["#181817", "#ffffff"],
    object: ["#f9ecb0", "#80dada", "#beebeb"],
  },
  {
    id: "mint",
    name: "Схема 3 · мятная",
    figmaNodes: { L: "21:29579", S: "24:6142" },
    background: ["#beebeb", "#80dada", "#5abebe"],
    neutral: ["#181817", "#ffffff"],
    object: ["#ffd4f2", "#6d7bfc", "#b6c6fe"],
  },
];

const ALIASES = {
  puzzle: ["пазл", "пазлы", "puzzle", "головоломка"],
  book: ["книга", "книги", "book", "открытая книга"],
  phone: ["телефон", "смартфон", "телефоны", "phone", "гаджет"],
  headphones: ["наушники", "headphones", "гарнитура"],
  lamp: ["лампа", "торшер", "lamp", "светильник", "освещение"],
  wallet: ["кошелек", "бумажник", "wallet", "деньги"],
  pen: ["ручка", "перо", "pen", "писание"],
  folder: ["папка", "folder", "каталог"],
  coin: ["монета", "монеты", "coin", "финансы", "оплата"],
  "backdrop-violet": ["фон", "backdrop", "подложка"],
  "backdrop-peach": ["фон", "backdrop", "подложка"],
  "backdrop-mint": ["фон", "backdrop", "подложка"],
};

const TAGS = {
  puzzle: ["обучение", "развитие", "часть целого", "задача"],
  book: ["обучение", "знания", "чтение", "развитие", "источник"],
  phone: ["технологии", "коммуникация", "мобильность", "гаджет", "приложение"],
  headphones: ["звук", "обучение", "подкаст", "концентрация", "гаджет"],
  lamp: ["идея", "вдохновение", "освещение", "решение", "работа"],
  wallet: ["деньги", "финансы", "оплата", "бюджет", "накопления"],
  pen: ["письмо", "документ", "создание", "редактирование", "идея"],
  folder: ["документы", "хранение", "порядок", "архив", "работа"],
  coin: ["деньги", "финансы", "оплата", "стоимость", "бонус"],
  "backdrop-violet": ["фон", "подложка", "схема"],
  "backdrop-peach": ["фон", "подложка", "схема"],
  "backdrop-mint": ["фон", "подложка", "схема"],
};

function countNodes(id) {
  const n = byId.get(id);
  let total = 0;
  (function w(x) {
    total += 1;
    (x.children || []).forEach(w);
  })(n);
  return total;
}

const components = exported
  .map((e) => {
    const [vbX, vbY, vbW, vbH] = e.viewBox.split(/[\s,]+/).map(Number);
    const nameConfirmed = !/^Group 21/.test(e.name);
    return {
      id: `${e.size}-${e.role}-${e.slug}`,
      name: e.name,
      nameConfirmed,
      aliases: nameConfirmed ? ALIASES[e.slug] || [] : [],
      tags: nameConfirmed ? TAGS[e.slug] || [] : [],
      sourceIllustrationId: `${e.size}-${e.slug}`,
      figmaNodeId: e.id,
      size: e.size,
      role: e.role,
      svgPath: `/assets/illustrations/${e.size}/${e.role}/${e.file}`,
      viewBox: { x: vbX, y: vbY, width: vbW, height: vbH },
      intrinsicSize: { width: vbW, height: vbH },
      schemes: e.role === "backdrop" ? [SCHEMES.find((s) => s.id === e.slug.replace("backdrop-", ""))?.id] : SCHEMES.map((s) => s.id),
      repaint: e.role === "backdrop" ? "none" : e.role === "background" ? "monochrome-only" : "full",
      sourceNodeCount: countNodes(e.id),
    };
  });

const manifest = {
  version: "1",
  sourceFileKey: "9fcdDYQ8sWKSC7ALKvXPqg",
  sourcePageId: "0:1",
  generatedAt: new Date().toISOString(),
  schemes: SCHEMES.map((s) => ({
    id: s.id,
    name: s.name,
    colors: [
      ...s.background.map((hex) => ({ slot: "background", hex })),
      ...s.object.map((hex) => ({ slot: "object", hex })),
      ...s.neutral.map((hex) => ({ slot: "neutral", hex })),
    ],
  })),
  components,
};

const out = path.join(__dirname, "..", "..", "public", "assets", "illustrations", "manifest.json");
fs.writeFileSync(out, JSON.stringify(manifest, null, 2));
console.log("components:", components.length, "schemes:", manifest.schemes.length);
console.log("saved:", path.relative(path.join(__dirname, "..", ".."), out));

const excluded = exported.filter((e) => /^Group 21/.test(e.name));
console.log("excluded (неподтверждённые имена):", excluded.map((e) => `${e.size}/${e.role}/${e.slug}`).join(", "));
