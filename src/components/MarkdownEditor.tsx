import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { EditorState, RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, keymap, placeholder as cmPlaceholder, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { tags as t } from "@lezer/highlight";

export type MarkdownFormat = "h2" | "bold" | "italic" | "list" | "check" | "link";
export interface MarkdownEditorHandle {
  format: (kind: MarkdownFormat) => void;
  focus: () => void;
}

/**
 * Obsidian-style live editing: you type Markdown, and it's styled in place
 * (headings grow, **bold** turns bold, syntax markers fade). Task checkboxes
 * are real, clickable checkboxes.
 */
export function MarkdownEditor({
  value,
  onChange,
  onBlur,
  placeholder,
  ref,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  ref?: Ref<MarkdownEditorHandle>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cb = useRef({ onChange, onBlur });
  cb.current = { onChange, onBlur };

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(liveStyle),
          taskCheckboxes,
          EditorView.lineWrapping,
          cmPlaceholder(placeholder ?? ""),
          editorTheme,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cb.current.onChange(u.state.doc.toString());
            if (u.focusChanged && !u.view.hasFocus) cb.current.onBlur?.();
          }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // The editor is created once; value changes are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Adopt outside changes (e.g. undo from a toast) without clobbering typing.
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  useImperativeHandle(ref, () => ({
    focus: () => view.current?.focus(),
    format: (kind) => {
      const v = view.current;
      if (!v) return;
      const { from, to } = v.state.selection.main;
      const sel = v.state.sliceDoc(from, to);
      if (kind === "bold" || kind === "italic" || kind === "link") {
        const [open, close, fallback] = kind === "bold" ? ["**", "**", "bold"] : kind === "italic" ? ["*", "*", "italic"] : ["[", "](https://)", "link"];
        const text = sel || fallback;
        v.dispatch({ changes: { from, to, insert: open + text + close }, selection: { anchor: from + open.length, head: from + open.length + text.length } });
      } else {
        const line = v.state.doc.lineAt(from);
        const prefix = kind === "h2" ? "## " : kind === "list" ? "- " : "- [ ] ";
        v.dispatch({ changes: { from: line.from, insert: prefix }, selection: { anchor: from + prefix.length } });
      }
      v.focus();
    },
  }));

  return <div ref={host} className="md-live" />;
}

const liveStyle = HighlightStyle.define([
  { tag: t.heading1, fontSize: "1.55em", fontWeight: "700", lineHeight: "1.3" },
  { tag: t.heading2, fontSize: "1.3em", fontWeight: "700", lineHeight: "1.35" },
  { tag: t.heading3, fontSize: "1.12em", fontWeight: "650" },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: "650" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through", color: "var(--text-faint)" },
  { tag: t.link, color: "var(--accent)", textDecoration: "underline" },
  { tag: t.url, color: "var(--text-faint)" },
  { tag: t.monospace, fontFamily: "var(--font-mono)", fontSize: "0.9em", backgroundColor: "var(--surface-hover)", borderRadius: "3px" },
  { tag: t.quote, fontStyle: "italic", color: "var(--text-muted)" },
  // Syntax markers: #, **, -, >, `, [ ] — visible but faded, like Obsidian.
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: "var(--text-faint)", fontWeight: "400" },
]);

const editorTheme = EditorView.theme({
  "&": { fontSize: "14px", backgroundColor: "transparent", color: "var(--text)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-sans)", lineHeight: "1.65" },
  ".cm-content": { padding: "4px 0", caretColor: "var(--accent)", minHeight: "220px" },
  ".cm-line": { padding: "0 2px" },
  ".cm-placeholder": { color: "var(--text-faint)", fontStyle: "italic" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": { backgroundColor: "var(--accent-soft) !important" },
  ".cm-cursor": { borderLeftColor: "var(--accent)" },
  ".cm-task": { verticalAlign: "-2px", margin: "0 4px 0 0", accentColor: "var(--accent)", cursor: "pointer" },
});

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked;
  }
  toDOM() {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "cm-task";
    box.checked = this.checked;
    box.setAttribute("aria-label", this.checked ? "Mark as not done" : "Mark as done");
    return box;
  }
  ignoreEvent() {
    return false;
  }
}

function checkboxDecorations(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== "TaskMarker") return;
        const checked = /x/i.test(view.state.sliceDoc(node.from, node.to));
        b.add(node.from, node.to, Decoration.replace({ widget: new CheckboxWidget(checked) }));
      },
    });
  }
  return b.finish();
}

const taskCheckboxes = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = checkboxDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) this.decorations = checkboxDecorations(u.view);
    }
  },
  {
    decorations: (p) => p.decorations,
    eventHandlers: {
      mousedown(e, view) {
        const el = e.target as HTMLElement;
        if (!el.classList.contains("cm-task")) return false;
        const pos = view.posAtDOM(el);
        const text = view.state.sliceDoc(pos, pos + 3);
        const next = /x/i.test(text) ? "[ ]" : "[x]";
        view.dispatch({ changes: { from: pos, to: pos + 3, insert: next } });
        e.preventDefault();
        return true;
      },
    },
  },
);
