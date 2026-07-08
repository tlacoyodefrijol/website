import express from 'express';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// GET /ping — health check
app.get('/ping', (_req, res) => res.send('pong'));

/**
 * Mount list + single-entry routes for a markdown content directory.
 *   GET /api/<route>       → sorted list of frontmatter objects
 *   GET /api/<route>/:slug → { meta, content } for one entry
 */
function mountSection(route, dir) {
  // List
  app.get(`/api/${route}`, async (_req, res) => {
    const files = await readdir(dir);
    const items = await Promise.all(
      files
        .filter(f => f.endsWith('.md'))
        .map(async filename => {
          const raw = await readFile(path.join(dir, filename), 'utf8');
          return matter(raw).data;
        })
    );
    items.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(items);
  });

  // Single entry
  app.get(`/api/${route}/:slug`, async (req, res) => {
    const slug     = path.basename(req.params.slug);
    const filepath = path.join(dir, `${slug}.md`);
    try {
      const raw = await readFile(filepath, 'utf8');
      const { data, content } = matter(raw);
      res.json({ meta: data, content });
    } catch (err) {
      if (err.code === 'ENOENT') return res.status(404).json({ error: 'Not found' });
      throw err;
    }
  });
}

mountSection('posts',       path.join(__dirname, 'posts'));
mountSection('projects',    path.join(__dirname, 'projects'));
mountSection('music',       path.join(__dirname, 'music'));
mountSection('photography', path.join(__dirname, 'photography'));

// Export app for testing (supertest handles its own listen)
export { app };

// Only start the server when run directly, not during tests
if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
}
