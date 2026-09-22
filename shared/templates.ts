import type { LessonType } from "./types";

export interface LessonTemplate {
  type: LessonType;
  label: string;
  /** Whether applying the template also creates the lesson's local folder. */
  createsFolder: boolean;
  body: string;
}

export const LESSON_TEMPLATES: Record<LessonType, LessonTemplate> = {
  standard: {
    type: "standard",
    label: "Standard lesson",
    createsFolder: false,
    body: `## Lesson Plan
- Goal:
- Starter:
- Main activity:
- Wrap-up:

## Materials

## Notes
`,
  },
  lab: {
    type: "lab",
    label: "Lab lesson",
    createsFolder: true,
    body: `## Lesson Plan
- Learning goal:
- Safety briefing:
- Experiment:
- Write-up / report:

## Equipment Needed
- [ ]

## Notes
`,
  },
  test: {
    type: "test",
    label: "Test",
    createsFolder: true,
    body: `## Lesson Plan
- Topics covered:
- Duration:
- Allowed aids:

## Materials
- [ ] Print test copies

## Notes
`,
  },
  excursion: {
    type: "excursion",
    label: "Excursion",
    createsFolder: true,
    body: `## Lesson Plan
- Destination:
- Departure / return:
- Purpose:

## Logistics
- [ ] Book transport
- [ ] Send parent letter

## Notes
`,
  },
  project: {
    type: "project",
    label: "Project work",
    createsFolder: true,
    body: `## Lesson Plan
- Project phase:
- Groups:
- Deliverable for today:

## Resources

## Notes
`,
  },
};
