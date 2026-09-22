import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CalendarEventDTO,
  CategoriesDTO,
  CategoriesSave,
  DashboardDTO,
  EventType,
  FileEntry,
  LessonDTO,
  LessonFilesDTO,
  LessonType,
  SettingsDTO,
  SubjectDTO,
  SyncResult,
  TaskDTO,
} from "../shared/types";

export class ApiError extends Error {}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? "GET",
    headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export const keys = {
  settings: ["settings"] as const,
  subjects: ["subjects"] as const,
  lessons: (subjectId: string) => ["lessons", subjectId] as const,
  lesson: (id: string) => ["lesson", id] as const,
  files: (id: string) => ["files", id] as const,
  dashboard: ["dashboard"] as const,
  events: (from: string, to: string) => ["events", from, to] as const,
  day: (date: string) => ["day", date] as const,
  tasks: ["tasks"] as const,
  categories: ["categories"] as const,
};

/** Most edits ripple into several views (board, dashboard, counters) — refresh them together. */
function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "settings" });
}

export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: () => api<SettingsDTO>("/settings") });
export const useSubjects = () => useQuery({ queryKey: keys.subjects, queryFn: () => api<SubjectDTO[]>("/subjects") });
export const useDashboard = () => useQuery({ queryKey: keys.dashboard, queryFn: () => api<DashboardDTO>("/dashboard") });

export const useLessons = (subjectId: string) =>
  useQuery({ queryKey: keys.lessons(subjectId), queryFn: () => api<LessonDTO[]>(`/subjects/${subjectId}/lessons`) });

export const useLesson = (id: string | null) =>
  useQuery({ queryKey: keys.lesson(id ?? ""), queryFn: () => api<LessonDTO>(`/lessons/${id}`), enabled: !!id });

export const useLessonFiles = (id: string | null, enabled: boolean) =>
  useQuery({ queryKey: keys.files(id ?? ""), queryFn: () => api<LessonFilesDTO>(`/lessons/${id}/files`), enabled: !!id && enabled });

export const useEvents = (from: Date, to: Date) =>
  useQuery({
    queryKey: keys.events(from.toISOString(), to.toISOString()),
    queryFn: () =>
      api<{ events: CalendarEventDTO[]; counts: Partial<Record<EventType, number>> }>(
        `/calendar/events?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
      ),
  });

export type DayLesson = LessonDTO & { subjectName: string; subjectColor: string; files: FileEntry[] };
export const useDay = (date: string | null) =>
  useQuery({ queryKey: keys.day(date ?? ""), queryFn: () => api<DayLesson[]>(`/lessons?date=${date}`), enabled: !!date });

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: { icalUrl?: string | null; teachingRoot?: string | null; schoolYearStart?: string | null; schoolYearEnd?: string | null; hiddenEventTypes?: EventType[] }) =>
      api<SettingsDTO>("/settings", { method: "PUT", body: patch }),
    onSuccess: (data) => qc.setQueryData(keys.settings, data),
  });
}

export function useSync() {
  const qc = useQueryClient();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (mode: { kind: "feed" } | { kind: "demo" } | { kind: "import"; ics: string }) =>
      mode.kind === "feed"
        ? api<SyncResult>("/calendar/sync", { method: "POST" })
        : mode.kind === "demo"
          ? api<SyncResult>("/calendar/demo", { method: "POST" })
          : api<SyncResult>("/calendar/import", { method: "POST", body: { ics: mode.ics } }),
    onSuccess: (r) => {
      invalidate();
      qc.invalidateQueries({ queryKey: keys.settings });
      if (r.newSources > 0) window.dispatchEvent(new Event("kc:new-sources"));
    },
  });
}

export const useCategories = (enabled: boolean) =>
  useQuery({ queryKey: keys.categories, queryFn: () => api<CategoriesDTO>("/categories"), enabled });

export function useSaveCategories() {
  const qc = useQueryClient();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (p: CategoriesSave) => api<CategoriesDTO & { warnings: string[] }>("/categories", { method: "PUT", body: p }),
    onSuccess: (data) => {
      qc.setQueryData(keys.categories, data);
      invalidate();
      qc.invalidateQueries({ queryKey: keys.settings });
    },
  });
}

export function useUpdateSubject() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; color?: string; isVisible?: boolean; name?: string }) =>
      api(`/subjects/${id}`, { method: "PATCH", body: patch }),
    onSuccess: invalidate,
  });
}

export function useReorder(subjectId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (orderedIds: string[]) => api<LessonDTO[]>(`/subjects/${subjectId}/reorder`, { method: "POST", body: { orderedIds } }),
    onSuccess: (data) => {
      qc.setQueryData(keys.lessons(subjectId), data);
      invalidate();
    },
  });
}

export interface LessonPatch {
  title?: string;
  bodyText?: string;
  lessonType?: LessonType;
  homeworkText?: string | null;
  homeworkOffset?: number | null;
}
export interface LessonSaveResult {
  lesson: LessonDTO;
  actionItems?: { title: string; dueDate: string }[];
  warning?: string;
}

export function useSaveLesson(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (patch: LessonPatch) => api<LessonSaveResult>(`/lessons/${id}`, { method: "PATCH", body: patch }),
    onSuccess: (data) => {
      qc.setQueryData(keys.lesson(id), data.lesson);
      invalidate();
    },
  });
}

export function useLessonAction(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (a: { kind: "template"; type: LessonType; mode: "insert" | "replace" } | { kind: "folder" } | { kind: "open" } | { kind: "post" } | { kind: "unpost" }) => {
      switch (a.kind) {
        case "template":
          return api<{ lesson?: LessonDTO }>(`/lessons/${id}/template`, { method: "POST", body: { type: a.type, mode: a.mode } });
        case "folder":
          return api<{ lesson?: LessonDTO }>(`/lessons/${id}/folder`, { method: "POST" });
        case "open":
          return api<{ lesson?: LessonDTO }>(`/lessons/${id}/folder/open`, { method: "POST" });
        case "post":
          return api<{ lesson?: LessonDTO }>(`/lessons/${id}/homework/post`, { method: "POST" });
        case "unpost":
          return api<{ lesson?: LessonDTO }>(`/lessons/${id}/homework/post`, { method: "DELETE" });
      }
    },
    onSuccess: (data) => {
      if (data?.lesson) qc.setQueryData(keys.lesson(id), data.lesson);
      qc.invalidateQueries({ queryKey: keys.files(id) });
      qc.invalidateQueries({ queryKey: keys.lesson(id) });
      invalidate();
    },
  });
}

export function useTaskMutations() {
  const invalidate = useInvalidateAll();
  const create = useMutation({
    mutationFn: (t: { title: string; dueDate: string; lessonId?: string | null }) => api<TaskDTO>("/tasks", { method: "POST", body: t }),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, ...p }: { id: string; isCompleted?: boolean; title?: string; dueDate?: string }) =>
      api<TaskDTO>(`/tasks/${id}`, { method: "PATCH", body: p }),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (id: string) => api(`/tasks/${id}`, { method: "DELETE" }), onSuccess: invalidate });
  return { create, update, remove };
}
