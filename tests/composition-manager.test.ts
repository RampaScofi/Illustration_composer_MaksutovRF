import test from "node:test";
import assert from "node:assert/strict";
import { CompositionManager } from "../src/lib/composition/compositionManager.ts";
import type { LibraryComponent } from "../src/types/library.ts";

function makeComp(overrides: Partial<LibraryComponent> = {}): LibraryComponent {
  return {
    id: "L-primary-puzzle",
    name: "Пазлы",
    nameConfirmed: true,
    aliases: [],
    tags: [],
    sourceIllustrationId: "L-puzzle",
    size: "L",
    role: "primary",
    svgPath: "/assets/illustrations/L/primary/puzzle.svg",
    viewBox: { x: 0, y: 0, width: 545, height: 314 },
    intrinsicSize: { width: 545, height: 314 },
    schemes: ["violet"],
    repaint: "full",
    sourceNodeCount: 57,
    ...overrides,
  };
}

const components = new Map<string, LibraryComponent>([
  ["L-primary-puzzle", makeComp()],
  ["L-primary-book", makeComp({ id: "L-primary-book", name: "Книга", intrinsicSize: { width: 1446, height: 977 } })],
]);

function freshManager(): CompositionManager {
  return new CompositionManager(components);
}

test("addComponent возвращает instanceId и добавляет экземпляр", () => {
  const mgr = freshManager();
  const id = mgr.addComponent("L-primary-puzzle", { x: 50, y: 60 });
  assert.ok(id);
  assert.equal(mgr.getElements().length, 1);
  const el = mgr.getElement(id!);
  assert.equal(el?.componentId, "L-primary-puzzle");
  assert.deepEqual(el?.position, { x: 50, y: 60 });
});

test("addComponent возвращает null для неизвестного компонента", () => {
  const mgr = freshManager();
  assert.equal(mgr.addComponent("missing", { x: 0, y: 0 }), null);
  assert.equal(mgr.getElements().length, 0);
});

test("duplicate создаёт копию со смещением и новым instanceId", () => {
  const mgr = freshManager();
  const id = mgr.addComponent("L-primary-puzzle", { x: 100, y: 100 })!;
  const newId = mgr.duplicate(id);
  assert.ok(newId);
  assert.notEqual(newId, id);
  assert.equal(mgr.getElements().length, 2);
  assert.deepEqual(mgr.getElement(newId!)?.position, { x: 120, y: 120 });
});

test("remove удаляет экземпляр", () => {
  const mgr = freshManager();
  const id = mgr.addComponent("L-primary-puzzle", { x: 0, y: 0 })!;
  assert.equal(mgr.remove(id), true);
  assert.equal(mgr.getElements().length, 0);
  assert.equal(mgr.remove(id), false);
});

test("move изменяет координаты экземпляра", () => {
  const mgr = freshManager();
  const id = mgr.addComponent("L-primary-puzzle", { x: 10, y: 20 })!;
  mgr.move(id, { x: 200, y: 300 });
  assert.deepEqual(mgr.getElement(id)?.position, { x: 200, y: 300 });
});

test("rotate изменяет угол и нормализует в [0, 360)", () => {
  const mgr = freshManager();
  const id = mgr.addComponent("L-primary-puzzle", { x: 0, y: 0 })!;
  mgr.rotate(id, 45);
  assert.equal(mgr.getElement(id)?.rotation, 45);
  mgr.rotate(id, 370);
  assert.equal(mgr.getElement(id)?.rotation, 10);
  mgr.rotate(id, -90);
  assert.equal(mgr.getElement(id)?.rotation, 270);
});

test("resize устанавливает новый размер", () => {
  const mgr = freshManager();
  const id = mgr.addComponent("L-primary-puzzle", { x: 0, y: 0 })!;
  mgr.resize(id, { width: 400, height: 200 });
  assert.deepEqual(mgr.getElement(id)?.size, { width: 400, height: 200 });
});

test("bringForward и sendBackward меняют порядок z", () => {
  const mgr = freshManager();
  const a = mgr.addComponent("L-primary-puzzle", { x: 0, y: 0 })!;
  const b = mgr.addComponent("L-primary-book", { x: 50, y: 50 })!;
  assert.ok(mgr.getElement(a)!.z < mgr.getElement(b)!.z);
  mgr.bringForward(a);
  assert.ok(mgr.getElement(a)!.z > mgr.getElement(b)!.z);
  mgr.sendBackward(a);
  assert.ok(mgr.getElement(a)!.z < mgr.getElement(b)!.z);
});

test("bringToFront и sendToBack устанавливают крайние позиции", () => {
  const mgr = freshManager();
  const a = mgr.addComponent("L-primary-puzzle", { x: 0, y: 0 })!;
  const b = mgr.addComponent("L-primary-book", { x: 0, y: 0 })!;
  const c = mgr.addComponent("L-primary-puzzle", { x: 0, y: 0 })!;
  mgr.bringToFront(a);
  assert.ok(mgr.getElement(a)!.z > mgr.getElement(b)!.z);
  assert.ok(mgr.getElement(a)!.z > mgr.getElement(c)!.z);
  mgr.sendToBack(a);
  assert.ok(mgr.getElement(a)!.z < mgr.getElement(b)!.z);
});

test("повторное использование одного компонента создаёт разные instanceId", () => {
  const mgr = freshManager();
  const a = mgr.addComponent("L-primary-puzzle", { x: 0, y: 0 })!;
  const b = mgr.addComponent("L-primary-puzzle", { x: 50, y: 50 })!;
  assert.notEqual(a, b);
  assert.equal(mgr.getElement(a)!.componentId, mgr.getElement(b)!.componentId);
});

test("toggleVisibility переключает видимость", () => {
  const mgr = freshManager();
  const id = mgr.addComponent("L-primary-puzzle", { x: 0, y: 0 })!;
  assert.equal(mgr.getElement(id)?.visible, true);
  mgr.toggleVisibility(id);
  assert.equal(mgr.getElement(id)?.visible, false);
});

test("setFormat и setComponentSize обновляют композицию", () => {
  const mgr = freshManager();
  mgr.setFormat("1:1");
  mgr.setComponentSize("S");
  assert.equal(mgr.getComposition().format, "1:1");
  assert.equal(mgr.getComposition().componentSize, "S");
});

test("clear удаляет все экземпляры", () => {
  const mgr = freshManager();
  mgr.addComponent("L-primary-puzzle", { x: 0, y: 0 });
  mgr.addComponent("L-primary-book", { x: 0, y: 0 });
  mgr.clear();
  assert.equal(mgr.getElements().length, 0);
});
