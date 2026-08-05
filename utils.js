// Pure utility functions — ES module used by browser and tests

/**
 * Escape a value for safe interpolation into HTML text or a quoted attribute.
 * Frontmatter and URL-query values pass through here before hitting innerHTML.
 */
export function esc(s) {
  return String(s ?? '').replace(/[<>&"]/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

/**
 * Format an ISO date string into "DD Month YYYY" (e.g. "17 March 2026").
 * Noon-anchored to avoid UTC off-by-one in Western timezones.
 * Returns the original string if the date is invalid.
 */
export function formatDate(dateStr) {
  // gray-matter produces Date objects server-side; JSON serialises them as
  // "2026-03-17T00:00:00.000Z". Either way, slice to YYYY-MM-DD and anchor
  // to noon so Western-timezone UTC offsets don't roll the day back.
  const ymd = dateStr instanceof Date
    ? dateStr.toISOString().slice(0, 10)
    : String(dateStr).slice(0, 10);
  const d = new Date(ymd + 'T12:00:00');
  if (isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Render an array of tag strings as a <ul class="tags"> list.
 *
 * @param {string[]}      tags     - Tags to render.
 * @param {string|null}   linkBase - Optional base URL (e.g. "#thoughts/all").
 *                                   When provided each tag becomes a link:
 *                                   <a href="linkBase?tag=foo" class="tag">foo</a>
 *                                   When omitted each tag is a plain <span>.
 * Returns an empty string when tags is empty or undefined.
 */
export function renderTags(tags = [], linkBase = null) {
  if (!tags || !tags.length) return '';
  const items = tags.map(t => {
    const inner = linkBase
      ? `<a href="${linkBase}?tag=${encodeURIComponent(t)}" class="tag">${esc(t)}</a>`
      : `<span class="tag">${esc(t)}</span>`;
    return `<li>${inner}</li>`;
  });
  return `<ul class="tags">${items.join('')}</ul>`;
}

/**
 * Collect all unique tags from an array of items (posts or projects),
 * returned in alphabetical order.
 *
 * @param  {{ tags?: string[] }[]} items
 * @returns {string[]}
 */
export function collectTags(items = []) {
  const set = new Set();
  for (const item of items) {
    for (const tag of (item.tags || [])) set.add(tag);
  }
  return [...set].sort();
}
