/**
 * The design-system components are presentational and were written against
 * these shapes. They line up with the app's DTOs, so we alias rather than
 * duplicate them.
 */
import type { LessonDTO, LessonStatus, SubjectDTO } from "../../shared/types";

export type { LessonStatus };
export type Lesson = LessonDTO;
export type Subject = SubjectDTO;

/** The view shapes these two components want; the dashboard maps its DTOs onto them. */
export interface Task {
  id: string;
  title: string;
  done: boolean;
  due: string | null;
  autoExtracted: boolean;
  lessonId: string;
  lessonTitle: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  room: string | null;
  kind: "lesson" | "pause" | "meeting" | "supervision" | "other";
  ignored: boolean;
  subjectColor: string | null;
}

export interface CalendarSource {
  id: string;
  label: string;
  eventType: "lesson" | "meeting" | "supervision" | "other";
  eventCount: number;
  reviewed: boolean;
  nextDate: string | null;
}

export type BoardView = "subject" | "day";
export type StatusFilter = "needs-plan" | "unplanned" | "planned" | "no-slot";
