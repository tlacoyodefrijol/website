# Footer, post background, and related posts

Adopts the information structure from three Figma template pages (Landing,
Article, About — `figma.com/design/yz6HpcL1iAueiIeGOVq9jH`) into the real
site, restyled with the site's own design tokens instead of Figma's generic
template look. Source: About page had a "Contact me" form (dropped, see
below); Article page had a nav header, title/hero/body, a "Related articles
or posts" card grid, a "Post background" layer sitting behind all the text
content, and a shared "Navigation / Footer" component with site name, two
nav-link columns, and social icons; that same footer component also appears
on Landing and About.

## Out of scope

- **Contact form.** Figma's About page has First/Last name, email, and
  message fields with a Submit button. The site has no form-handling
  infrastructure (static Express server, no email backend). Decided the
  footer's contact info (email, social links) is enough — no form gets
  built.
- **About page changes.** Stays exactly as it is today: photo, bio text,
  inline `mailto:` link. No animated background, no `.post-textbg` panel —
  that treatment is post-page-only, matching current behavior.
- **Figma's generic visual style.** Colors, fonts, tag pills, button styles
  all come from the site's existing design tokens, never from Figma (which
  uses lorem ipsum, stock photos, and default black buttons — a starter
  template, not a customized design).

## 1. Sitewide footer

New `renderFooter()` in `public/main.js`, returning static HTML (no fetch —
every value is already known client-side). Called once inside `setApp()`
(`public/main.js:19`), the single function every `render*` function already
routes through — so every page gets the footer with no per-page wiring.

Content:
- **Site name** — "Oscar Montiel", styled like the header's `.site-name`.
- **Two nav columns** — the existing site sections (Thoughts, Projects,
  Music, Photography, About) split across two columns. Real routes already
  in the router; no new content to maintain.
- **Social icons** — GitHub + Email from the existing `SOCIAL_LINKS`
  constant (`public/main.js`), rendered as small inline SVG icons instead
  of text links. No icon-font dependency.
- **Divider** — `border-top: 1px solid var(--border)` separating it from
  page content above.

Styling: existing tokens only. `var(--surface)` background, `var(--border)`
divider, `var(--text-muted)` link color with `#e76f51` hover (matches every
other link on the site already), `var(--font-title)` for the site name. No
new colors introduced.

## 2. Post background (readability panel)

Currently `.post-cover` (the full-bleed band that scrolls over the sticky
hero) is translucent — `color-mix(in srgb, var(--bg) 55%, transparent)` —
so the animated Ecobici background shows through everywhere behind post
content, including behind text. That's the bug being fixed here: too
colorful behind text, hurts readability.

Fix: a new inner wrapper, `.post-textbg`, sits inside `.post-cover` and
wraps only the text-bearing elements — article title, subheading,
paragraphs, and the related-posts section. It does **not** wrap the hero
image (already its own photo) or the footer (footer already has its own
opaque `--surface` background regardless of what page it's on).

```
.post-cover              (full-bleed, 55% translucent — animation visible)
  .post-textbg           (centered column, ~92% opaque, padded, rounded)
    article title
    subheading
    paragraphs
    related-posts section
(hero image — outside .post-textbg, above it in the document)
footer                   (opaque, unrelated to any of this)
```

`.post-textbg` background: `color-mix(in srgb, var(--bg) 92%, transparent)`
— text stays crisply readable; a faint hint of the animation still shows
through, consistent with the translucent treatment elsewhere rather than a
hard cut to fully solid. Rounded corners + padding so it reads as one
deliberate panel, not an accidental box.

## 3. Related posts

New `relatedPosts(currentSlug, currentTags, allPosts)` helper in
`public/main.js`, used by `renderPost()`.

Logic:
1. `renderPost()` already fetches the single post; it now also fetches
   `/api/thoughts` (the list endpoint already used by the homepage and post
   list) to get all posts.
2. Filter out the current post.
3. Rank remaining posts by number of shared tags with the current post
   (descending), tie-broken by date (newest first).
4. Take the top 3.
5. If the result is empty (true today, with one post on the site), the
   `<section class="related-posts">` doesn't render at all — no empty
   heading, no placeholder cards.

Markup and styling reuse the **existing** `.post-card` component (image,
date, title, excerpt, tag pills) already used on the homepage — not
Figma's plain "Subheading + body text" card style, so related posts look
like the rest of the site rather than introducing a second card design.

Heading: "Related posts", using the existing `.section-heading` style
(same treatment as "Thoughts" on the homepage).

## Files touched

- `public/main.js` — `renderFooter()`, `.post-textbg` wrapper in
  `renderPost()`'s output, `relatedPosts()` helper + its call site.
- `src/style.css` — footer styles, `.post-textbg`, `.related-posts`
  section heading spacing (reuses `.post-card` — no new card CSS).
- `public/style.min.css` — rebuilt via `npm run css:build`.

## Implementation notes

Built directly from this spec (skipped a separate implementation-plan
document per user instruction — this section is the record of what
actually happened, written after the fact instead of planned before it).

**Footer** — `public/index.html:38` gets a static `<footer id="site-footer">`
placeholder, a sibling of `#app` rather than injected by `setApp()` on
every route change. Reasoning: the footer's content is 100% static (no
per-page data), so re-rendering it on every navigation would only risk a
loading-state flash for zero benefit. `renderFooter()` in `main.js` runs
once on `DOMContentLoaded` instead.

Deviation from the spec's "two nav columns": `index.html`'s `.site-nav`
currently has Projects/Music/Photography commented out ("Hidden
2026-07-08 ... routes/render code still live in main.js; uncomment to
restore"), leaving only Thoughts and About actually live. Built the
footer's `FOOTER_LINKS` to mirror that — two links, one row, not two
columns of a fuller sitemap — rather than resurrecting hidden sections in
the footer that aren't in the header. `FOOTER_LINKS` is a small array
literal in `main.js`; uncommenting the header nav and adding entries there
is a one-line addition, not a redesign.

Social icons: hand-rolled inline SVGs (GitHub mark, envelope) in a
`FOOTER_ICONS` map keyed by the existing `SOCIAL_LINKS` labels — no icon
font/library dependency.

**Post background** — implemented as a style change to the *existing*
`.post-cover .post-single` selector rather than a new `.post-textbg`
wrapper element. `.post-single` inside `.post-cover` already contains
exactly the text-bearing content (title, tags, body, related posts, prev/
next nav) and excludes the hero image (a sibling, outside `.post-cover`)
and the footer (outside `#app` entirely) — so it already had the right
boundaries; it just needed a background. Added
`color-mix(in srgb, var(--bg) 92%, transparent)` and `border-radius: 12px`
to that rule instead of introducing a new div. Verified in-browser (both
themes): text is crisply readable, the animated background stays visible
in the margins on either side of the content column.

**Related posts** — implemented as specified: `relatedPosts()` ranks by
shared-tag count then recency, top 3, and `renderPost()` fetches
`/api/thoughts` (already fetched there for the "Next" link — extended the
same `try` block rather than adding a second fetch). Extracted the
homepage's inline post-card markup into a shared `postCard()` function
used by both `renderHome()` and the new related-posts section, so they
can't visually drift apart. Confirmed empty-state: with one post on the
site today, the section correctly doesn't render.

**About page** — untouched, per the "leave it as-is" decision.

**Verification**: `npm test` — 66/66 passing. Checked in-browser (dev
server) on home, the hello-world post, and About, in both dark and light
themes: footer renders on all three, post-background panel reads cleanly
against the animation, related-posts section is absent (as expected with
one post). Not yet committed/pushed — holding per established workflow
until asked.

### Follow-up round

Three more requests landed after the initial build, all implemented and
verified the same way:

1. **`.post-single` was still only 92% opaque** — changed to a fully
   solid `background: var(--bg)` (`src/style.css`), matching the fully
   solid treatment given to home-page cards below. Text now sits on
   completely solid ground; the animation is still visible in the margins
   around the panel, which was the actual goal.
2. **Home-page post cards were fully transparent** — `.post-card` had no
   `background` at all, so it sat directly over the animated canvas.
   Added `background: var(--surface)` — the same token already used for
   the footer and tag pills, one line, no new color introduced. This also
   improves the related-posts cards for free, since they reuse
   `.post-card`.
3. **Removed the GitHub/Email text links from the home hero** — deleted
   `renderHome()`'s `socialHtml` block and the now-dead `.social-links`
   CSS. Made the footer's social icons the sole home for these links and
   more prominent: 40px circular buttons with a border, instead of small
   18px bare icons, with a tinted hover state matching the site's accent
   color.
