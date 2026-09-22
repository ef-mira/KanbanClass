import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type Kind = "success" | "info" | "error";
interface Toast {
  id: number;
  kind: Kind;
  text: string;
  action?: { label: string; run: () => void };
}

const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});
export const useToast = () => useContext(Ctx);

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++seq;
      setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), t.action ? 8000 : t.kind === "error" ? 7000 : 3500);
    },
    [dismiss],
  );
  const Icon = { success: CheckCircle2, info: Info, error: AlertCircle };
  const tone = { success: "text-success", info: "text-info", error: "text-danger" };
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-4 z-50 flex w-[360px] max-w-[calc(100vw-32px)] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => {
          const I = Icon[t.kind];
          return (
            <div key={t.id} className="animate-fade pointer-events-auto flex items-start gap-2 rounded-lg border border-line bg-raised px-3 py-2.5 shadow-float">
              <I className={`mt-px size-4 shrink-0 ${tone[t.kind]}`} />
              <div className="flex-1 text-[13px]">{t.text}</div>
              {t.action && (
                <button
                  className="text-[13px] font-medium text-accent hover:underline"
                  onClick={() => {
                    t.action!.run();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button aria-label="Dismiss" className="text-faint hover:text-fg" onClick={() => dismiss(t.id)}>
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
