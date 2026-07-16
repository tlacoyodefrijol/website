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
