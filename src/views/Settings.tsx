import { useEffect, useRef, useState } from "react";
import { CalendarDays, CalendarPlus, Database, FileUp, FlaskConical, FolderOpen, KeyRound, Layers, Link, RefreshCw, Save, Sparkles } from "lucide-react";
import { useNav } from "../nav";
import type { SyncResult, WeekDays } from "../../shared/types";
import type { ApiKeyStatus } from "../../shared/desktop";
import { desktop } from "../desktop";
import { keys, useSettings, useSync, useUpdateSettings } from "../api";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/ui";
import { useToast } from "../components/toast";

export function Settings() {
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const sync = useSync();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const { openCategories } = useNav();
  const [form, setForm] = useState({ icalUrl: "", teachingRoot: "", schoolYearStart: "", schoolYearEnd: "" });
  const [result, setResult] = useState<SyncResult | null>(null);

  useEffect(() => {
    if (!settings) return;
    setForm({
      icalUrl: settings.icalUrl ?? "",
      teachingRoot: settings.teachingRoot,
      schoolYearStart: settings.schoolYearStart?.slice(0, 10) ?? "",
      schoolYearEnd: settings.schoolYearEnd?.slice(0, 10) ?? "",
    });
    if (settings.lastSyncSummary) setResult((r) => r ?? JSON.parse(settings.lastSyncSummary!));
  }, [settings]);

  const onSynced = (r: SyncResult) => {
    setResult(r);
    toast({ kind: "success", text: `Imported ${r.fetched} events · ${r.subjectsCreated} new subject(s)` });
  };
  const onError = (e: Error) => toast({ kind: "error", text: e.message });

  const saveSettings = async () => {
    await update.mutateAsync(
      {
        icalUrl: form.icalUrl.trim() || null,
        teachingRoot: form.teachingRoot.trim() || null,
        schoolYearStart: form.schoolYearStart || null,
        schoolYearEnd: form.schoolYearEnd || null,
      },
      { onError },
    );
  };

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mx-auto max-w-2xl space-y-5">
        <Card title="Calendar feed" icon={<Link className="size-4" />}>
          <p className="text-xs text-text-muted">
            Paste your Zenbi export URL (<code className="font-mono">https://api.zenbi.dk/exportcalendar/own/?key=…</code>) or any iCal/webcal feed. The key stays in your local database.
          </p>
          <input
            type="url"
            value={form.icalUrl}
            onChange={(e) => setForm({ ...form, icalUrl: e.target.value })}
            placeholder="https://api.zenbi.dk/exportcalendar/own/?key=…"
            className="mt-2 h-8 w-full rounded-md border border-border bg-surface-raised px-2.5 font-mono text-xs outline-none focus:border-border-strong"
            aria-label="Calendar feed URL"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="primary"
              icon={<RefreshCw className="size-3.5" />}
              loading={sync.isPending && sync.variables?.kind === "feed"}
              disabled={!form.icalUrl.trim()}
              onClick={async () => {
                await saveSettings();
                sync.mutate({ kind: "feed" }, { onSuccess: onSynced, onError });
              }}
            >
              Save & sync
            </Button>
            <Button icon={<FileUp className="size-3.5" />} onClick={() => file.current?.click()} loading={sync.isPending && sync.variables?.kind === "import"}>
              Import .ics file
            </Button>
            <input
              ref={file}
              type="file"
              accept=".ics,text/calendar"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) sync.mutate({ kind: "import", ics: await f.text() }, { onSuccess: onSynced, onError });
              }}
            />
            <Button icon={<FlaskConical className="size-3.5" />} onClick={() => sync.mutate({ kind: "demo" }, { onSuccess: onSynced, onError })} loading={sync.isPending && sync.variables?.kind === "demo"}>
              Load sample timetable
            </Button>
            <Button icon={<Layers className="size-3.5" />} onClick={openCategories} disabled={!settings?.lastSyncAt}>
              Organize categories
              {!!settings?.pendingSources && <span className="rounded-full bg-accent px-1.5 text-[10px] leading-4 font-semibold text-accent-fg">{settings.pendingSources} new</span>}
            </Button>
          </div>
          <div className="mt-3 text-[11px] text-text-faint">
            Parsing: {settings?.aiEnabled ? <>AI ({settings.aiModel}) with cached results</> : <>keyword heuristics. Add an Anthropic API key below for AI parsing.</>}
          </div>
          {result && <SyncSummary r={result} at={settings?.lastSyncAt ?? null} />}
        </Card>

        <Card title="School year" icon={<CalendarPlus className="size-4" />}>
          <p className="text-xs text-text-muted">Only events inside this range are imported and counted. Defaults to 1 Aug – 31 Jul.</p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Field label="Starts">
              <input type="date" value={form.schoolYearStart} onChange={(e) => setForm({ ...form, schoolYearStart: e.target.value })} className="h-8 rounded-md border border-border bg-surface-raised px-2 font-mono text-xs" />
            </Field>
            <Field label="Ends">
              <input type="date" value={form.schoolYearEnd} onChange={(e) => setForm({ ...form, schoolYearEnd: e.target.value })} className="h-8 rounded-md border border-border bg-surface-raised px-2 font-mono text-xs" />
            </Field>
          </div>
        </Card>

        <Card title="Week" icon={<CalendarDays className="size-4" />}>
          <p className="text-xs text-text-muted">How many days the dashboard calendar and the board's week view show. Efterskoler usually need all seven.</p>
          <div role="radiogroup" aria-label="Days per week" className="mt-2 inline-flex rounded-lg bg-surface-raised p-0.5 shadow-[inset_0_0_0_1px_var(--border)]">
            {([5, 7] as WeekDays[]).map((n) => {
              const active = (settings?.weekDays ?? 5) === n;
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() =>
                    !active &&
                    update.mutate(
                      { weekDays: n },
                      { onSuccess: () => toast({ kind: "success", text: `Weeks now show ${n === 5 ? "Monday–Friday" : "Monday–Sunday"}` }), onError },
                    )
                  }
                  className={
                    active
                      ? "h-[26px] rounded-md bg-accent px-3 text-[12px] font-medium text-accent-fg"
                      : "h-[26px] rounded-md px-3 text-[12px] font-medium text-text-muted hover:text-text"
                  }
                >
                  {n === 5 ? "5 days (Mon–Fri)" : "7 days (Mon–Sun)"}
                </button>
              );
            })}
          </div>
        </Card>

        <Card title="Lesson folders" icon={<FileUp className="size-4" />}>
          <p className="text-xs text-text-muted">
            Folders are created as <code className="font-mono">&lt;root&gt;/&lt;year&gt;/&lt;Subject&gt;/Lesson_&lt;n&gt;/</code>.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              value={form.teachingRoot}
              onChange={(e) => setForm({ ...form, teachingRoot: e.target.value })}
              className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface-raised px-2.5 font-mono text-xs outline-none focus:border-border-strong"
              aria-label="Teaching folder root"
            />
            {desktop && (
              <Button
                icon={<FolderOpen className="size-3.5" />}
                onClick={async () => {
                  const picked = await desktop!.pickFolder(form.teachingRoot || undefined);
                  if (picked) setForm({ ...form, teachingRoot: picked });
                }}
              >
                Browse…
              </Button>
            )}
          </div>
        </Card>

        {desktop && <AiKeyCard />}

        <Card title="Your data" icon={<Database className="size-4" />}>
          <p className="text-xs text-text-muted">Lessons, plans, categories and settings are saved in this file on your computer. Lesson files are stored separately, in the lesson folder above.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-surface-raised px-2.5 py-1.5 font-mono text-xs" title={settings?.databaseFile ?? ""}>
              {settings?.databaseFile ?? "…"}
            </code>
            {desktop && (
              <Button icon={<FolderOpen className="size-3.5" />} onClick={() => desktop!.openDataFolder()}>
                Open data folder
              </Button>
            )}
          </div>
        </Card>

        <div className="flex justify-end">
          <Button
            variant="primary"
            icon={<Save className="size-3.5" />}
            loading={update.isPending}
            onClick={() => saveSettings().then(() => toast({ kind: "success", text: "Settings saved. Re-sync to apply a new school-year range." }))}
          >
            Save settings
          </Button>
        </div>
      </div>
    </div>
  );
}

function AiKeyCard() {
  const toast = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState<ApiKeyStatus | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    desktop!.apiKeyStatus().then(setStatus);
  }, []);

  const save = async (value: string | null) => {
    setBusy(true);
    try {
      setStatus(await desktop!.setApiKey(value));
      setKey("");
      qc.invalidateQueries({ queryKey: keys.settings });
      toast({ kind: "success", text: value ? "API key saved. AI parsing is on." : "API key removed. Using keyword heuristics." });
    } catch (e) {
      toast({ kind: "error", text: e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="AI parsing" icon={<Sparkles className="size-4" />}>
      <p className="text-xs text-text-muted">
        Optional. With an Anthropic API key, calendar entries and to-dos are read by Claude instead of keyword rules. The key is encrypted with your Windows account and never leaves this computer except to call Anthropic.
      </p>
      {status?.source === "env" ? (
        <p className="mt-2 text-xs text-text-faint">
          Set by the <code className="font-mono">ANTHROPIC_API_KEY</code> environment variable.
        </p>
      ) : (
        <div className="mt-2 flex gap-2">
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={status?.configured ? "•••••••• (saved)" : "sk-ant-…"}
            autoComplete="off"
            spellCheck={false}
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface-raised px-2.5 font-mono text-xs outline-none focus:border-border-strong"
            aria-label="Anthropic API key"
            disabled={status?.canStore === false}
          />
          <Button variant="primary" icon={<KeyRound className="size-3.5" />} loading={busy} disabled={!key.trim()} onClick={() => save(key)}>
            Save key
          </Button>
          {status?.configured && (
            <Button disabled={busy} onClick={() => save(null)}>
              Remove
            </Button>
          )}
        </div>
      )}
      {status?.canStore === false && <p className="mt-2 text-[11px] text-warning">Secure storage isn't available on this computer, so a key can't be saved.</p>}
    </Card>
  );
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[10px] border border-border bg-surface p-4">
      <h2 className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold">
        <span className="text-text-muted">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-medium tracking-wide text-text-faint uppercase">
      {label}
      {children}
    </label>
  );
}

function SyncSummary({ r, at }: { r: SyncResult; at: string | null }) {
  const rows: [string, number][] = [
    ["Events", r.fetched],
    ["New", r.created],
    ["Removed", r.removed],
    ["Subjects added", r.subjectsCreated],
    ["Lesson cards created", r.lessonsCreated],
    ["Parsed by AI", r.aiParsed],
    ["Parsed by heuristics", r.heuristicParsed],
  ];
  return (
    <div className="mt-3 rounded-md border border-border bg-surface-raised p-3">
      <div className="mb-2 text-[11px] text-text-faint">Last sync{at && ` · ${new Date(at).toLocaleString("en-GB")}`}</div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-text-faint">{k}</dt>
            <dd className="font-medium tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {r.warnings.length > 0 && (
        <ul className="mt-2 list-disc pl-4 text-[11px] text-warning">
          {r.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
