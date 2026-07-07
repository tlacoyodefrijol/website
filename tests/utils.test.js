import { describe, it, expect } from 'vitest';
import { formatDate, renderTags, collectTags, esc } from '../public/utils.js';

describe('esc', () => {
  it('escapes HTML-significant characters', () => {
    expect(esc('<script>"&"</script>')).toBe('&lt;script&gt;&quot;&amp;&quot;&lt;/script&gt;');
  });
  it('handles null/undefined as empty string', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------
describe('formatDate', () => {
  it('formats a standard ISO date string', () => {
    expect(formatDate('2026-03-17')).toBe('17 March 2026');
  });

  it('formats 1 January correctly', () => {
    expect(formatDate('2024-01-01')).toBe('1 January 2024');
  });

  it('formats a mid-year date correctly', () => {
    expect(formatDate('2023-07-04')).toBe('4 July 2023');
  });

  it('returns the original string when the date is invalid', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });

  it('returns the original string for an empty string', () => {
    expect(formatDate('')).toBe('');
  });

  it('handles a two-digit day without a leading zero', () => {
    expect(formatDate('2025-12-25')).toBe('25 December 2025');
  });

  it('accepts a Date object (as gray-matter produces)', () => {
    expect(formatDate(new Date('2026-03-17T12:00:00'))).toBe('17 March 2026');
  });
});

// ---------------------------------------------------------------------------
// renderTags — no linkBase (plain badges)
// ---------------------------------------------------------------------------
describe('renderTags (plain, no linkBase)', () => {
  it('wraps each tag in <span class="tag"> inside <li>', () => {
    const html = renderTags(['meta', 'code']);
    expect(html).toContain('<span class="tag">meta</span>');
    expect(html).toContain('<span class="tag">code</span>');
  });

  it('wraps the list in <ul class="tags">', () => {
    const html = renderTags(['one']);
    expect(html).toMatch(/^<ul class="tags">/);
    expect(html).toMatch(/<\/ul>$/);
  });

  it('returns an empty string for an empty array', () => {
    expect(renderTags([])).toBe('');
  });

  it('returns an empty string when called with no arguments', () => {
    expect(renderTags()).toBe('');
  });

  it('returns an empty string for undefined', () => {
    expect(renderTags(undefined)).toBe('');
  });

  it('renders the correct number of <li> elements', () => {
    const html = renderTags(['a', 'b', 'c', 'd']);
    expect((html.match(/<li>/g) || []).length).toBe(4);
  });

  it('does not include any <a> elements when no linkBase is given', () => {
    const html = renderTags(['foo', 'bar']);
    expect(html).not.toContain('<a ');
  });
});

// ---------------------------------------------------------------------------
// renderTags — with linkBase (linked tags)
// ---------------------------------------------------------------------------
describe('renderTags (linked, with linkBase)', () => {
  it('wraps each tag in <a class="tag"> with the correct href', () => {
    const html = renderTags(['meta'], '#thoughts/all');
    expect(html).toContain('class="tag"');
    expect(html).toContain('href="#thoughts/all?tag=meta"');
    expect(html).toContain('>meta<');
  });

  it('URL-encodes tags that contain spaces or special chars', () => {
    const html = renderTags(['open source'], '#thoughts/all');
    expect(html).toContain('tag=open%20source');
  });

  it('renders multiple linked tags', () => {
    const html = renderTags(['a', 'b'], '#others');
    expect(html).toContain('href="#others?tag=a"');
    expect(html).toContain('href="#others?tag=b"');
  });

  it('returns empty string for empty array even with linkBase', () => {
    expect(renderTags([], '#thoughts/all')).toBe('');
  });

  it('does not include any <span> elements when linkBase is given', () => {
    const html = renderTags(['foo'], '#thoughts/all');
    expect(html).not.toContain('<span');
  });
});

// ---------------------------------------------------------------------------
// collectTags
// ---------------------------------------------------------------------------
describe('collectTags', () => {
  it('returns an empty array for an empty list', () => {
    expect(collectTags([])).toEqual([]);
  });

  it('returns an empty array when called with no arguments', () => {
    expect(collectTags()).toEqual([]);
  });

  it('collects tags from a single item', () => {
    expect(collectTags([{ tags: ['meta', 'code'] }])).toEqual(['code', 'meta']);
  });

  it('deduplicates tags across multiple items', () => {
    const items = [{ tags: ['a', 'b'] }, { tags: ['b', 'c'] }];
    expect(collectTags(items)).toEqual(['a', 'b', 'c']);
  });

  it('sorts tags alphabetically', () => {
    const items = [{ tags: ['zebra', 'apple', 'mango'] }];
    expect(collectTags(items)).toEqual(['apple', 'mango', 'zebra']);
  });

  it('ignores items with no tags property', () => {
    const items = [{ title: 'no tags' }, { tags: ['hello'] }];
    expect(collectTags(items)).toEqual(['hello']);
  });

  it('ignores items with an empty tags array', () => {
    const items = [{ tags: [] }, { tags: ['x'] }];
    expect(collectTags(items)).toEqual(['x']);
  });

  it('handles a mix of items with and without tags', () => {
    const items = [
      { tags: ['design', 'code'] },
      { tags: ['code', 'writing'] },
      { title: 'no tags here' },
    ];
    expect(collectTags(items)).toEqual(['code', 'design', 'writing']);
  });
});
