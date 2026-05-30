// Shared markdown + syntax-highlighting helpers for the KliveAgent UI.
// Extracted so the page and its child components (AgentMessage, ScriptResultCard)
// render chat prose and C# scripts identically without duplicating the setup.
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight(str, lang) {
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

// Highlight a raw C# script body for the script-result cards.
export function highlightCsharp(code?: string): string {
  if (!code) return '';
  try {
    return hljs.highlight(code, { language: 'csharp', ignoreIllegals: true }).value;
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
