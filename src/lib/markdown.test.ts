import { describe, expect, it } from 'vitest';
import { renderMarkdown, toggleTask } from './markdown';

describe('markdown', () => {
  it('renders GFM and sanitizes HTML', () => {
    const html = renderMarkdown('**bold** <img src=x onerror="alert(1)"> [l](https://a.b)\n- [ ] task');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).not.toContain('onerror');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('class="md-task"');
  });

  it('blocks javascript: links', () => {
    expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('javascript:');
  });

  it('toggles the n-th task', () => {
    const src = '- [ ] a\n- [x] b\n* [ ] c';
    expect(toggleTask(src, 0)).toBe('- [x] a\n- [x] b\n* [ ] c');
    expect(toggleTask(src, 1)).toBe('- [ ] a\n- [ ] b\n* [ ] c');
    expect(toggleTask(src, 2)).toBe('- [ ] a\n- [x] b\n* [x] c');
  });
});
