<template>
    <div class="otce" :style="{ height: typeof height === 'number' ? `${height}px` : height }">
        <div ref="host" class="host"></div>
    </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';

export interface EditorDiagnostic { Message: string; Severity?: string; Line?: number | null; Column?: number | null; EndLine?: number | null; EndColumn?: number | null }
export interface EditorCompletion { Name: string; Kind: string; Signature: string; Owner?: string; Returns?: string | null }

const props = withDefaults(defineProps<{
    modelValue: string;
    diagnostics?: EditorDiagnostic[];
    completions?: EditorCompletion[];
    readonly?: boolean;
    height?: number | string;
}>(), { diagnostics: () => [], completions: () => [], readonly: false, height: 520 });

const emit = defineEmits<{ 'update:modelValue': [value: string]; save: []; run: [] }>();

const host = ref<HTMLElement | null>(null);
const view = shallowRef<any>(null);
let mods: any = null;
let applyingExternal = false;

const KEYWORDS = ['public', 'private', 'protected', 'override', 'class', 'var', 'if', 'else', 'for', 'foreach', 'while', 'return', 'new', 'double', 'int', 'bool', 'string',
    'decimal', 'true', 'false', 'null', 'using', 'namespace', 'sealed', 'readonly', 'const', 'static', 'void', 'get', 'set', 'init', 'in', 'is', 'switch', 'case', 'break', 'continue',
    'Math', 'Math.Abs', 'Math.Max', 'Math.Min', 'Math.Sqrt', 'Math.Log', 'Math.Exp', 'Math.Round', 'double.IsNaN', 'List<double>', 'Dictionary<string, double>'];

onMounted(async () => {
    const [state, viewMod, commands, language, clike, autocomplete, lint, search, highlight] = await Promise.all([
        import('@codemirror/state'), import('@codemirror/view'), import('@codemirror/commands'), import('@codemirror/language'),
        import('@codemirror/legacy-modes/mode/clike'), import('@codemirror/autocomplete'), import('@codemirror/lint'),
        import('@codemirror/search'), import('@lezer/highlight'),
    ]);
    mods = { state, viewMod, lint };
    const theme = viewMod.EditorView.theme({
        '&': { height: '100%', backgroundColor: '#050607', color: '#d7dce2', fontSize: '12.5px' },
        '.cm-content': { fontFamily: "'JetBrains Mono', ui-monospace, Consolas, monospace", caretColor: '#f5a524' },
        '.cm-gutters': { backgroundColor: '#08090b', color: '#525b65', border: 'none', borderRight: '1px solid #1d2228' },
        '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.025)' },
        '.cm-activeLineGutter': { backgroundColor: 'rgba(245,165,36,0.08)', color: '#f5a524' },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'rgba(74,168,255,0.25) !important' },
        '.cm-cursor': { borderLeftColor: '#f5a524' },
        '.cm-tooltip': { backgroundColor: '#13161a', border: '1px solid #2d343d', color: '#e2e6eb' },
        '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'rgba(245,165,36,0.18)', color: '#ffc35c' },
        '.cm-completionDetail': { color: '#7d8893', fontStyle: 'normal', marginLeft: '8px' },
        '.cm-scroller': { overflow: 'auto' },
        '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy #f2545b' },
        '.cm-lintRange-warning': { backgroundImage: 'none', textDecoration: 'underline wavy #e8a317' },
        '.cm-panels': { backgroundColor: '#0d0f12', color: '#e2e6eb' },
        '.cm-searchMatch': { backgroundColor: 'rgba(245,165,36,0.25)' },
        '.cm-matchingBracket': { backgroundColor: 'rgba(74,168,255,0.25)', outline: 'none' },
    }, { dark: true });

    const complete = (ctx: any) => {
        const word = ctx.matchBefore(/[\w.]+/);
        if (!word || (word.from === word.to && !ctx.explicit)) return null;
        const options = [
            ...props.completions.map(c => ({
                label: c.Name, type: c.Kind === 'property' ? 'property' : c.Kind === 'override' ? 'keyword' : 'function',
                detail: c.Returns ? `${c.Signature} → ${c.Returns}` : c.Signature, boost: c.Owner === 'ScriptStrategy' ? 2 : 1,
                apply: c.Kind === 'method' ? `${c.Name}(` : c.Kind === 'override' ? `${c.Name}()` : c.Name,
            })),
            ...KEYWORDS.map(k => ({ label: k, type: 'keyword' })),
        ];
        return { from: word.from, options, validFor: /^[\w.]*$/ };
    };

    const keys = viewMod.keymap.of([
        { key: 'Mod-s', preventDefault: true, run: () => { emit('save'); return true; } },
        { key: 'Mod-Enter', preventDefault: true, run: () => { emit('run'); return true; } },
        ...autocomplete.closeBracketsKeymap, ...commands.defaultKeymap, ...search.searchKeymap, ...commands.historyKeymap,
        ...language.foldKeymap, ...autocomplete.completionKeymap, commands.indentWithTab,
    ]);

    view.value = new viewMod.EditorView({
        parent: host.value!,
        state: state.EditorState.create({
            doc: props.modelValue,
            extensions: [
                viewMod.lineNumbers(), viewMod.highlightActiveLineGutter(), viewMod.highlightSpecialChars(), commands.history(),
                language.foldGutter(), viewMod.drawSelection(), viewMod.dropCursor(), state.EditorState.allowMultipleSelections.of(true),
                language.indentOnInput(), language.syntaxHighlighting(highlight.classHighlighter), language.bracketMatching(), autocomplete.closeBrackets(),
                autocomplete.autocompletion({ override: [complete], activateOnTyping: true, maxRenderedOptions: 60 }),
                viewMod.rectangularSelection(), viewMod.crosshairCursor(), viewMod.highlightActiveLine(), search.highlightSelectionMatches(),
                lint.lintGutter(), language.StreamLanguage.define(clike.csharp), language.indentUnit.of('    '),
                state.EditorState.readOnly.of(props.readonly), keys, theme,
                viewMod.EditorView.updateListener.of((u: any) => {
                    if (u.docChanged && !applyingExternal) emit('update:modelValue', u.state.doc.toString());
                }),
            ],
        }),
    });
    pushDiagnostics();
});

function pushDiagnostics() {
    const v = view.value;
    if (!v || !mods) return;
    const doc = v.state.doc;
    const lineAt = (n: number) => doc.line(Math.min(Math.max(1, n), doc.lines));
    const list = props.diagnostics.filter(d => d.Line).map(d => {
        const line = lineAt(d.Line!);
        const from = Math.min(line.to, line.from + Math.max(0, (d.Column ?? 1) - 1));
        const endLine = lineAt(d.EndLine ?? d.Line!);
        let to = Math.min(endLine.to, endLine.from + Math.max(0, (d.EndColumn ?? (d.Column ?? 1) + 1) - 1));
        if (to <= from) to = Math.min(line.to, from + 1);
        return { from, to: Math.max(to, from), severity: d.Severity === 'warning' ? 'warning' : d.Severity === 'info' ? 'info' : 'error', message: d.Message };
    });
    v.dispatch(mods.lint.setDiagnostics(v.state, list));
}

watch(() => props.modelValue, value => {
    const v = view.value;
    if (!v || value === v.state.doc.toString()) return;
    applyingExternal = true;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    applyingExternal = false;
});
watch(() => props.diagnostics, pushDiagnostics, { deep: true });

function gotoLine(line: number, column = 1) {
    const v = view.value;
    if (!v) return;
    const l = v.state.doc.line(Math.min(Math.max(1, line), v.state.doc.lines));
    const pos = Math.min(l.to, l.from + Math.max(0, column - 1));
    v.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    v.focus();
}

onBeforeUnmount(() => { view.value?.destroy(); view.value = null; });
defineExpose({ gotoLine, focus: () => view.value?.focus() });
</script>

<style scoped>
.otce { position: relative; border: 1px solid var(--ot-line); border-radius: var(--ot-radius-sm); overflow: hidden; }
.host { position: absolute; inset: 0; }
.host :deep(.cm-editor) { height: 100%; }
.host :deep(.cm-editor.cm-focused) { outline: none; }
/* Token colours hang off stable tok-* classes: CodeMirror's generated highlight classes lose to the
   terminal's colour-inherit reset, which has equal specificity and loads later. */
.host :deep(.cm-content) { color: #d7dce2; }
.host :deep(.tok-keyword) { color: #f5a524; }
.host :deep(.tok-typeName), .host :deep(.tok-className), .host :deep(.tok-namespace) { color: #4aa8ff; }
.host :deep(.tok-number), .host :deep(.tok-bool) { color: #c8d05a; }
.host :deep(.tok-atom) { color: #e05cc0; }
.host :deep(.tok-string), .host :deep(.tok-string2) { color: #26c281; }
.host :deep(.tok-comment) { color: #5b6672; font-style: italic; }
.host :deep(.tok-operator), .host :deep(.tok-punctuation) { color: #aab3bd; }
.host :deep(.tok-meta) { color: #a78bfa; }
.host :deep(.tok-definition) { color: #ffd38a; }
.host :deep(.tok-variableName2) { color: #2ec4c9; }
.host :deep(.tok-invalid) { color: #f2545b; }
</style>
