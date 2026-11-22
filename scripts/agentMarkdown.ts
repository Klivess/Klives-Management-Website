// Shared markdown + syntax-highlighting helpers for the KliveAgent UI.
// Extracted so the page and its child components (AgentMessage, ScriptResultCard)
// render chat prose and scripts identically without duplicating the setup.
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight(str: string, lang: string) {
    try {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
      }
      return hljs.highlightAuto(str).value;
    } catch {
      return '';
    }
  },
});

// Render chat message markdown to HTML (used with v-html).
export function renderMarkdown(text?: string): string {
  if (!text) return '';
  return md.render(text);
}

// KliveAgent's scripts are JavaScript since 22 Nov 2026; conversations from before then hold C#. These
// are the C# shapes that JavaScript never has, the same ones the server's "this looks like C#" hint checks.
const LOOKS_LIKE_CSHARP = /\bforeach\s*\(|\$"|\bnew\s+(List|Dictionary|HashSet)<|\b(string|int|bool|double|long|decimal|object)\s+[A-Za-z_]\w*\s*[=;]|\((Action|Func)<|\busing\s+(var|System)\b|\bawait\s+Aw\(\(|\(Task<|\bvar\s+\w+\s*=\s*Dyn\(|\bDyn\(/;

/** The language a script the agent ran was written in: JavaScript now, C# for older runs. */
export function scriptLanguage(code?: string): 'javascript' | 'csharp' {
  return code && LOOKS_LIKE_CSHARP.test(code) ? 'csharp' : 'javascript';
}

// Highlight a raw script body for the script-result cards, in the language it was written in.
export function highlightScript(code?: string): string {
  if (!code) return '';
  try {
    return hljs.highlight(code, { language: scriptLanguage(code), ignoreIllegals: true }).value;
  } catch {
    return md.utils.escapeHtml(code);
  }
}

export async function copyToClipboard(text?: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text ?? '');
  } catch {
    /* clipboard unavailable — ignore */
  }
}
