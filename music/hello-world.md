---
title: Hello World
date: 2026-03-17
slug: hello-world
artist: Your Artist Here
year: 2026
url: https://example.com
tags: [meta]
---

This is the first music entry. Edit or delete this file at `music/hello-world.md`.

To add a new entry, create a `.md` file in the `music/` directory:

```yaml
---
title: Album or Track Title
date: YYYY-MM-DD
slug: entry-slug
artist: Artist Name
year: 2024
url: https://example.com
tags: [electronic, ambient]
---
```

The filename should match the `slug` field (e.g. `slug: favourite-record` → `music/favourite-record.md`).

## Writing about music

Use this space for anything — liner notes, a memory, why this record matters to you.

- **artist** is shown as a subtitle in the list and entry views
- **url** links to an external page (shown as "Listen →" on the entry page)
- **year** is shown in the list view instead of the full date
- **tags** make the list filterable
