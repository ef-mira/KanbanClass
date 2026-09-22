import { createContext, useContext } from "react";

export type View = "dashboard" | "board" | "settings";

export interface Nav {
  view: View;
  go: (v: View, opts?: { subjectId?: string }) => void;
  /** Subject to scroll to on the board, set when jumping from a dashboard metric. */
  focusSubjectId: string | null;
  openLesson: (id: string | null) => void;
  openDay: (date: string | null) => void;
}

export const NavContext = createContext<Nav | null>(null);

export function useNav(): Nav {
  const n = useContext(NavContext);
  if (!n) throw new Error("useNav outside NavContext");
  return n;
}
