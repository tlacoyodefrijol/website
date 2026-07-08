# website

Personal site — a small Express server that renders Markdown content as JSON,
with a vanilla-JS single-page front end. No framework, no build step beyond CSS
minification.

## Stack

- **Server** (`index.js`): Express serves `public/` and exposes read-only APIs
  for each content section — `GET /api/<section>` (list) and
  `GET /api/<section>/:slug` (one entry). Front matter is parsed with
  `gray-matter`.
- **Front end** (`public/`): `main.js` fetches those APIs, renders with hash
  routing (`#thoughts`, `#projects/slug`, `?tag=…`). Markdown is rendered
  client-side with `marked`.
- **Content**: Markdown files with YAML front matter in `posts/`, `projects/`,
  `music/`, `photography/`.

## Develop

```sh
npm install
npm run dev      # server + CSS watch
npm test         # vitest
```

`npm run css:build` minifies `src/style.css` → `public/style.min.css`.

## Add content

Drop a `.md` file in the relevant section directory:

```markdown
---
title: Hello World
date: 2026-07-08
tags: [notes]
description: A short summary.
---

Body in Markdown.
```

`date` sorts the list (newest first). `projects`/`music`/`photography` also use
`year`, and optional `url`, `artist`, `location`.

## Deploy

Push to `main` → GitHub Actions runs tests, builds CSS, and pushes to Gandi
Simple Hosting. See `.github/workflows/deploy.yml`.
