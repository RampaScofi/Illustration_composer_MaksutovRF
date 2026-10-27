/**
 * Модель проектов-вкладок. Чистая логика без React: каждый проект хранит
 * собственное имя и идентификатор. Состояние композиции живёт в самом проекте
 * (см. Workbench) и здесь не дублируется.
 */

export type Project = {
  id: string;
  name: string;
};

export type ProjectsState = {
  projects: Project[];
  activeId: string;
};

export const MAX_PROJECTS = 12;
export const MAX_NAME_LENGTH = 40;
export const DEFAULT_PROJECT_NAME = "Проект";

/** Имя по умолчанию для нового проекта: «Проект 2», «Проект 3» и т. д. */
export function nextProjectName(projects: readonly Project[]): string {
  const taken = new Set(projects.map((p) => p.name));
  for (let i = projects.length + 1; i < projects.length + 1000; i++) {
    const candidate = `${DEFAULT_PROJECT_NAME} ${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${DEFAULT_PROJECT_NAME} ${Date.now()}`;
}

/** Нормализует имя: без управляющих символов, по длине, без пустоты. */
export function sanitizeProjectName(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return fallback;
  return cleaned.slice(0, MAX_NAME_LENGTH);
}

export function createInitialState(id: string): ProjectsState {
  return { projects: [{ id, name: DEFAULT_PROJECT_NAME }], activeId: id };
}

export function addProject(state: ProjectsState, id: string): ProjectsState {
  if (state.projects.length >= MAX_PROJECTS) return state;
  const name = nextProjectName(state.projects);
  return {
    projects: [...state.projects, { id, name }],
    activeId: id,
  };
}

export function renameProject(state: ProjectsState, id: string, raw: string): ProjectsState {
  return {
    ...state,
    projects: state.projects.map((project) =>
      project.id === id
        ? { ...project, name: sanitizeProjectName(raw, project.name) }
        : project,
    ),
  };
}

export function activateProject(state: ProjectsState, id: string): ProjectsState {
  if (!state.projects.some((p) => p.id === id)) return state;
  return { ...state, activeId: id };
}

/**
 * Закрытие проекта. Последний проект закрыть нельзя: приложение всегда
 * имеет хотя бы один рабочий проект. При закрытии активного переключаемся
 * на соседний проект справа, либо слева, если справа нет.
 */
export function closeProject(
  state: ProjectsState,
  id: string,
  replacementId: string,
): ProjectsState {
  if (state.projects.length <= 1) return state;
  const index = state.projects.findIndex((p) => p.id === id);
  if (index < 0) return state;

  const projects = state.projects.filter((p) => p.id !== id);
  let activeId = state.activeId;
  if (state.activeId === id) {
    const neighbour = projects[Math.min(index, projects.length - 1)];
    activeId = neighbour ? neighbour.id : replacementId;
  }
  return { projects, activeId };
}
