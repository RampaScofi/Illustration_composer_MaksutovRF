import test from "node:test";
import assert from "node:assert/strict";

import {
  boxesOverlap,
  buildAutoLayout,
  fitInto,
  safeBox,
  type LayoutItem,
} from "../src/lib/composition/autoLayout.ts";
import type { Box } from "../src/types/geometry.ts";

const BOOK: LayoutItem = {
  componentId: "L-primary-book",
  role: "primary",
  intrinsic: { width: 545, height: 314 },
  category: "L-book",
};

const LAMP: LayoutItem = {
  componentId: "L-primary-lamp",
  role: "primary",
  intrinsic: { width: 300, height: 500 },
  category: "L-lamp",
};

const COIN: LayoutItem = {
  componentId: "L-primary-coin",
  role: "primary",
  intrinsic: { width: 400, height: 400 },
  category: "L-coin",
};

const BACKGROUND: LayoutItem = {
  componentId: "L-background-book",
  role: "background",
  intrinsic: { width: 545, height: 314 },
  category: "L-book",
};

const CANVASES = [
  { id: "16:9", size: { width: 1600, height: 900 } },
  { id: "4:3", size: { width: 1200, height: 900 } },
  { id: "1:1", size: { width: 1200, height: 1200 } },
  { id: "4:5", size: { width: 960, height: 1200 } },
  { id: "9:16", size: { width: 675, height: 1200 } },
  { id: "3:1", size: { width: 1800, height: 600 } },
];

function boxOf(el: { position: { x: number; y: number }; size: { width: number; height: number } }): Box {
  return { x: el.position.x, y: el.position.y, ...el.size };
}

/** Самый крупный экземпляр: им считается главный объект. */
function largest<T extends { size: { width: number; height: number } }>(elements: readonly T[]): T {
  return elements.reduce((a, b) =>
    a.size.width * a.size.height >= b.size.width * b.size.height ? a : b,
  );
}

/** Допустимый выход за край холста: четверть размера объекта (MAX_CROP в autoLayout.ts). */
const MAX_CROP = 0.25;

test("fitInto сохраняет пропорции исходного SVG", () => {
  const size = fitInto({ width: 545, height: 314 }, { width: 300, height: 300 });
  assert.ok(Math.abs(size.width / size.height - 545 / 314) < 1e-9);
  assert.ok(size.width <= 300 + 1e-9 && size.height <= 300 + 1e-9);
});

test("fitInto не падает на нулевом исходнике", () => {
  assert.deepEqual(fitInto({ width: 0, height: 0 }, { width: 100, height: 100 }), {
    width: 0,
    height: 0,
  });
});

test("safeBox оставляет одинаковые поля по обеим осям", () => {
  const box = safeBox({ width: 1000, height: 500 }, 0.1);
  // Отступ считается от меньшей стороны холста: 500 * 0.1 = 50.
  assert.deepEqual(box, { x: 50, y: 50, width: 900, height: 400 });
});

test("boxesOverlap учитывает зазор", () => {
  const a = { x: 0, y: 0, width: 100, height: 100 };
  assert.equal(boxesOverlap(a, { x: 50, y: 50, width: 100, height: 100 }), true);
  assert.equal(boxesOverlap(a, { x: 110, y: 0, width: 50, height: 50 }), false);
  assert.equal(boxesOverlap(a, { x: 105, y: 0, width: 50, height: 50 }, 10), true);
});

for (const { id, size } of CANVASES) {
  test(`компоновка ${id}: объекты не выходят за край больше допустимого и не деформированы`, () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const elements = buildAutoLayout([BOOK, LAMP, COIN, BACKGROUND], { canvas: size, seed });
      assert.ok(elements.length >= 2);

      for (const el of elements) {
        const box = boxOf(el);
        assert.ok(box.x >= -box.width * MAX_CROP - 1e-6, `${el.componentId}: левый край`);
        assert.ok(box.y >= -box.height * MAX_CROP - 1e-6, `${el.componentId}: верхний край`);
        assert.ok(
          box.x + box.width <= size.width + box.width * MAX_CROP + 1e-6,
          `${el.componentId}: правый край`,
        );
        assert.ok(
          box.y + box.height <= size.height + box.height * MAX_CROP + 1e-6,
          `${el.componentId}: нижний край`,
        );
      }
    }
  });
}

test("пропорции каждого экземпляра совпадают с исходными", () => {
  const items = [BOOK, LAMP, COIN, BACKGROUND];
  const intrinsic = new Map(items.map((i) => [i.componentId, i.intrinsic]));
  const elements = buildAutoLayout(items, { canvas: { width: 1200, height: 1200 } });

  for (const el of elements) {
    const source = intrinsic.get(el.componentId)!;
    assert.ok(
      Math.abs(el.size.width / el.size.height - source.width / source.height) < 1e-9,
      `${el.componentId}: пропорции искажены`,
    );
  }
});

test("фоновый объект лежит под главными", () => {
  const elements = buildAutoLayout([BOOK, LAMP, BACKGROUND], {
    canvas: { width: 1200, height: 900 },
  });
  const background = elements.find((el) => el.componentId === BACKGROUND.componentId)!;
  const others = elements.filter((el) => el.componentId !== BACKGROUND.componentId);

  assert.ok(others.length > 0);
  for (const el of others) {
    assert.ok(background.z < el.z, "фон должен быть ниже по слою");
  }
});

test("главный объект крупнее вспомогательных", () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const elements = buildAutoLayout([BOOK, LAMP, COIN], {
      canvas: { width: 1600, height: 900 },
      seed,
    });
    const main = largest(elements);
    assert.equal(main.componentId, BOOK.componentId, `seed ${seed}: главный объект`);
    for (const el of elements) {
      if (el === main) continue;
      assert.ok(
        main.size.width * main.size.height > el.size.width * el.size.height,
        "главный объект должен быть крупнее",
      );
    }
  }
});

test("компоновка детерминирована при одинаковом зерне и меняется без него", () => {
  const a = buildAutoLayout([BOOK, LAMP, COIN], { canvas: { width: 1200, height: 900 }, seed: 7 });
  const b = buildAutoLayout([BOOK, LAMP, COIN], { canvas: { width: 1200, height: 900 }, seed: 7 });
  assert.deepEqual(a, b);

  const variants = new Set<string>();
  for (let i = 0; i < 5; i += 1) {
    variants.add(JSON.stringify(buildAutoLayout([BOOK, LAMP, COIN], { canvas: { width: 1200, height: 900 } })));
  }
  assert.ok(variants.size > 1, "без зерна раскладка должна отличаться между запусками");
});

test("компоновка учитывает формат: вертикальный холст даёт другой результат", () => {
  const wide = largest(buildAutoLayout([BOOK], { canvas: { width: 1600, height: 900 }, seed: 3 }));
  const tall = largest(buildAutoLayout([BOOK], { canvas: { width: 675, height: 1200 }, seed: 3 }));

  assert.ok(Math.abs(wide.size.width - tall.size.width) > 1);
  // Пропорции объекта в обоих случаях одинаковые.
  const ratioWide = wide.size.width / wide.size.height;
  const ratioTall = tall.size.width / tall.size.height;
  assert.ok(Math.abs(ratioWide - ratioTall) < 1e-9);
});

test("без главных объектов компоновка пуста", () => {
  assert.deepEqual(buildAutoLayout([BACKGROUND], { canvas: { width: 1200, height: 900 } }), []);
  assert.deepEqual(buildAutoLayout([], { canvas: { width: 1200, height: 900 } }), []);
});

test("уникальные instanceId и корректный порядок z", () => {
  const elements = buildAutoLayout([BOOK, LAMP, COIN, BACKGROUND], {
    canvas: { width: 1200, height: 900 },
  });
  const ids = elements.map((el) => el.instanceId);
  assert.equal(new Set(ids).size, ids.length);

  const zs = elements.map((el) => el.z);
  assert.deepEqual(zs, [...zs].sort((a, b) => a - b));
});
