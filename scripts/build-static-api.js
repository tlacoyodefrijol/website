// Snapshot the /api/* endpoints as static files under public/api, so the
// site can be deployed to plain static hosting (no Node process needed).
// Mirrors mountSection() in index.js exactly — same shape, same sort order.
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root      = path.dirname(__dirname);
const outDir    = path.join(root, 'public', 'api');

async function buildSection(route, dir) {
  const files = await readdir(dir);
  const entries = await Promise.all(
    files
      .filter(f => f.endsWith('.md'))
      .map(async filename => {
        const raw = await readFile(path.join(dir, filename), 'utf8');
        const slug = path.basename(filename, '.md');
        const { data, content } = matter(raw);
        return { slug, data, content };
      })
  );
  entries.sort((a, b) => new Date(b.data.date) - new Date(a.data.date));

  const sectionDir = path.join(outDir, route);
  await mkdir(sectionDir, { recursive: true });

  // List endpoint — '/api/<route>.json'. Per-slug files live under
  // '/api/<route>/' — a sibling file+dir can't share the same name.
  await writeFile(`${path.join(outDir, route)}.json`, JSON.stringify(entries.map(e => e.data)));

  // Single-entry endpoints — '/api/<route>/<slug>.json'.
  for (const { slug, data, content } of entries) {
    await writeFile(path.join(sectionDir, `${slug}.json`), JSON.stringify({ meta: data, content }));
  }
}

await buildSection('posts',       path.join(root, 'posts'));
await buildSection('projects',    path.join(root, 'projects'));
await buildSection('music',       path.join(root, 'music'));
await buildSection('photography', path.join(root, 'photography'));

console.log(`Static API written to ${outDir}`);
