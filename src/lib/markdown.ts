import { Marked } from 'marked';
import DOMPurify from 'dompurify';

const md = new Marked({ gfm: true, breaks: true });

md.use({
  renderer: {
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const t = title ? ` title="${title}"` : '';
      return `<a href="${href}"${t} target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
    checkbox({ checked }) {
      return `<input type="checkbox" class="md-task"${checked ? ' checked' : ''}> `;
    },
  },
});

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

const cache = new Map<string, string>();

export function renderMarkdown(src: string): string {
  const hit = cache.get(src);
  if (hit !== undefined) return hit;
  const html = DOMPurify.sanitize(md.parse(src, { async: false }) as string, {
    ADD_ATTR: ['target', 'checked'],
    FORBID_TAGS: ['style', 'iframe', 'form'],
  });
  if (cache.size > 500) cache.clear();
  cache.set(src, html);
  return html;
}

const TASK_RE = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/gm;

/** Toggle the n-th task-list checkbox in the markdown source. */
export function toggleTask(src: string, index: number): string {
  let i = 0;
  return src.replace(TASK_RE, (m, a: string, mark: string, b: string) => {
    if (i++ !== index) return m;
    return a + (mark === ' ' ? 'x' : ' ') + b;
  });
}

/** Plain-text preview of markdown, e.g. for titles. */
export function plainText(src: string): string {
  return src
    .replace(/[#>*_`~[\]()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
