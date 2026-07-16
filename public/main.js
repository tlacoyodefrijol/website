import { formatDate, renderTags, collectTags, esc } from './utils.js';
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@13.0.3/lib/marked.esm.js';

// ---------------------------------------------------------------------------
// Edit these to personalise the home page
// ---------------------------------------------------------------------------
const TAGLINE = "Hi, I'm Oscar. I build tech things.";

const SOCIAL_LINKS = [
  { label: 'GitHub', url: 'https://github.com/tlacoyodefrijol' },
  // { label: 'LinkedIn',  url: 'https://linkedin.com/in/yourname' },
  // { label: 'Mastodon',  url: 'https://mastodon.social/@you'     },
  { label: 'Email',  url: 'mailto:me@oscarmontiel.net' },
];

// Icon per SOCIAL_LINKS label, keyed by the same `label` string above.
const FOOTER_ICONS = {
  GitHub: '<svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>',
  Email: '<svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M1.5 4.5A1.5 1.5 0 013 3h10a1.5 1.5 0 011.5 1.5v7A1.5 1.5 0 0113 13H3a1.5 1.5 0 01-1.5-1.5v-7zm1.5.379V11.5a.5.5 0 00.5.5h10a.5.5 0 00.5-.5V4.879l-5.146 3.15a1 1 0 01-1.048 0L3 4.879z"/></svg>',
};

// Mirrors whatever's actually live in .site-nav (some sections are
// deliberately hidden there for now — see index.html).
const FOOTER_LINKS = [
  { label: 'Thoughts', url: '#thoughts' },
  { label: 'About',    url: '#about' },
];

function renderFooter() {
  const nav = FOOTER_LINKS.map(l => `<a href="${l.url}">${l.label}</a>`).join('');
  const social = SOCIAL_LINKS.map(s => `
    <a href="${s.url}" target="_blank" rel="noopener noreferrer" aria-label="${esc(s.label)}">${FOOTER_ICONS[s.label] || ''}</a>
  `).join('');

  return `
    <div class="footer-top">
      <span class="footer-name">Oscar Montiel</span>
      <nav class="footer-nav">${nav}</nav>
    </div>
    <div class="footer-social">${social}</div>
  `;
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('site-footer').innerHTML = renderFooter();
});

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function setApp(html) {
  document.getElementById('app').innerHTML = html;
  window.scrollTo(0, 0);
  updateHeroParallax();
}

/**
 * Full-bleed post header image that slides on scroll (parallax — see
 * updateHeroParallax). Returns '' when the post has no image.
 */
function postHero(image) {
  if (!image) return '';
  return `<div class="post-hero-wrap"><div class="post-hero"><img src="${esc(image)}" alt=""></div></div>`;
}

// Slide the post hero image at a slower rate than the page as it scrolls.
// Starts at the image's top and pans down. ponytail: one passive,
// rAF-throttled scroll listener — cheapest real parallax.
let heroTicking = false;
function updateHeroParallax() {
  const img = document.querySelector('.post-hero img');
  if (img) img.style.transform = `translate3d(0, ${-window.scrollY * 0.3}px, 0)`;
  heroTicking = false;
}
window.addEventListener('scroll', () => {
  if (!heroTicking) { requestAnimationFrame(updateHeroParallax); heroTicking = true; }
}, { passive: true });

// Expose the header's real height as --nav-h so the hero can pin just below it.
function setNavHeightVar() {
  const header = document.querySelector('.site-header');
  if (header) document.documentElement.style.setProperty('--nav-h', header.offsetHeight + 'px');
}
window.addEventListener('resize', setNavHeightVar);
document.addEventListener('DOMContentLoaded', setNavHeightVar);

/**
 * Build the tag filter bar — an "All" pill plus one pill per tag.
 * Returns empty string when there are no tags.
 */
function tagFilterBar(allTags, active, baseUrl) {
  if (!allTags.length) return '';
  const pills = [
    `<a href="${baseUrl}" class="tag-pill${!active ? ' active' : ''}">All</a>`,
    ...allTags.map(t =>
      `<a href="${baseUrl}?tag=${encodeURIComponent(t)}" class="tag-pill${t === active ? ' active' : ''}">${esc(t)}</a>`
    ),
  ].join('');
  return `<div class="tag-filter-bar">${pills}</div>`;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Fetch a section list from the API. Returns the parsed array or throws.
 */
async function fetchList(section) {
  const resp = await fetch(`/api/${section}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

/**
 * Render a filterable list page for any section.
 * mapItem(entry) → HTML string for one <li>.
 */
async function renderList(section, label, mapItem, activeTag) {
  setApp('<p class="loading">Loading…</p>');
  let items;
  try {
    items = await fetchList(section);
  } catch {
    setApp('<p class="error">Could not load entries. Please try again later.</p>');
    return;
  }

  const allTags  = collectTags(items);
  const filtered = activeTag
    ? items.filter(i => (i.tags || []).includes(activeTag))
    : items;

  const filterBar = tagFilterBar(allTags, activeTag, `#${section}`);
  const listHtml  = filtered.length
    ? `<ul class="project-list">${filtered.map(mapItem).join('')}</ul>`
    : `<p class="empty">${activeTag ? `No entries tagged "${esc(activeTag)}".` : 'Nothing here yet.'}</p>`;

  setApp(`
    <div class="content-col">
      <p class="section-heading">${label}</p>
      ${filterBar}
      ${listHtml}
    </div>
  `);
}

/**
 * Render a single markdown entry page for any section.
 * buildMeta(meta) → HTML string for the <header> block.
 */
async function renderEntry(section, slug, buildMeta) {
  setApp('<p class="loading">Loading…</p>');
  let data;
  try {
    const resp = await fetch(`/api/${section}/${encodeURIComponent(slug)}`);
    if (resp.status === 404) { setApp('<p class="error">Not found.</p>'); return; }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    data = await resp.json();
  } catch {
    setApp('<p class="error">Could not load entry. Please try again later.</p>');
    return;
  }

  const { meta, content } = data;
  const body = marked.parse(content);
  const sectionLabel = section.charAt(0).toUpperCase() + section.slice(1);

  const inner = `
    <div class="post-single">
      <a href="#${section}" class="back-link">← ${sectionLabel}</a>
      <header class="post-single-header">
        ${buildMeta(meta)}
      </header>
      <article class="post-body">${body}</article>
    </div>`;
  setApp(meta.image
    ? `${postHero(meta.image)}<div class="post-cover">${inner}</div>`
    : inner);
}

// ---------------------------------------------------------------------------
// Views — Thoughts
// ---------------------------------------------------------------------------

function postCard(p) {
  return `
    <article class="post-card${p.image ? ' has-image' : ''}">
      ${p.image ? `<a href="#thoughts/${p.slug}" class="post-card-image"><img src="${esc(p.image)}" alt="" loading="lazy"></a>` : ''}
      <div class="post-card-body">
        <span class="post-date">${formatDate(p.date)}</span>
        <h2 class="post-card-title"><a href="#thoughts/${p.slug}">${esc(p.title)}</a></h2>
        ${p.description ? `<p class="post-card-excerpt">${esc(p.description)}</p>` : ''}
        ${renderTags(p.tags, '#thoughts/all')}
      </div>
    </article>
  `;
}

/**
 * Other posts ranked by shared tags (desc), then recency. Returns [] when
 * there's nothing worth showing (e.g. only one post on the whole site).
 */
function relatedPosts(currentSlug, currentTags, allPosts, n = 3) {
  const tags = new Set(currentTags || []);
  return allPosts
    .filter(p => p.slug !== currentSlug)
    .map(p => ({ post: p, shared: (p.tags || []).filter(t => tags.has(t)).length }))
    .sort((a, b) => b.shared - a.shared || new Date(b.post.date) - new Date(a.post.date))
    .slice(0, n)
    .map(x => x.post);
}

async function renderHome() {
  setApp('<p class="loading">Loading…</p>');

  let posts;
  try {
    posts = await fetchList('posts');
  } catch {
    setApp('<p class="error">Could not load posts. Please try again later.</p>');
    return;
  }

  const cards = posts.map(postCard).join('');

  const galleryHtml = posts.length
    ? `<div class="home-gallery">${cards}</div>`
    : `<p class="empty">Nothing here yet.</p>`;

  setApp(`
    <div>
      <section class="home-hero">
        <p class="home-tagline">${TAGLINE}</p>
      </section>
      <section>
        <p class="section-heading">Thoughts</p>
        ${galleryHtml}
      </section>
    </div>
  `);
}

async function renderPostList(activeTag = null) {
  setApp('<p class="loading">Loading…</p>');

  let posts;
  try {
    posts = await fetchList('posts');
  } catch {
    setApp('<p class="error">Could not load posts. Please try again later.</p>');
    return;
  }

  const allTags  = collectTags(posts);
  const filtered = activeTag
    ? posts.filter(p => (p.tags || []).includes(activeTag))
    : posts;

  const filterBar = tagFilterBar(allTags, activeTag, '#thoughts/all');
  const listHtml  = filtered.length
    ? `<ul class="post-list">
        ${filtered.map(p => `
          <li class="post-item">
            <div class="post-item-meta">
              <span class="post-date">${formatDate(p.date)}</span>
              ${renderTags(p.tags, '#thoughts/all')}
            </div>
            <div class="post-item-right">
              <p class="post-title"><a href="#thoughts/${p.slug}">${esc(p.title)}</a></p>
              ${p.description ? `<p class="post-excerpt">${esc(p.description)}</p>` : ''}
            </div>
          </li>
        `).join('')}
       </ul>`
    : `<p class="empty">No posts tagged "${esc(activeTag)}".</p>`;

  setApp(`
    <div class="content-col">
      <p class="section-heading">All thoughts</p>
      ${filterBar}
      ${listHtml}
    </div>
  `);
}

async function renderPost(slug) {
  setApp('<p class="loading">Loading…</p>');

  let data;
  try {
    const resp = await fetch(`/api/posts/${encodeURIComponent(slug)}`);
    if (resp.status === 404) { setApp('<p class="error">Post not found.</p>'); return; }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    data = await resp.json();
  } catch {
    setApp('<p class="error">Could not load post. Please try again later.</p>');
    return;
  }

  const { meta, content } = data;
  const body = marked.parse(content);

  // Find the next (older) post and related posts. Best-effort: if the list
  // can't be fetched, we just omit the Next button and related section.
  let next = null, related = [];
  try {
    const posts = await fetchList('posts');
    const i = posts.findIndex(p => p.slug === slug);
    if (i !== -1 && i + 1 < posts.length) next = posts[i + 1];
    related = relatedPosts(slug, meta.tags, posts);
  } catch { /* no Next link / related posts */ }

  const postNav = `
    <nav class="post-nav">
      <a href="#thoughts/all" class="back-link">← All thoughts</a>
      ${next ? `<a href="#thoughts/${next.slug}" class="next-link">Next →</a>` : ''}
    </nav>`;

  const relatedHtml = related.length ? `
    <section class="related-posts">
      <p class="section-heading">Related posts</p>
      <div class="home-gallery">${related.map(postCard).join('')}</div>
    </section>` : '';

  const inner = `
    <div class="post-single">
      <header class="post-single-header">
        <span class="post-single-date">${formatDate(meta.date)}</span>
        <h1 class="post-single-title">${esc(meta.title)}</h1>
        ${renderTags(meta.tags, '#thoughts/all')}
      </header>
      <article class="post-body">${body}</article>
      ${relatedHtml}
      ${postNav}
    </div>`;
  setApp(meta.image
    ? `${postHero(meta.image)}<div class="post-cover">${inner}</div>`
    : inner);
}

// ---------------------------------------------------------------------------
// Views — Projects
// ---------------------------------------------------------------------------

function renderProjects(activeTag = null) {
  renderList('projects', 'Projects', p => `
    <li class="project-item">
      <span class="project-year">${esc(p.year || '')}</span>
      <div class="project-right">
        <p class="project-title"><a href="#projects/${p.slug}">${esc(p.title)}</a></p>
        ${p.description ? `<p class="project-desc">${esc(p.description)}</p>` : ''}
        ${renderTags(p.tags, '#projects')}
      </div>
    </li>
  `, activeTag);
}

function renderProjectEntry(slug) {
  renderEntry('projects', slug, meta => `
    <span class="post-single-date">${meta.year ? esc(meta.year) : formatDate(meta.date)}</span>
    <h1 class="post-single-title">${esc(meta.title)}</h1>
    ${meta.description ? `<p class="post-excerpt" style="margin-bottom:0.75rem">${esc(meta.description)}</p>` : ''}
    ${meta.url ? `<a href="${esc(meta.url)}" class="all-link" target="_blank" rel="noopener noreferrer">Visit project →</a>` : ''}
    ${renderTags(meta.tags, '#projects')}
  `);
}

// ---------------------------------------------------------------------------
// Views — Music
// ---------------------------------------------------------------------------

function renderMusic(activeTag = null) {
  renderList('music', 'Music', m => `
    <li class="project-item">
      <span class="project-year">${esc(m.year || '')}</span>
      <div class="project-right">
        <p class="project-title"><a href="#music/${m.slug}">${esc(m.title)}</a></p>
        ${m.artist ? `<p class="project-desc">${esc(m.artist)}</p>` : ''}
        ${renderTags(m.tags, '#music')}
      </div>
    </li>
  `, activeTag);
}

function renderMusicEntry(slug) {
  renderEntry('music', slug, meta => `
    <span class="post-single-date">${meta.year ? esc(meta.year) : formatDate(meta.date)}</span>
    <h1 class="post-single-title">${esc(meta.title)}</h1>
    ${meta.artist ? `<p class="post-excerpt" style="margin-bottom:0.75rem">${esc(meta.artist)}</p>` : ''}
    ${meta.url ? `<a href="${esc(meta.url)}" class="all-link" target="_blank" rel="noopener noreferrer">Listen →</a>` : ''}
    ${renderTags(meta.tags, '#music')}
  `);
}

// ---------------------------------------------------------------------------
// Views — Photography
// ---------------------------------------------------------------------------

function renderPhotography(activeTag = null) {
  renderList('photography', 'Photography', p => `
    <li class="project-item">
      <span class="project-year">${esc(p.year || '')}</span>
      <div class="project-right">
        <p class="project-title"><a href="#photography/${p.slug}">${esc(p.title)}</a></p>
        ${p.location ? `<p class="project-desc">${esc(p.location)}</p>` : ''}
        ${renderTags(p.tags, '#photography')}
      </div>
    </li>
  `, activeTag);
}

function renderPhotoEntry(slug) {
  renderEntry('photography', slug, meta => `
    <span class="post-single-date">${meta.year ? esc(meta.year) : formatDate(meta.date)}</span>
    <h1 class="post-single-title">${esc(meta.title)}</h1>
    ${meta.location ? `<p class="post-excerpt" style="margin-bottom:0.75rem">${esc(meta.location)}</p>` : ''}
    ${meta.url ? `<a href="${esc(meta.url)}" class="all-link" target="_blank" rel="noopener noreferrer">View photos →</a>` : ''}
    ${renderTags(meta.tags, '#photography')}
  `);
}

// ---------------------------------------------------------------------------
// Views — About
// ---------------------------------------------------------------------------

function renderAbout() {
  setApp(`
    <div class="content-col">
      <p class="section-heading">About me</p>
      <div class="about-layout">
      <img class="about-photo" src="/images/about.jpg" alt="Oscar Montiel">
      <div class="about-body">
        <p>Hi, I'm Oscar — a product and project lead based in Paris, originally from Mexico City.</p>
        <p>For over ten years I've been building open-source, open-data, and civic-tech projects with international NGOs and research groups — the kind of work where the technology is there to serve something public. Most recently I designed and launched <a href="https://evaplatform.co" target="_blank" rel="noopener noreferrer">evaplatform.co</a> at the World Benchmarking Alliance, a self-assessment platform companies use to benchmark their sustainability.</p>
        <p>Before that I led the tech behind Ranking Digital Rights' Big Tech Scorecard, ran Latin America programs for The Engine Room, and spent a few years at the Open Knowledge Foundation working on open fiscal data — OpenSpending, CKAN, and a lot of time helping governments publish data people could actually use. Back in Mexico City I worked at at Codeando México, the Lab for the City, and in a previous life I also did bike and pedestrian activism.</p>
        <p>These days I mostly live in offline, but I still like writing code myself. (This site is a small experiment to test coding agents.)</p>
        <p>I studied psychology before any of this, which is probably why I care more about what people actually need than about whatever's technically shiny.</p>
        <p>I also love music, and sometimes I take photos.</p>
        <p>You can always reach out via <a href="mailto:me@oscarmontiel.net">email</a>.</p>
      </div>
      </div>
    </div>
  `);
}

// ---------------------------------------------------------------------------
// Router — parses ?tag= from the hash query string
// ---------------------------------------------------------------------------
function router() {
  const raw     = window.location.hash || '#thoughts';
  const [path, qs] = raw.slice(1).split('?');
  const parts   = path.split('/');
  const section = parts[0];
  const slug    = parts[1];
  const activeTag = new URLSearchParams(qs || '').get('tag') || null;

  document.querySelectorAll('.site-nav a').forEach(a => a.classList.remove('active'));
  const navKey     = (section === 'thoughts' || !section) ? 'thoughts' : section;
  const activeLink = document.getElementById(`nav-${navKey}`);
  if (activeLink) activeLink.classList.add('active');

  if      (section === 'thoughts' && slug === 'all') renderPostList(activeTag);
  else if (section === 'thoughts' && slug)           renderPost(slug);
  else if (section === 'thoughts' || !section)       renderHome();
  else if (section === 'projects'  && slug)          renderProjectEntry(slug);
  else if (section === 'projects')                   renderProjects(activeTag);
  else if (section === 'music'     && slug)          renderMusicEntry(slug);
  else if (section === 'music')                      renderMusic(activeTag);
  else if (section === 'photography' && slug)        renderPhotoEntry(slug);
  else if (section === 'photography')                renderPhotography(activeTag);
  else if (section === 'about')                      renderAbout();
  else                                               renderHome();
}

// ---------------------------------------------------------------------------
// Theme toggle — light/dark, persisted in localStorage (default: dark)
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.querySelector('.theme-toggle');
  if (!btn) return;
  const root = document.documentElement;
  const paint = () => {
    const isLight = root.getAttribute('data-theme') === 'light';
    btn.textContent = isLight ? '☾ Dark mode' : '☀ Light mode';
  };
  paint();
  btn.addEventListener('click', () => {
    const isLight = root.getAttribute('data-theme') === 'light';
    if (isLight) { root.removeAttribute('data-theme'); localStorage.setItem('theme', 'dark'); }
    else         { root.setAttribute('data-theme', 'light'); localStorage.setItem('theme', 'light'); }
    paint();
  });
});

window.addEventListener('hashchange', router);
document.addEventListener('DOMContentLoaded', router);
