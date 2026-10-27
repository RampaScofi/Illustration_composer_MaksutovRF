import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_NAME_LENGTH,
  MAX_PROJECTS,
  activateProject,
  addProject,
  closeProject,
  createInitialState,
  renameProject,
  sanitizeProjectName,
} from "../src/lib/composition/projects.ts";

test("начальное состояние: один активный проект", () => {
  const state = createInitialState("p1");
  assert.equal(state.projects.length, 1);
  assert.equal(state.activeId, "p1");
  assert.equal(state.projects[0].name, "Проект");
});

test("добавление делает новый проект активным и выбирает уникальное имя", () => {
  let state = createInitialState("p1");
  state = addProject(state, "p2");
  assert.equal(state.activeId, "p2");
  assert.equal(state.projects[1].name, "Проект 2");
  state = addProject(state, "p3");
  assert.equal(state.projects[2].name, "Проект 3");
});

test("число проектов ограничено", () => {
  let state = createInitialState("p0");
  for (let i = 1; i < MAX_PROJECTS + 5; i++) state = addProject(state, `p${i}`);
  assert.equal(state.projects.length, MAX_PROJECTS);
});

test("переименование: обрезка, пустое имя возвращает прежнее", () => {
  let state = createInitialState("p1");
  state = renameProject(state, "p1", "  Плакат\n для   выставки  ");
  assert.equal(state.projects[0].name, "Плакат для выставки");
  state = renameProject(state, "p1", "   ");
  assert.equal(state.projects[0].name, "Плакат для выставки");
  state = renameProject(state, "p1", "я".repeat(100));
  assert.equal(state.projects[0].name.length, MAX_NAME_LENGTH);
});

test("sanitizeProjectName удаляет управляющие символы", () => {
  assert.equal(sanitizeProjectName("a\u0000b\u007fc", "x"), "a b c");
  assert.equal(sanitizeProjectName("", "запасной"), "запасной");
});

test("переключение на несуществующий id игнорируется", () => {
  const state = createInitialState("p1");
  assert.equal(activateProject(state, "nope"), state);
  assert.equal(activateProject(state, "p1").activeId, "p1");
});

test("закрытие активного переключает на соседний справа, затем слева", () => {
  let state = createInitialState("p1");
  state = addProject(state, "p2");
  state = addProject(state, "p3");
  state = activateProject(state, "p2");

  const afterMiddle = closeProject(state, "p2", "p1");
  assert.deepEqual(afterMiddle.projects.map((p) => p.id), ["p1", "p3"]);
  assert.equal(afterMiddle.activeId, "p3");

  const lastActive = activateProject(state, "p3");
  const afterLast = closeProject(lastActive, "p3", "p1");
  assert.deepEqual(afterLast.projects.map((p) => p.id), ["p1", "p2"]);
  assert.equal(afterLast.activeId, "p2");
});

test("закрытие неактивного не меняет активный проект", () => {
  let state = createInitialState("p1");
  state = addProject(state, "p2");
  const after = closeProject(state, "p1", "p2");
  assert.equal(after.activeId, "p2");
  assert.deepEqual(after.projects.map((p) => p.id), ["p2"]);
});

test("последний проект закрыть нельзя", () => {
  const state = createInitialState("p1");
  assert.equal(closeProject(state, "p1", "p1"), state);
});
