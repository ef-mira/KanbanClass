/**
 * Learning-management-system integration point. V1 ships only the manual
 * adapter (the teacher posts homework themselves and marks it posted). V2 adds
 * Lectio / Google Classroom adapters implementing the same interface.
 */
export interface HomeworkPost {
  lessonId: string;
  subjectName: string;
  group: string | null;
  lessonDate: Date;
  title: string;
  body: string;
}

export interface HomeworkPostResult {
  postedAt: Date;
  externalId?: string;
  url?: string;
}

export interface LMSAdapter {
  readonly id: "manual" | "lectio" | "google-classroom";
  readonly displayName: string;
  /** True when postHomework actually publishes somewhere. */
  readonly canPublish: boolean;
  postHomework(post: HomeworkPost): Promise<HomeworkPostResult>;
}

class ManualLMSAdapter implements LMSAdapter {
  readonly id = "manual" as const;
  readonly displayName = "Manual";
  readonly canPublish = false;

  async postHomework(): Promise<HomeworkPostResult> {
    return { postedAt: new Date() };
  }
}

export function createLMSAdapter(_userId: string): LMSAdapter {
  return new ManualLMSAdapter();
}
